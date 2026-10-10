/**
 * Centralized Idempotency & Concurrency Guard for ERP Transactions
 * Prevents double-submission, race conditions, and duplicate ledger/inventory entries.
 */

// Memory registry for in-flight requests and recent executed actions
const inFlightTokens = new Set<string>();
const completedActionCache = new Map<string, { timestamp: number; result?: any }>();
const CACHE_TTL_MS = 60000; // 1 minute retention for duplicate action suppression

export interface IdempotencyOptions {
  ttlMs?: number;
  preventDuplicateWithinMs?: number;
}

export class IdempotencyGuard {
  /**
   * Generates a deterministic or random idempotency key for ERP operations
   */
  static generateKey(prefix: string, ...identifiers: Array<string | number | undefined | null>): string {
    const cleanIds = identifiers.filter((id) => id !== undefined && id !== null && id !== "").join("_");
    return cleanIds ? `${prefix}:${cleanIds}` : `${prefix}:${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Checks if an action with this key is currently executing
   */
  static isInFlight(key: string): boolean {
    return inFlightTokens.has(key);
  }

  /**
   * Checks if an identical action was recently completed to prevent duplicate submissions
   */
  static isRecentlyCompleted(key: string, thresholdMs: number = 3000): boolean {
    const entry = completedActionCache.get(key);
    if (!entry) return false;
    return Date.now() - entry.timestamp < thresholdMs;
  }

  /**
   * Safely executes an async transactional action with strict idempotency lock
   */
  static async execute<T>(
    key: string,
    action: () => Promise<T>,
    options: IdempotencyOptions = {}
  ): Promise<{ success: boolean; data?: T; isDuplicate?: boolean; error?: Error }> {
    const { preventDuplicateWithinMs = 3000 } = options;

    // 1. Prevent concurrent in-flight duplication
    if (inFlightTokens.has(key)) {
      console.warn(`[IdempotencyGuard] Blocked duplicate in-flight action for key: ${key}`);
      return { success: false, isDuplicate: true };
    }

    // 2. Prevent recent completed duplicates within threshold
    if (this.isRecentlyCompleted(key, preventDuplicateWithinMs)) {
      console.warn(`[IdempotencyGuard] Blocked repeated action within debounce window for key: ${key}`);
      const cached = completedActionCache.get(key);
      return { success: true, data: cached?.result as T, isDuplicate: true };
    }

    // 3. Acquire lock
    inFlightTokens.add(key);

    try {
      const result = await action();
      
      // Store in completed cache
      completedActionCache.set(key, {
        timestamp: Date.now(),
        result,
      });

      // Cleanup old cache entries
      this.pruneCache();

      return { success: true, data: result, isDuplicate: false };
    } catch (err: any) {
      console.error(`[IdempotencyGuard] Execution failed for key: ${key}`, err);
      return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
    } finally {
      // Release lock
      inFlightTokens.delete(key);
    }
  }

  private static pruneCache(): void {
    const now = Date.now();
    for (const [k, v] of completedActionCache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MS) {
        completedActionCache.delete(k);
      }
    }
  }
}
