import { io, Socket } from "socket.io-client";
import { invalidateSmartCache } from "./smartCache";

export interface CatalogSyncEvent {
  itemId?: string;
  action?: string;
  updatedAt: number;
}

const CHANNEL_NAME = "pavingjoss_shop_catalog_live_channel";
const STORAGE_KEY = "pavingjoss_shop_catalog_live_v1";

const catalogListeners = new Set<(event: CatalogSyncEvent) => void>();

let sharedChannel: BroadcastChannel | null = null;
let sharedSocket: Socket | null = null;
let initialized = false;
let lastHandledTimestamp = 0;

function invalidateAllCatalogCaches() {
  invalidateSmartCache("/api/shop/products");
  invalidateSmartCache("/api/public/showcase");
  invalidateSmartCache("/api/public/products");
  invalidateSmartCache("/api/erp/shop-management/catalog");
}

function notifySubscribers(event: CatalogSyncEvent) {
  const ts = event.updatedAt || Date.now();
  // Deduplicate identical millisecond echoes across Socket.IO + BroadcastChannel
  if (ts < lastHandledTimestamp) {
    return;
  }
  lastHandledTimestamp = ts;

  invalidateAllCatalogCaches();

  catalogListeners.forEach((cb) => {
    try {
      cb(event);
    } catch (err) {
      console.warn("[shopLiveSync] Subscriber error:", err);
    }
  });
}

function ensureInitialized() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  // 1. BroadcastChannel for instant (<3ms) same-browser tab sync
  if (typeof BroadcastChannel !== "undefined") {
    try {
      sharedChannel = new BroadcastChannel(CHANNEL_NAME);
      sharedChannel.onmessage = (e: MessageEvent<CatalogSyncEvent>) => {
        if (e?.data && typeof e.data === "object") {
          notifySubscribers(e.data);
        }
      };
    } catch {
      sharedChannel = null;
    }
  }

  // 2. Storage event fallback across windows/tabs
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as CatalogSyncEvent;
      if (parsed && typeof parsed === "object") {
        notifySubscribers(parsed);
      }
    } catch {}
  });

  // 3. Socket.IO push from backend (server-authoritative)
  try {
    const token = localStorage.getItem("erp_token") || undefined;
    sharedSocket = io(window.location.origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: token ? { token } : undefined,
      reconnectionAttempts: 8,
      reconnectionDelay: 1500,
    });

    sharedSocket.on("shop:catalog_updated", (payload: CatalogSyncEvent) => {
      const normalized: CatalogSyncEvent = {
        itemId: payload?.itemId,
        action: payload?.action || "CATALOG_UPDATED",
        updatedAt: payload?.updatedAt || Date.now(),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      } catch {}
      notifySubscribers(normalized);
    });
  } catch {
    // Non-fatal if WebSocket is unavailable
  }
}

/**
 * Broadcasts catalog & gallery updates immediately to all active Shop & ERP tabs.
 */
export function broadcastCatalogUpdate(itemId?: string, action = "CATALOG_UPDATED"): void {
  ensureInitialized();
  const payload: CatalogSyncEvent = {
    itemId,
    action,
    updatedAt: Date.now(),
  };

  notifySubscribers(payload);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

  if (sharedChannel) {
    try {
      sharedChannel.postMessage(payload);
    } catch {}
  }
}

/**
 * Subscribes a React component to instant catalog & gallery updates.
 */
export function subscribeToCatalogUpdates(
  callback: (event: CatalogSyncEvent) => void,
): () => void {
  ensureInitialized();
  catalogListeners.add(callback);
  return () => {
    catalogListeners.delete(callback);
  };
}
