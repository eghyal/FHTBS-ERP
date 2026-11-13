/**
 * Smart Cache Engine (Stale-While-Revalidate + Request Deduplication + SessionStorage Persistence)
 * Designed to eliminate redundant network waterfalls on mobile & desktop across Public, Shop, ERP, and HRIS.
 */

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<any>>();
const STORAGE_PREFIX = 'fhtbs_sc_v1:';

/**
 * Retrieve cached data synchronously if available (from memory first, then sessionStorage).
 */
export function getCachedData<T = any>(key: string, maxAgeMs = 5 * 60 * 1000): { data: T | null; isFresh: boolean } {
  const now = Date.now();
  const mem = memoryCache.get(key);
  if (mem) {
    return {
      data: mem.data as T,
      isFresh: now - mem.timestamp < maxAgeMs,
    };
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const parsed: CacheEntry<T> = JSON.parse(raw);
      if (parsed && parsed.timestamp) {
        memoryCache.set(key, parsed);
        return {
          data: parsed.data,
          isFresh: now - parsed.timestamp < maxAgeMs,
        };
      }
    }
  } catch {
    // Ignore storage quota or private browsing errors
  }

  return { data: null, isFresh: false };
}

/**
 * Store data into memory cache and sessionStorage (if small enough).
 */
export function setCachedData<T = any>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  memoryCache.set(key, entry);
  try {
    const serialized = JSON.stringify(entry);
    // Avoid exceeding sessionStorage limits for very large payloads (>350KB)
    if (serialized.length < 350_000) {
      sessionStorage.setItem(STORAGE_PREFIX + key, serialized);
    }
  } catch {
    // Ignore quota errors
  }
}

/**
 * Invalidate specific cache keys or prefix patterns (e.g. after POST/PUT/DELETE mutations).
 */
export function invalidateSmartCache(keyOrPrefix?: string): void {
  if (!keyOrPrefix) {
    memoryCache.clear();
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(k);
      });
    } catch {}
    return;
  }

  for (const key of Array.from(memoryCache.keys())) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      memoryCache.delete(key);
    }
  }

  try {
    Object.keys(sessionStorage).forEach((k) => {
      if (k.startsWith(STORAGE_PREFIX)) {
        const rawKey = k.slice(STORAGE_PREFIX.length);
        if (rawKey === keyOrPrefix || rawKey.startsWith(keyOrPrefix)) {
          sessionStorage.removeItem(k);
        }
      }
    });
  } catch {}
}

/**
 * Fetch JSON with request deduplication, stale-while-revalidate (SWR), and optional background callback.
 */
export async function fetchJsonWithSmartCache<T = any>(
  url: string,
  options?: {
    ttlMs?: number;
    forceRefresh?: boolean;
    onRevalidate?: (freshData: T) => void;
    fetchInit?: RequestInit;
  }
): Promise<T> {
  const ttlMs = options?.ttlMs ?? 45_000; // 45s fresh window by default
  const forceRefresh = options?.forceRefresh ?? false;

  if (!forceRefresh) {
    const cached = getCachedData<T>(url, ttlMs);
    if (cached.data !== null) {
      if (cached.isFresh) {
        return cached.data;
      }
      // Stale-While-Revalidate: return cached data immediately and revalidate in background
      triggerNetworkFetch<T>(url, options?.fetchInit)
        .then((freshData) => {
          if (options?.onRevalidate) {
            options.onRevalidate(freshData);
          }
        })
        .catch(() => {});
      return cached.data;
    }
  }

  return triggerNetworkFetch<T>(url, options?.fetchInit);
}

async function triggerNetworkFetch<T = any>(url: string, fetchInit?: RequestInit): Promise<T> {
  const existing = inFlightRequests.get(url);
  if (existing) {
    return existing as Promise<T>;
  }

  const requestPromise = fetch(url, fetchInit)
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} on ${url}`);
      }
      const data = (await res.json()) as T;
      setCachedData(url, data);
      return data;
    })
    .finally(() => {
      inFlightRequests.delete(url);
    });

  inFlightRequests.set(url, requestPromise);
  return requestPromise;
}

/**
 * Schedule low-priority work when the browser main thread is idle (critical for mobile responsiveness).
 */
export function scheduleWhenIdle(callback: () => void, timeoutMs = 1500): () => void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const id = (window as any).requestIdleCallback(callback, { timeout: timeoutMs });
    return () => (window as any).cancelIdleCallback(id);
  }
  const timer = setTimeout(callback, 350);
  return () => clearTimeout(timer);
}
