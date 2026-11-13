import {
  replicateToPostgres,
  deleteFromPostgres,
  clearSupabaseErpSyncRecords,
  getPostgresBridgeStats,
} from "./postgresBridge.ts";

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
 * Clears HR-specific collections in Supabase Cloud (`public.erp_sync_records`)
 */
export async function clearHrCloudData(): Promise<number> {
  const hrCollections = [
    "hr_jobs",
    "hr_applications",
    "hr_kpis",
    "hr_leaves",
    "hr_salaries",
    "hr_payslips",
    "hr_attendances",
  ];
  const res = await clearSupabaseErpSyncRecords(hrCollections);
  return res.deletedCollections;
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
