import { io, Socket } from "socket.io-client";
import { invalidateSmartCache } from "./smartCache";

export type CmsPageKey = "public" | "shop" | "careers" | string;

interface CmsBroadcastEnvelope {
  page: string;
  data: any;
  updatedAt: number;
}

const CHANNEL_NAME = "pavingjoss_cms_live_channel";
const STORAGE_PREFIX = "pavingjoss_cms_live_v1_";

const latestCmsMemory = new Map<string, CmsBroadcastEnvelope>();
const pageListeners = new Map<string, Set<(data: any) => void>>();

let sharedBroadcastChannel: BroadcastChannel | null = null;
let sharedSocket: Socket | null = null;
let initializedGlobalListeners = false;

function notifyLocalListeners(page: string, data: any, updatedAt = Date.now()) {
  const key = String(page || "").trim().toLowerCase();
  if (!key || !data || typeof data !== "object") return;

  const current = latestCmsMemory.get(key);
  if (current && current.updatedAt > updatedAt) {
    return;
  }

  latestCmsMemory.set(key, { page: key, data, updatedAt });
  invalidateSmartCache(`/api/cms/${key}`);

  const listeners = pageListeners.get(key);
  if (listeners) {
    listeners.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.warn("[cmsLiveSync] Listener error:", err);
      }
    });
  }
}

function ensureGlobalSyncInitialized() {
  if (initializedGlobalListeners || typeof window === "undefined") return;
  initializedGlobalListeners = true;

  // 1. Browser-native BroadcastChannel (< 3ms across tabs in same browser)
  if (typeof BroadcastChannel !== "undefined") {
    try {
      sharedBroadcastChannel = new BroadcastChannel(CHANNEL_NAME);
      sharedBroadcastChannel.onmessage = (event: MessageEvent<CmsBroadcastEnvelope>) => {
        const payload = event?.data;
        if (payload && payload.page && payload.data) {
          notifyLocalListeners(payload.page, payload.data, payload.updatedAt);
        }
      };
    } catch {
      sharedBroadcastChannel = null;
    }
  }

  // 2. Window storage event fallback for cross-window instant sync
  window.addEventListener("storage", (e: StorageEvent) => {
    if (!e.key || !e.key.startsWith(STORAGE_PREFIX) || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as CmsBroadcastEnvelope;
      if (parsed && parsed.page && parsed.data) {
        notifyLocalListeners(parsed.page, parsed.data, parsed.updatedAt);
      }
    } catch {}
  });

  // 3. Real-time WebSocket (Socket.IO) listener for server-authoritative push (< 20ms across devices)
  try {
    const token = localStorage.getItem("erp_token") || undefined;
    sharedSocket = io(window.location.origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: token ? { token } : undefined,
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
    });

    sharedSocket.on("cms:updated", (payload: CmsBroadcastEnvelope) => {
      if (payload && payload.page && payload.data) {
        try {
          localStorage.setItem(
            `${STORAGE_PREFIX}${payload.page.toLowerCase()}`,
            JSON.stringify(payload),
          );
        } catch {}
        notifyLocalListeners(payload.page, payload.data, payload.updatedAt || Date.now());
      }
    });
  } catch {
    // Non-fatal if socket is unavailable
  }
}

/**
 * Broadcasts CMS changes immediately (0-3ms) to all active tabs, components, and caches.
 */
export function broadcastCmsUpdate(page: CmsPageKey, data: any): void {
  ensureGlobalSyncInitialized();
  const key = String(page || "").trim().toLowerCase();
  const envelope: CmsBroadcastEnvelope = {
    page: key,
    data,
    updatedAt: Date.now(),
  };

  // 1. Update in-memory & current tab subscribers immediately (0ms)
  notifyLocalListeners(key, data, envelope.updatedAt);

  // 2. Persist & trigger cross-tab storage event (1-2ms)
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(envelope));
    } catch {}
  }

  // 3. Post to BroadcastChannel (1-3ms)
  if (sharedBroadcastChannel) {
    try {
      sharedBroadcastChannel.postMessage(envelope);
    } catch {}
  }
}

/**
 * Retrieves the most recent CMS snapshot from memory or localStorage if available.
 */
export function getLatestCmsSnapshot<T = any>(page: CmsPageKey): T | null {
  ensureGlobalSyncInitialized();
  const key = String(page || "").trim().toLowerCase();
  const mem = latestCmsMemory.get(key);
  if (mem?.data) return mem.data as T;

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CmsBroadcastEnvelope;
        if (parsed && parsed.data && typeof parsed.data === "object") {
          latestCmsMemory.set(key, parsed);
          return parsed.data as T;
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Records a freshly fetched server CMS response into the live snapshot store.
 */
export function recordServerCmsSnapshot(page: CmsPageKey, data: any): void {
  const key = String(page || "").trim().toLowerCase();
  if (!key || !data || typeof data !== "object") return;
  const envelope: CmsBroadcastEnvelope = {
    page: key,
    data,
    updatedAt: Date.now(),
  };
  latestCmsMemory.set(key, envelope);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(envelope));
    } catch {}
  }
}

/**
 * Subscribes a React component to instant CMS updates for the given page key.
 */
export function subscribeToCmsUpdates<T = any>(
  page: CmsPageKey,
  callback: (data: T) => void,
): () => void {
  ensureGlobalSyncInitialized();
  const key = String(page || "").trim().toLowerCase();
  if (!pageListeners.has(key)) {
    pageListeners.set(key, new Set());
  }
  const set = pageListeners.get(key)!;
  set.add(callback);

  return () => {
    set.delete(callback);
  };
}
