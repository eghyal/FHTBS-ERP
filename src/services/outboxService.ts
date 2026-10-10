import db from "../db/database.ts";
import { syncCollectionToFirestore, deleteDocFromFirestore } from "../db/firebaseSync.ts";
import { replicateToPostgres, deleteFromPostgres } from "../db/postgresBridge.ts";
import crypto from "crypto";

export interface OutboxEvent {
  id: string;
  aggregate_type: string; // e.g., 'FINANCE_JOURNALS', 'INVENTORY_STOCK', 'COMMERCIAL_INVOICES', 'CUSTOMERS'
  aggregate_id: string;
  event_type: "CREATE" | "UPDATE" | "DELETE";
  payload_json: string;
  destination: "FIRESTORE" | "POSTGRES" | "BOTH";
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD_LETTER";
  retry_count: number;
  max_retries: number;
  next_retry_at?: string | null;
  last_error?: string | null;
  created_at: string;
  processed_at?: string | null;
}

export interface OutboxStats {
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  deadLetterCount: number;
  totalEvents: number;
  lastSyncedAt: string | null;
}

// Sensitive collections that must NEVER be synced to external public cloud datastores
const BLOCKED_CLOUD_COLLECTIONS = new Set([
  "users",
  "hr_salaries",
  "hr_payslips",
  "finance_payroll",
  "payroll_requisitions",
  "system_settings"
]);

export class OutboxService {
  private isProcessing = false;
  private workerInterval: NodeJS.Timeout | null = null;
  private lastSyncedAt: string | null = null;

  constructor() {
    this.initTable();
    this.startWorker();
  }

  /**
   * Ensure outbox_events schema and indexes exist
   */
  private initTable() {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS outbox_events (
          id TEXT PRIMARY KEY,
          aggregate_type TEXT NOT NULL,
          aggregate_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          destination TEXT NOT NULL DEFAULT 'BOTH',
          status TEXT NOT NULL DEFAULT 'PENDING',
          retry_count INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 5,
          next_retry_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL,
          processed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox_events(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);
      `);

      try {
        db.exec("ALTER TABLE outbox_events ADD COLUMN next_retry_at TEXT;");
      } catch (e) {
        // Column already exists
      }
    } catch (err) {
      console.error("[OutboxService] Failed to initialize outbox schema:", err);
    }
  }

  /**
   * Enqueue an event within an existing SQLite transaction
   * Guarantees atomic dual-write safety
   */
  enqueue(
    customDbOrTx: any,
    aggregateType: string,
    aggregateId: string,
    eventType: "CREATE" | "UPDATE" | "DELETE",
    payload: any,
    destination: "FIRESTORE" | "POSTGRES" | "BOTH" = "BOTH",
    maxRetries = 5
  ): string {
    const eventId = "EVT-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const nowIso = new Date().toISOString();
    const payloadJson = typeof payload === "string" ? payload : JSON.stringify(payload || {});

    // Enforce cloud privacy shield
    let effectiveDest = destination;
    const collName = aggregateType.toLowerCase();
    if (BLOCKED_CLOUD_COLLECTIONS.has(collName)) {
      if (effectiveDest === "BOTH" || effectiveDest === "FIRESTORE") {
        effectiveDest = "POSTGRES";
      }
    }

    const target = customDbOrTx || db;
    target
      .prepare(`
        INSERT INTO outbox_events (
          id, aggregate_type, aggregate_id, event_type, payload_json,
          destination, status, retry_count, max_retries, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
      `)
      .run(
        eventId,
        aggregateType,
        aggregateId,
        eventType,
        payloadJson,
        effectiveDest,
        maxRetries,
        nowIso
      );

    return eventId;
  }

  /**
   * Start periodic background processor worker
   */
  public startWorker(intervalMs = 3000) {
    if (this.workerInterval) return;
    this.workerInterval = setInterval(() => {
      this.processOutboxBatch().catch((err) => {
        console.error("[OutboxWorker] Error during batch processing:", err);
      });
    }, intervalMs);
  }

  /**
   * Stop worker
   */
  public stopWorker() {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
  }

  /**
   * Process a batch of pending/eligible retry outbox events
   */
  public async processOutboxBatch(batchSize = 25): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;

    try {
      // 1. Fetch batch of eligible events with exponential backoff awareness
      const events = db
        .prepare(`
          SELECT * FROM outbox_events
          WHERE status = 'PENDING' 
             OR (status = 'FAILED' AND retry_count < max_retries AND (next_retry_at IS NULL OR next_retry_at <= datetime('now')))
          ORDER BY created_at ASC
          LIMIT ?
        `)
        .all(batchSize) as OutboxEvent[];

      if (events.length === 0) {
        this.isProcessing = false;
        return 0;
      }

      for (const event of events) {
        // Mark as PROCESSING
        db.prepare("UPDATE outbox_events SET status = 'PROCESSING' WHERE id = ?").run(event.id);

        try {
          const payload = JSON.parse(event.payload_json || "{}");
          const collectionName = event.aggregate_type.toLowerCase();

          // 1. Sync to Cloud Firestore if requested and not sensitive
          if (!BLOCKED_CLOUD_COLLECTIONS.has(collectionName)) {
            if (event.destination === "FIRESTORE" || event.destination === "BOTH") {
              if (event.event_type === "DELETE") {
                await deleteDocFromFirestore(collectionName, event.aggregate_id);
              } else {
                await syncCollectionToFirestore(collectionName, event.aggregate_id, payload);
              }
            }
          }

          // 2. Replicate to PostgreSQL if requested
          if (event.destination === "POSTGRES" || event.destination === "BOTH") {
            if (event.event_type === "DELETE") {
              await deleteFromPostgres(collectionName, event.aggregate_id);
            } else {
              await replicateToPostgres(collectionName, event.aggregate_id, payload);
            }
          }

          // Mark COMPLETED
          const nowIso = new Date().toISOString();
          db.prepare(`
            UPDATE outbox_events
            SET status = 'COMPLETED', processed_at = ?, next_retry_at = NULL, last_error = NULL
            WHERE id = ?
          `).run(nowIso, event.id);

          this.lastSyncedAt = nowIso;
          processedCount++;
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          const newRetry = event.retry_count + 1;
          const isDeadLetter = newRetry >= event.max_retries;
          const newStatus = isDeadLetter ? "DEAD_LETTER" : "FAILED";
          const backoffDelayMs = Math.min(60000, Math.pow(2, newRetry) * 1000);
          const nextRetryAt = isDeadLetter ? null : new Date(Date.now() + backoffDelayMs).toISOString();

          db.prepare(`
            UPDATE outbox_events
            SET status = ?,
                retry_count = ?,
                next_retry_at = ?,
                last_error = ?
            WHERE id = ?
          `).run(newStatus, newRetry, nextRetryAt, errMsg.substring(0, 500), event.id);
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Replay/retry all failed events immediately
   */
  public retryFailed(): number {
    const result = db.prepare(`
      UPDATE outbox_events
      SET status = 'PENDING', retry_count = 0, next_retry_at = NULL, last_error = NULL
      WHERE status = 'FAILED'
    `).run();
    return result.changes;
  }

  /**
   * Replay all Dead-Letter Queue (DLQ) events
   */
  public replayDeadLetters(): number {
    const result = db.prepare(`
      UPDATE outbox_events
      SET status = 'PENDING', retry_count = 0, next_retry_at = NULL, last_error = NULL
      WHERE status = 'DEAD_LETTER'
    `).run();
    return result.changes;
  }

  /**
   * Get Queue Statistics & Health Metrics
   */
  public getStats(): OutboxStats {
    try {
      const stats = db
        .prepare(`
          SELECT
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pendingCount,
            SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) as processingCount,
            SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completedCount,
            SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failedCount,
            SUM(CASE WHEN status = 'DEAD_LETTER' THEN 1 ELSE 0 END) as deadLetterCount,
            COUNT(*) as totalEvents
          FROM outbox_events
        `)
        .get() as any;

      return {
        pendingCount: Number(stats?.pendingCount || 0),
        processingCount: Number(stats?.processingCount || 0),
        completedCount: Number(stats?.completedCount || 0),
        failedCount: Number(stats?.failedCount || 0),
        deadLetterCount: Number(stats?.deadLetterCount || 0),
        totalEvents: Number(stats?.totalEvents || 0),
        lastSyncedAt: this.lastSyncedAt,
      };
    } catch (e) {
      return {
        pendingCount: 0,
        processingCount: 0,
        completedCount: 0,
        failedCount: 0,
        deadLetterCount: 0,
        totalEvents: 0,
        lastSyncedAt: null,
      };
    }
  }

  /**
   * Fetch recent outbox events for monitoring UI / API
   */
  public getRecentEvents(limit = 50): OutboxEvent[] {
    return db
      .prepare(`
        SELECT * FROM outbox_events
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(limit) as OutboxEvent[];
  }
}

export const outboxService = new OutboxService();
