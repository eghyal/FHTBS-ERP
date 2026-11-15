import { safeExec } from "./runner.ts";

export function runCoreAndSystemMigrations(db: any) {
  safeExec(db, "DROP TABLE IF EXISTS job_queue;");
  db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER DEFAULT 0,
        data_base64 TEXT NOT NULL,
        prefix TEXT DEFAULT 'uploads',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_media_assets_filename ON media_assets(filename);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        level TEXT DEFAULT 'STAFF',
        name TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        is_approved INTEGER DEFAULT 0,
        last_seen_at TEXT,
        device_type TEXT DEFAULT 'Desktop',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_trail (
        id TEXT PRIMARY KEY,
        user_email TEXT,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS forum_posts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_username TEXT NOT NULL,
        author_role TEXT NOT NULL,
        category TEXT NOT NULL,
        pinned_until DATETIME,
        shared_resource_type TEXT, -- 'PROJECT', 'PR', 'PO'
        shared_resource_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS forum_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        content TEXT NOT NULL,
        author_username TEXT NOT NULL,
        author_role TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES forum_posts(id)
      );

      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        name TEXT,
        is_group BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT 
      );

      CREATE TABLE IF NOT EXISTS chat_participants (
        thread_id TEXT NOT NULL,
        username TEXT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (thread_id, username)
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        sender_username TEXT NOT NULL,
        content TEXT,
        file_url TEXT,
        file_name TEXT,
        file_size INTEGER,
        file_type TEXT,
        read_by TEXT DEFAULT '',
        is_deleted BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
      );

      CREATE TABLE IF NOT EXISTS user_drafts (
        key TEXT NOT NULL,
        username TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (key, username)
      );
  `);

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS cms_settings (
        page TEXT PRIMARY KEY,
        content_json TEXT NOT NULL
      );
    `,
    ).run();

    // Default CMS content
    try {
      const existingCms = db
        .prepare("SELECT * FROM cms_settings WHERE page = 'careers'")
        .get();
      if (!existingCms) {
        db.prepare(
          "INSERT INTO cms_settings (page, content_json) VALUES (?, ?)",
        ).run(
          "careers",
          JSON.stringify({
            hero_title: "Join Our Innovative Team",
            hero_subtitle:
              "Build the future with us. We are looking for passionate individuals.",
            benefits: [
              "Flexible Hours",
              "Health Insurance",
              "Remote Work Options",
              "Continuous Learning",
            ],
          }),
        );
      }
    } catch (e) {}

  db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_matrices (
        id TEXT PRIMARY KEY,
        document_type TEXT NOT NULL,
        min_amount REAL DEFAULT 0,
        max_amount REAL,
        roles TEXT NOT NULL,
        is_parallel INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workflow_slas (
        id TEXT PRIMARY KEY,
        document_type TEXT NOT NULL,
        step TEXT NOT NULL,
        sla_hours REAL NOT NULL,
        escalate_to TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workflow_approvals (
        id TEXT PRIMARY KEY,
        document_type TEXT NOT NULL,
        document_id TEXT NOT NULL,
        document_number TEXT NOT NULL,
        document_title TEXT,
        department TEXT DEFAULT 'GENERAL',
        amount REAL DEFAULT 0,
        matrix_id TEXT,
        is_parallel INTEGER DEFAULT 0,
        required_roles_json TEXT NOT NULL DEFAULT '["MANAGER"]',
        approved_steps_json TEXT NOT NULL DEFAULT '[]',
        current_step_index INTEGER NOT NULL DEFAULT 0,
        current_step_role TEXT NOT NULL DEFAULT 'MANAGER',
        status TEXT NOT NULL DEFAULT 'PENDING',
        step_started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sla_hours REAL DEFAULT 24,
        escalate_to TEXT DEFAULT 'DIRECTOR',
        escalated INTEGER DEFAULT 0,
        escalated_to TEXT,
        escalated_at DATETIME,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(document_type, document_id)
      );

      CREATE TABLE IF NOT EXISTS workflow_audit_logs (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        changes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Index Optimizations for SLA and Workflow
      CREATE INDEX IF NOT EXISTS idx_workflow_matrices_type ON workflow_matrices(document_type);
      CREATE INDEX IF NOT EXISTS idx_workflow_slas_type ON workflow_slas(document_type);
      CREATE INDEX IF NOT EXISTS idx_workflow_approvals_status ON workflow_approvals(status, document_type);
      CREATE INDEX IF NOT EXISTS idx_workflow_approvals_doc ON workflow_approvals(document_type, document_id);

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
        last_error TEXT,
        created_at TEXT NOT NULL,
        processed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox_events(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);
    `);
  safeExec(db, "ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0;");
  safeExec(db, "ALTER TABLE users ADD COLUMN level TEXT DEFAULT 'STAFF';");
  safeExec(db, "ALTER TABLE users ADD COLUMN last_seen_at TEXT;");
  safeExec(db, "ALTER TABLE users ADD COLUMN device_type TEXT DEFAULT 'Desktop';");
  safeExec(db, "ALTER TABLE chat_messages ADD COLUMN forwarded_from TEXT;");
  safeExec(db, "ALTER TABLE chat_messages ADD COLUMN reply_to_id TEXT;");
  safeExec(db, "ALTER TABLE chat_messages ADD COLUMN reply_to_sender TEXT;");
  safeExec(db, "ALTER TABLE chat_messages ADD COLUMN reply_to_content TEXT;");
  safeExec(db, "ALTER TABLE chat_messages ADD COLUMN is_pinned INTEGER DEFAULT 0;");
  safeExec(db, "ALTER TABLE chat_messages ADD COLUMN pinned_by TEXT;");
}

