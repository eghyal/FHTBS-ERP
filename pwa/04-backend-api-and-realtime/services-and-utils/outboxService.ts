import crypto from "crypto";
import db, { registerWriteThroughWakeHandler } from "../db/database.ts";
import { replicateToPostgres, deleteFromPostgres } from "../db/postgresBridge.ts";

export type OutboxOperation = "UPSERT" | "DELETE" | "CREATE" | "UPDATE" | string;
export type OutboxDestination = "FIRESTORE" | "POSTGRES" | "BOTH" | "ALL" | string;

export interface OutboxEventRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload_json: string;
  destination: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "DEAD_LETTER" | string;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
}

const MAX_RETRIES = 5;
let workerInterval: NodeJS.Timeout | null = null;
let immediateFlushTimer: NodeJS.Timeout | null = null;
let isProcessing = false;
let pendingImmediateWake = false;

let writeThroughFlushesCount = 0;
let lastWriteThroughLatencyMs = 0;
let lastWriteThroughAt: string | null = null;

/**
 * Schedules a near-instantaneous (35ms coalesced) Write-Through flush from SQLite WAL
 * to PostgreSQL Primary SSOT whenever any table mutation occurs.
 */
export function scheduleImmediateWriteThrough() {
  if (immediateFlushTimer) return;
  immediateFlushTimer = setTimeout(() => {
    immediateFlushTimer = null;
    if (isProcessing) {
      pendingImmediateWake = true;
      return;
    }
    const start = Date.now();
    processOutboxBatch(50)
      .then((res) => {
        if (res.succeeded > 0) {
          writeThroughFlushesCount += res.succeeded;
          lastWriteThroughLatencyMs = Date.now() - start;
          lastWriteThroughAt = new Date().toISOString();
        }
      })
      .catch(() => {
        // Fallback handled by transactional outbox retry loop
      });
  }, 35);
}

// Register the SQLite WAL CDC trigger wake callback
registerWriteThroughWakeHandler(() => {
  scheduleImmediateWriteThrough();
});

/**
 * Enqueues a mutation into the transactional `outbox_events` table in SQLite WAL
 * and triggers immediate Write-Through replication to PostgreSQL Primary SSOT.
 */
export function enqueue(
  targetDb: any,
  aggregateType: string,
  aggregateId: string | number,
  eventType: OutboxOperation,
  payload: any = {},
  destination: OutboxDestination = "POSTGRES",
): string {
  const activeDb = targetDb && typeof targetDb.prepare === "function" ? targetDb : db;
  const id = `OBX-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const nowIso = new Date().toISOString();
  const payloadJson =
    typeof payload === "string" ? payload : JSON.stringify(payload ?? {});

  try {
    activeDb
      .prepare(
        `INSERT INTO outbox_events (
          id, aggregate_type, aggregate_id, event_type, payload_json,
          destination, status, retry_count, max_retries, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)`,
      )
      .run(
        id,
        String(aggregateType || "ERP_RECORD"),
        String(aggregateId),
        String(eventType || "UPSERT"),
        payloadJson,
        String(destination || "POSTGRES"),
        MAX_RETRIES,
        nowIso,
      );
    scheduleImmediateWriteThrough();
  } catch (err) {
    console.warn("[OutboxService] Failed to insert outbox_events row:", err);
  }

  return id;
}

export function enqueueOutboxEvent(params: {
  collectionName: string;
  recordId: string | number;
  operation: OutboxOperation;
  payload?: any;
  destination?: OutboxDestination;
}): string {
  return enqueue(
    db,
    params.collectionName,
    params.recordId,
    params.operation,
    params.payload ?? {},
    params.destination ?? "POSTGRES",
  );
}

/**
 * Processes a batch of pending `outbox_events` and commits them via Write-Through
 * to PostgreSQL Primary SSOT (`public.erp_sync_records`).
 * Automatically coalesces rapid consecutive mutations to the same `(aggregate_type, aggregate_id)`.
 */
export async function processOutboxBatch(batchSize = 40): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
}> {
  if (isProcessing) {
    return { processed: 0, succeeded: 0, failed: 0, deadLettered: 0 };
  }

  isProcessing = true;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let deadLettered = 0;

  try {
    const pendingRows = db
      .prepare(
        `SELECT * FROM outbox_events
         WHERE status = 'PENDING'
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(batchSize) as OutboxEventRow[];

    if (pendingRows.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0, deadLettered: 0 };
    }

    // Coalesce duplicate pending mutations for the same (aggregate_type, aggregate_id)
    // so only the latest state is written to PostgreSQL Primary SSOT
    const latestByKey = new Map<string, OutboxEventRow>();
    const supersededIds: string[] = [];

    for (const row of pendingRows) {
      const key = `${String(row.aggregate_type).toLowerCase()}::${row.aggregate_id}`;
      const existing = latestByKey.get(key);
      if (existing) {
        supersededIds.push(existing.id);
      }
      latestByKey.set(key, row);
    }

    if (supersededIds.length > 0) {
      const nowStr = new Date().toISOString();
      const markSupersededStmt = db.prepare(
        `UPDATE outbox_events SET status = 'COMPLETED', last_error = NULL, processed_at = ? WHERE id = ?`,
      );
      db.transaction(() => {
        for (const oldId of supersededIds) {
          markSupersededStmt.run(nowStr, oldId);
        }
      })();
    }

    for (const row of latestByKey.values()) {
      processed++;
      try {
        let parsedPayload: any = {};
        try {
          parsedPayload = row.payload_json ? JSON.parse(row.payload_json) : {};
        } catch {
          parsedPayload = { raw: row.payload_json };
        }

        const collectionName = String(row.aggregate_type || "erp_events").toLowerCase();
        const opUpper = String(row.event_type || "UPSERT").toUpperCase();

        // If payload was empty or minimal on UPSERT, enrich directly from local SQLite WAL row if table exists
        if (
          opUpper !== "DELETE" &&
          opUpper !== "REMOVE" &&
          (!parsedPayload || Object.keys(parsedPayload).length <= 1) &&
          /^[a-zA-Z0-9_]+$/.test(collectionName)
        ) {
          try {
            const liveRow = db
              .prepare(`SELECT * FROM "${collectionName}" WHERE id = ?`)
              .get(String(row.aggregate_id));
            if (liveRow && typeof liveRow === "object") {
              parsedPayload = liveRow;
            }
          } catch {
            // table may use different pk; keep parsedPayload
          }
        }

        let ok = false;
        if (opUpper === "DELETE" || opUpper === "REMOVE") {
          ok = await deleteFromPostgres(collectionName, String(row.aggregate_id));
        } else {
          ok = await replicateToPostgres(
            collectionName,
            String(row.aggregate_id),
            parsedPayload,
          );
        }

        if (!ok) {
          throw new Error("PostgreSQL Primary SSOT Write-Through returned false");
        }

        db.prepare(
          `UPDATE outbox_events
           SET status = 'COMPLETED', last_error = NULL, processed_at = ?
           WHERE id = ?`,
        ).run(new Date().toISOString(), row.id);
        succeeded++;
      } catch (err: any) {
        const nextRetryCount = (row.retry_count || 0) + 1;
        const errorMsg = err?.message || String(err);

        if (nextRetryCount >= (row.max_retries || MAX_RETRIES)) {
          db.prepare(
            `UPDATE outbox_events
             SET status = 'DEAD_LETTER', retry_count = ?, last_error = ?, processed_at = ?
             WHERE id = ?`,
          ).run(nextRetryCount, errorMsg, new Date().toISOString(), row.id);
          deadLettered++;
        } else {
          db.prepare(
            `UPDATE outbox_events
             SET status = 'PENDING', retry_count = ?, last_error = ?
             WHERE id = ?`,
          ).run(nextRetryCount, errorMsg, row.id);
          failed++;
        }
      }
    }
  } catch (err) {
    console.error("[OutboxWorker] Batch processing error:", err);
  } finally {
    isProcessing = false;
    if (pendingImmediateWake) {
      pendingImmediateWake = false;
      scheduleImmediateWriteThrough();
    }
  }

  return { processed, succeeded, failed, deadLettered };
}

export function replayDeadLetterQueue(): number {
  try {
    const res = db
      .prepare(
        `UPDATE outbox_events
         SET status = 'PENDING', retry_count = 0, last_error = NULL
         WHERE status = 'DEAD_LETTER'`,
      )
      .run();
    if (res.changes > 0) {
      scheduleImmediateWriteThrough();
    }
    return res.changes;
  } catch {
    return 0;
  }
}

export function getOutboxTelemetry() {
  try {
    const counts = db
      .prepare(
        `SELECT status, COUNT(*) as count
         FROM outbox_events
         GROUP BY status`,
      )
      .all() as { status: string; count: number }[];

    const map: Record<string, number> = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      DEAD_LETTER: 0,
    };
    for (const c of counts) {
      map[c.status] = c.count;
    }

    const recentDeadLetters = db
      .prepare(
        `SELECT id, aggregate_type as collection_name, aggregate_id as record_id,
                event_type as operation, retry_count, last_error, created_at as updated_at
         FROM outbox_events
         WHERE status = 'DEAD_LETTER'
         ORDER BY created_at DESC LIMIT 20`,
      )
      .all();

    return {
      stats: {
        pendingCount: map.PENDING,
        processingCount: map.PROCESSING,
        completedCount: map.COMPLETED,
        deadLetterCount: map.DEAD_LETTER,
        writeThroughFlushesCount,
        lastWriteThroughLatencyMs,
        lastWriteThroughAt,
      },
      recentDeadLetters,
    };
  } catch {
    return {
      stats: {
        pendingCount: 0,
        processingCount: 0,
        completedCount: 0,
        deadLetterCount: 0,
        writeThroughFlushesCount,
        lastWriteThroughLatencyMs,
        lastWriteThroughAt,
      },
      recentDeadLetters: [],
    };
  }
}

export function startOutboxWorker(intervalMs = 6000) {
  if (workerInterval) return;
  workerInterval = setInterval(() => {
    processOutboxBatch(40).catch((e) =>
      console.error("[OutboxWorker] Background tick failed:", e),
    );
  }, intervalMs);
}

export const outboxService = {
  enqueue,
  enqueueOutboxEvent,
  scheduleImmediateWriteThrough,
  processOutboxBatch,
  replayDeadLetterQueue,
  getOutboxTelemetry,
  startOutboxWorker,
};
