import { io, type Socket } from "socket.io-client";

/**
 * ============================================================================
 * PAVING JOSS MOBILE API CLIENT & POSTGRESQL BRIDGE GATEWAY
 * ============================================================================
 * Connects Android & iOS mobile apps directly to the Web ERP & HRIS server
 * and its unified PostgreSQL + SQLite WAL database engine.
 *
 * Mandatory Mobile Headers:
 * - Authorization: Bearer <JWT_TOKEN>
 * - X-Client-Platform: mobile-app
 * - X-Mobile-OS: android | ios
 * - X-Idempotency-Key: <UUID> (for mutations)
 */

export const ERP_API_BASE_URL =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_ERP_API_URL) ||
  "";

const SESSION_STORAGE_KEY = "paving_joss_mobile_session_v1";
const OFFLINE_QUEUE_KEY = "paving_joss_mobile_offline_queue_v1";

export type MobileAppScope = "OPERATOR_MOBILE" | "BACKOFFICE_MOBILE";

export type HubCategory =
  | "APPROVALS"
  | "PROJECTS"
  | "INVENTORY"
  | "PROCUREMENT"
  | "QUOTATIONS"
  | "DELIVERIES"
  | "CONTACTS"
  | "FINANCE";

export interface MobileUserSession {
  token: string;
  app_scope: MobileAppScope;
  allowed_modules: string[];
  user: {
    id: string;
    username: string;
    name: string;
    role: string;
    level?: string;
    employee_no?: string;
    work_center_id?: string;
  };
  manpower?: any | null;
  assigned_machine?: any | null;
}

export interface OfflineQueuedRequest {
  id: string;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH";
  body: any;
  created_at: string;
}

export function getSavedMobileSession(): MobileUserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MobileUserSession;
  } catch {
    return null;
  }
}

export function saveMobileSession(session: MobileUserSession | null): void {
  try {
    if (!session) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore storage errors
  }
}

export function getOfflineQueue(): OfflineQueuedRequest[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineQueuedRequest[];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: OfflineQueuedRequest[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore storage errors
  }
}

export function enqueueOfflineMutation(
  endpoint: string,
  method: "POST" | "PUT" | "PATCH",
  body: any,
): OfflineQueuedRequest {
  const item: OfflineQueuedRequest = {
    id: `OFF-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    endpoint,
    method,
    body,
    created_at: new Date().toISOString(),
  };
  const current = getOfflineQueue();
  current.push(item);
  saveOfflineQueue(current);
  return item;
}

export async function flushOfflineQueue(): Promise<{
  flushed: number;
  remaining: number;
}> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  const remaining: OfflineQueuedRequest[] = [];
  let flushed = 0;

  for (const item of queue) {
    const res = await mobileFetch(item.endpoint, {
      method: item.method,
      body: JSON.stringify(item.body),
      skipOfflineQueue: true,
    });
    if (res.ok) {
      flushed++;
    } else {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  return { flushed, remaining: remaining.length };
}

export function getDailyAuthPinForUser(username: string): string {
  const cleanUser = (username || "user").trim().toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const seed = `${cleanUser}:${today}:PAVING_JOSS_AUTH`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000000;
  }
  return String(Math.abs(hash)).padStart(6, "0");
}

interface MobileFetchOptions extends RequestInit {
  skipOfflineQueue?: boolean;
}

export async function mobileFetch<T = any>(
  endpoint: string,
  options: MobileFetchOptions = {},
): Promise<{ ok: boolean; status: number; data?: T; error?: string; queued?: boolean }> {
  const session = getSavedMobileSession();
  const method = (options.method || "GET").toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH"].includes(method);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Client-Platform": "mobile-app",
    "X-Mobile-OS": /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? "ios"
      : "android",
    ...(options.headers as Record<string, string>),
  };

  if (session?.token) {
    headers["Authorization"] = `Bearer ${session.token}`;
  }
  if (session?.user?.username) {
    headers["X-Actor-Username"] = session.user.username;
  }
  if (isMutation && !headers["X-Idempotency-Key"]) {
    headers["X-Idempotency-Key"] = `MOB-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}`;
  }

  try {
    const response = await fetch(`${ERP_API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: json?.error || json?.message || `HTTP ${response.status}`,
      };
    }

    return { ok: true, status: response.status, data: json as T };
  } catch (err: any) {
    if (isMutation && !options.skipOfflineQueue && options.body) {
      try {
        const parsedBody = JSON.parse(String(options.body));
        enqueueOfflineMutation(
          endpoint,
          method as "POST" | "PUT" | "PATCH",
          parsedBody,
        );
        return {
          ok: true,
          status: 202,
          queued: true,
          data: { queued_offline: true } as unknown as T,
        };
      } catch {
        // fallback error below
      }
    }
    return {
      ok: false,
      status: 0,
      error: err?.message || "Jaringan tidak tersedia (Offline Mode)",
    };
  }
}

export const MobileApi = {
  /** 1. Auth & Bootstrap */
  login: (username: string, password: string) =>
    mobileFetch<MobileUserSession & { success: boolean }>(
      "/api/mobile/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password, platform: "Android/iOS" }),
        skipOfflineQueue: true,
      },
    ),

  getBootstrap: () => mobileFetch("/api/mobile/bootstrap"),

  /** 2. PostgreSQL Database Parity & Sync Bridge */
  getDatabaseStatus: () => mobileFetch("/api/mobile/db-status"),

  triggerPostgresSync: () =>
    mobileFetch("/api/mobile/postgres/sync", {
      method: "POST",
      body: JSON.stringify({ source: "mobile-app" }),
      skipOfflineQueue: true,
    }),

  /** 3. 2-Way Shop Floor (Supervisor <-> Operator) */
  getShopFloorWorkstation: (projectId?: string) =>
    mobileFetch(
      `/api/mobile/shopfloor/workstation${
        projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""
      }`,
    ),

  replyShopFloorNote: (payload: {
    thread_id?: string;
    project_id?: string;
    wot_id?: string;
    content: string;
  }) =>
    mobileFetch("/api/mobile/shopfloor/thread-reply", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  triggerShopFloorQuickAction: (payload: {
    action_type:
      | "WOT_STATUS"
      | "FLOOR_REQUEST"
      | "REPORT_NDP"
      | "SHIFT_HANDOVER";
    project_id?: string;
    wot_id?: string;
    status?: "IN_PROGRESS" | "PAUSED" | "COMPLETED";
    good_qty?: number;
    scrap_qty?: number;
    request_type?: "MATERIAL" | "TOOLING";
    item_name?: string;
    quantity?: number;
    urgency?: "NORMAL" | "HIGH" | "CRITICAL";
    machine_id?: string;
    reason?: string;
    notes?: string;
    shift?: string;
  }) =>
    mobileFetch("/api/mobile/shopfloor/quick-action", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** 4. ESS (Absensi, Cuti, Slip Gaji, KPI, Lembur) */
  getEssSummary: () => mobileFetch("/api/mobile/ess-summary"),

  clockAttendance: (payload: {
    action: "CLOCK_IN" | "CLOCK_OUT";
    latitude?: number;
    longitude?: number;
    location_name?: string;
    notes?: string;
  }) =>
    mobileFetch("/api/hr/attendance/clock", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  submitLeaveRequest: (payload: {
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string;
  }) =>
    mobileFetch("/api/hr/leaves", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** 5. Team Messages, Forum & Technical Document Attachment */
  getChatThreads: () => mobileFetch("/api/chat/threads"),

  getChatMessages: (threadId: string) =>
    mobileFetch(`/api/chat/threads/${encodeURIComponent(threadId)}/messages`),

  sendChatMessage: (payload: {
    thread_id: string;
    content: string;
    file_url?: string;
    file_name?: string;
    file_type?: string;
  }) =>
    mobileFetch("/api/chat/messages", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** 6. Back-Office MobileMonitorHub (Full ERP & HRIS Mobile Suite) */
  getBackOfficeHubData: () => mobileFetch("/api/mobile/backoffice/hub"),

  getPendingApprovals: () => mobileFetch("/api/mobile/approvals/pending"),

  authorizeDocumentWithPin: (payload: {
    doc_type:
      | "PR"
      | "PO"
      | "QUOTATION"
      | "DELIVERY"
      | "HR_LEAVE"
      | "PROJECT_SPK";
    doc_id: string;
    action: "APPROVE" | "REVISE" | "REJECT";
    pin: string;
    notes?: string;
  }) =>
    mobileFetch("/api/mobile/backoffice/authorize", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

/**
 * Real-Time 2-Way Socket.IO Bridge
 * Listens to `production:updated`, `chat:message`, and `workflow:updated`
 */
export function connectMobileSocket(
  onProductionUpdate?: (payload: any) => void,
  onChatMessage?: (payload: any) => void,
  onWorkflowUpdate?: (payload: any) => void,
): Socket {
  const session = getSavedMobileSession();
  const socket = io(ERP_API_BASE_URL || window.location.origin, {
    auth: {
      token: session?.token || "",
      platform: "mobile-app",
    },
    transports: ["websocket", "polling"],
  });

  if (onProductionUpdate) {
    socket.on("production:updated", onProductionUpdate);
  }
  if (onChatMessage) {
    socket.on("chat:message", onChatMessage);
  }
  if (onWorkflowUpdate) {
    socket.on("workflow:updated", onWorkflowUpdate);
  }

  return socket;
}
