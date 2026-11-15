import {
  replicateToPostgres,
  deleteFromPostgres,
  clearSupabaseErpSyncRecords,
  getPostgresBridgeStats,
} from "./postgresBridge.ts";
import { getPgDb, pgQuery, isDirectPgConnected } from "./postgresClient.ts";
import db, { setCdcTriggerSuppression } from "./database.ts";

let totalSyncedItems = 0;
let lastSyncTimestamp: string | null = null;
let lastSyncError: string | null = null;

/**
 * Curated 2-Engine Architecture (Local SQLite + Supabase Cloud PostgreSQL).
 * Legacy Firestore NoSQL synchronization has been retired.
 * All calls to syncCollectionToFirestore now replicate directly to Supabase PostgreSQL
 * (`public.erp_sync_records`) without the legacy early-return bug.
 */
export async function syncCollectionToFirestore(
  collectionName: string,
  docId: string,
  data: any,
): Promise<boolean> {
  if (!docId || !collectionName) return false;

  try {
    const ok = await replicateToPostgres(collectionName, String(docId), data);
    if (ok) {
      totalSyncedItems++;
      lastSyncTimestamp = new Date().toISOString();
      lastSyncError = null;
    }
    return ok;
  } catch (err: any) {
    lastSyncError = err?.message || String(err);
    return false;
  }
}

export async function deleteDocFromFirestore(
  collectionName: string,
  docId: string,
): Promise<boolean> {
  if (!docId || !collectionName) return false;

  try {
    const ok = await deleteFromPostgres(collectionName, String(docId));
    if (ok) {
      lastSyncTimestamp = new Date().toISOString();
      lastSyncError = null;
    }
    return ok;
  } catch (err: any) {
    lastSyncError = err?.message || String(err);
    return false;
  }
}

/**
 * Clears all ERP collections in Supabase Cloud (`public.erp_sync_records`)
 */
export async function clearAllCloudData(): Promise<number> {
  const res = await clearSupabaseErpSyncRecords();
  return res.deletedCollections;
}

/**
 * Clears HR-specific and Manpower collections in Supabase Cloud (`public.erp_sync_records`)
 */
export async function clearHrCloudData(): Promise<number> {
  const hrCollections = [
    "hr_jobs",
    "hr_applications",
    "hr_kpis",
    "hr_leaves",
    "hr_salaries",
    "hr_payslips",
    "hr_handovers",
    "hr_attendances",
    "production_manpower",
    "production_manpower_assignments",
  ];
  const res = await clearSupabaseErpSyncRecords(hrCollections);
  return res.deletedCollections;
}

const CORE_RETAINED_USERNAMES = ["eghy", "ludy", "admin"];

/**
 * Comprehensively purges all non-core user profiles, unregistered manpower,
 * tester accounts, and linked HR/attendance/chat records across:
 * 1) Local SQLite + Attendance Shard + Outbox CDC queue
 * 2) Supabase Cloud PostgreSQL (`public.erp_sync_records`)
 * Retains strictly the 3 core baseline accounts: Eghy, Ludy, admin.
 */
export async function purgeNonCoreUserProfilesAll(): Promise<{
  localDeleted: Record<string, number>;
  cloudDeleted: Record<string, number>;
  remainingLocalUsers: Array<{ id: string; username: string; name: string; role: string }>;
  remainingCloudUsers: Array<{ record_id: string; username: string; name: string; role: string }>;
}> {
  const localDeleted: Record<string, number> = {};
  const cloudDeleted: Record<string, number> = {};

  const safeRunCount = (label: string, sql: string) => {
    try {
      const info = db.prepare(sql).run();
      localDeleted[label] = Number(info?.changes || 0);
    } catch {
      localDeleted[label] = 0;
    }
  };

  // 1. Local SQLite + Attendance Shard cleanup (suppress CDC echo during bulk purge)
  db.pragma("foreign_keys = OFF");
  setCdcTriggerSuppression(true, db);
  try {
    db.transaction(() => {
      safeRunCount(
        "production_manpower_assignments",
        "DELETE FROM production_manpower_assignments",
      );
      safeRunCount("production_manpower", "DELETE FROM production_manpower");
      safeRunCount("project_manpower", "DELETE FROM project_manpower");
      safeRunCount(
        "hr_salaries",
        "DELETE FROM hr_salaries WHERE LOWER(TRIM(employee_username)) NOT IN ('eghy', 'ludy', 'admin')",
      );
      safeRunCount(
        "hr_kpis",
        "DELETE FROM hr_kpis WHERE LOWER(TRIM(employee_username)) NOT IN ('eghy', 'ludy', 'admin')",
      );
      safeRunCount(
        "hr_leaves",
        "DELETE FROM hr_leaves WHERE LOWER(TRIM(employee_username)) NOT IN ('eghy', 'ludy', 'admin')",
      );
      safeRunCount(
        "hr_payslips",
        "DELETE FROM hr_payslips WHERE LOWER(TRIM(employee_username)) NOT IN ('eghy', 'ludy', 'admin')",
      );
      safeRunCount(
        "hr_handovers",
        "DELETE FROM hr_handovers WHERE LOWER(TRIM(resigning_username)) NOT IN ('eghy', 'ludy', 'admin')",
      );
      safeRunCount(
        "hr_attendances",
        "DELETE FROM attendance_db.hr_attendances WHERE LOWER(TRIM(employee_username)) NOT IN ('eghy', 'ludy', 'admin')",
      );
      safeRunCount(
        "chat_participants",
        "DELETE FROM chat_participants WHERE LOWER(TRIM(username)) NOT IN ('eghy', 'ludy', 'admin')",
      );
      safeRunCount(
        "user_drafts",
        "DELETE FROM user_drafts WHERE LOWER(TRIM(username)) NOT IN ('eghy', 'ludy', 'admin')",
      );
      safeRunCount(
        "users",
        "DELETE FROM users WHERE LOWER(TRIM(username)) NOT IN ('eghy', 'ludy', 'admin')",
      );
      safeRunCount(
        "outbox_events",
        "DELETE FROM outbox_events WHERE aggregate_type IN ('users', 'production_manpower', 'production_manpower_assignments', 'hr_salaries', 'hr_kpis', 'hr_leaves', 'hr_payslips', 'hr_handovers', 'hr_applications', 'chat_participants', 'user_drafts')",
      );
    })();
  } finally {
    setCdcTriggerSuppression(false, db);
    db.pragma("foreign_keys = ON");
  }

  const remainingLocalUsers = db
    .prepare(
      "SELECT id, username, name, role, level, status, password, created_at FROM users ORDER BY id ASC",
    )
    .all() as Array<any>;

  // 2. Cloud Supabase PostgreSQL SSOT (`public.erp_sync_records`) cleanup + core sync
  await getPgDb();
  if (isDirectPgConnected()) {
    const delUsers = await pgQuery(
      `DELETE FROM public.erp_sync_records
       WHERE collection_name = 'users'
         AND LOWER(TRIM(COALESCE(payload->>'username', ''))) != ALL($1::text[])`,
      [CORE_RETAINED_USERNAMES],
    );
    cloudDeleted.users = Number(delUsers.rowCount || 0);

    const delHrCollections = await pgQuery(
      `DELETE FROM public.erp_sync_records
       WHERE collection_name = ANY($1::text[])`,
      [[
        "production_manpower",
        "production_manpower_assignments",
        "project_manpower",
        "hr_salaries",
        "hr_kpis",
        "hr_leaves",
        "hr_payslips",
        "hr_handovers",
        "hr_applications",
        "user_drafts",
      ]],
    );
    cloudDeleted.hr_and_manpower = Number(delHrCollections.rowCount || 0);

    const delAtt = await pgQuery(
      `DELETE FROM public.erp_sync_records
       WHERE collection_name = 'hr_attendances'
         AND LOWER(TRIM(COALESCE(payload->>'employee_username', ''))) != ALL($1::text[])`,
      [CORE_RETAINED_USERNAMES],
    );
    cloudDeleted.hr_attendances = Number(delAtt.rowCount || 0);

    const delChat = await pgQuery(
      `DELETE FROM public.erp_sync_records
       WHERE collection_name = 'chat_participants'
         AND LOWER(TRIM(COALESCE(payload->>'username', ''))) != ALL($1::text[])`,
      [CORE_RETAINED_USERNAMES],
    );
    cloudDeleted.chat_participants = Number(delChat.rowCount || 0);

    // Ensure all 3 core accounts exist cleanly in Cloud SSOT
    for (const coreUser of remainingLocalUsers) {
      await replicateToPostgres("users", String(coreUser.id), coreUser);
    }
  }

  let remainingCloudUsers: Array<{
    record_id: string;
    username: string;
    name: string;
    role: string;
  }> = [];

  if (isDirectPgConnected()) {
    const cloudUsersRes = await pgQuery<{
      record_id: string;
      username: string;
      name: string;
      role: string;
    }>(
      `SELECT record_id,
              payload->>'username' AS username,
              payload->>'name' AS name,
              payload->>'role' AS role
       FROM public.erp_sync_records
       WHERE collection_name = 'users'
       ORDER BY record_id ASC`,
    );
    remainingCloudUsers = cloudUsersRes.rows;
  }

  return {
    localDeleted,
    cloudDeleted,
    remainingLocalUsers: remainingLocalUsers.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
    })),
    remainingCloudUsers,
  };
}

export function getFirestoreSyncStatus() {
  const pgStats = getPostgresBridgeStats();
  return {
    connected: true,
    cloudSyncEnabled: true,
    engine: "SUPABASE_POSTGRESQL",
    projectId: pgStats.supabaseUrl,
    databaseId: "public.erp_sync_records",
    totalSyncedItems: Math.max(totalSyncedItems, pgStats.totalSupabaseSynced),
    lastSyncTimestamp: pgStats.lastSupabaseSyncedAt || lastSyncTimestamp,
    lastSyncError: pgStats.lastSupabaseError || lastSyncError,
  };
}
