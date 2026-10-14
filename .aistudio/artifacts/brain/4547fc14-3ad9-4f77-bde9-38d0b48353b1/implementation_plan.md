# Rencana Implementasi: Komparasi & Migrasi 100% Document Workspace Studio V2

Rencana ini menetapkan langkah komparasi mendalam dan integrasi penuh 100% dari arsitektur **Document Workspace Studio V2** (`https://github.com/eghyal/Document-Workspace-Studio-V2`) ke dalam sistem ERP saat ini, sesuai preferensi yang telah dikonfirmasi pengguna.

---

## 1. Komparasi Detail: Sistem Saat Ini vs. Document Workspace Studio V2

| Fitur / Komponen | Sistem Saat Ini (V1.5) | Document Workspace Studio V2 | Rencana Tindakan Migrasi |
| :--- | :--- | :--- | :--- |
| **Arsitektur Editor** | Single-mode kanvas blok (`CanvaStudioEditor.tsx`) | Dual-mode: **CanvaStudioEditor** + **OnlyOfficeEmbeddedEditor** (DOCX-native) | Implementasi dual-mode dengan tombol toggle & fallback otomatis jika OnlyOffice offline |
| **Sistem Rendering** | Terpisah antara editor dan preview modal | Terpadu dengan `SharedBlockRenderer.tsx` untuk konsistensi WYSIWYG 1:1 | Integrasi `SharedBlockRenderer.tsx` pada editor & modal preview |
| **Office Ribbon & Navigasi** | Toolbar mengambang lokal | Pita menu Office Ribbon 6 tab (`HOME`, `INSERT`, `LAYOUT`, `REFERENCES`, `REVIEW`, `VIEW`) | Terapkan Office Ribbon lengkap dengan kontrol paragraf, gaya teks, & tata letak |
| **Format Teks Kaya** | Markdown blok kasar | Rich-Text Character Run (`DocTextRun[]`) setara WordprocessingML (`<w:r>`) | Dukung format inline kata (`**bold**`, `*italic*`, `__underline__`, `~~strikethrough~~`, `^sup^`, `~sub~`) |
| **Penomoran Dokumen** | `MAX(id) + 1` (rentan tabrakan saat ada dokumen dihapus) | Atomic Sequence Generator via tabel `document_sequences` (`DOC-<DEPT>-<YYYYMM>-<SEQ>`) | Terapkan tabel `document_sequences` dan generator sequence transaksi atomik |
| **Integritas Status & Bypass** | `PUT /api/workspace-documents/:id` menerima perubahan status langsung | Strict Zod Guard: penolakan field `status` dengan HTTP `403 STATUS_BYPASS_FORBIDDEN` | Terapkan skema `UpdateDocumentSchema.strict()` & isolasi endpoint transisi status |
| **Separation of Duty (SoD)** | Pembuat dokumen dapat meng-approve dokumen sendiri | Pembuat dilarang meng-approve (`SELF_APPROVAL_FORBIDDEN`) & verifikasi departemen RBAC | Validasi ketat `canUserApproveDepartment()` dan blokir self-approval |
| **Penguncian Dokumen Approved** | Dokumen approved dapat ter-overwrite saat disimpan | Dokumen `APPROVED` dikunci permanen (`409 DOCUMENT_IMMUTABLE`), revisi membuka versi baru | Terapkan penguncian permanen dan pembuatan hash SHA-256 dokumen |
| **Autosave & Locking** | Simpan lokal manual | Optimistic Locking (`expected_version`), debounce autosave, heartbeat lock (`POST /:id/lock`) | Terapkan heartbeat lock, deteksi konflik versi, dan riwayat versi (`versions`) |
| **Tabel & Formula** | Tabel statis biasa | Formula tabel `=SUM(ABOVE)`, `=AVERAGE(ABOVE)`, `=COUNT(ABOVE)`, zebra striping, & cell metadata | Terapkan evaluator formula tabel di `docxEngine.ts` dan `SharedBlockRenderer.tsx` |
| **Multi-Page Pagination** | Satu kanvas panjang tak berbatas | Mesin paginasi dinamis multi-halaman A4 vertikal dengan header/footer dan penomoran | Terapkan `estimateBlockHeightPx` dan kalkulasi lembar halaman A4 |
| **Reliabilitas Transaksi** | Mutasi langsung terpisah | Satu transaksi atomik SQLite (simpan + routing + snapshot versi + Transactional Outbox) | Terapkan endpoint `/submit` atomik dengan `idempotency_key` dan tabel `outbox_events` |
| **Dukungan OnlyOffice** | Belum ada | Konfigurasi Docker `docker-compose.onlyoffice.yml`, endpoint `/editor-session`, `/file`, `/callback` | Tambahkan konfigurasi container dan endpoint sesi OnlyOffice |

---

## 2. Rencana Arsitektur & Perubahan Database (Tahap Eksekusi)

### User Review Required
> [!IMPORTANT]
> Sesuai konfirmasi pengguna, tabel `workspace_documents` dan data dokumen lama akan direset bersih untuk mengadopsi skema terstruktur V2:
> 1. `workspace_documents`
> 2. `workspace_document_versions`
> 3. `workspace_document_events`
> 4. `document_sequences`
> 5. `outbox_events`

---

### Tahap 1: Pembaharuan Type Definitions & Utilitas Validasi
- **`src/types/workspace.ts`**:
  - Sinkronisasi tipe lengkap: `DocBlock`, `DocTextRun`, `DocTableData`, `DocTableCellMeta`, `DocMediaData`, `DocPageSetup`, `DocCommentThread`, `DocTrackedChange`, `WorkspaceDocumentVersion`, `WorkspaceDocumentEvent`, dan `OnlyOfficeEditorSession`.
- **`src/utils/validation.ts`**:
  - Menerapkan skema Zod ketat: `CreateDocumentSchema`, `UpdateDocumentSchema.strict()`, `SubmitDocumentSchema`, `ApproveDocumentSchema`, dan `ReviseDocumentSchema`.

### Tahap 2: Layanan Backend & Skema Database SQLite
- **`src/services/outbox.ts`**:
  - Implementasi `OutboxService` dengan method `enqueueInTransaction()` untuk penanganan event asinkron.
- **`src/services/docxEngine.ts`**:
  - Mesin evaluator formula tabel (`=SUM(ABOVE)`, dll.), konversi XML DOCX, dan pembuatan token sesi OnlyOffice Document Server.
- **`src/db/database.ts`**:
  - Eksekusi migrasi skema tabel bersih V2 (`workspace_documents`, `workspace_document_versions`, `workspace_document_events`, `document_sequences`, `outbox_events`).
- **`src/routes/workspace_documents.ts`**:
  - Mengimplementasikan seluruh 18 endpoint RESTful V2:
    - `GET /api/workspace-documents` (daftar dengan paginasi, filter status & departemen, sanitasi metadata).
    - `POST /api/workspace-documents` (pembuatan dokumen dengan atomic sequence generator).
    - `GET /api/workspace-documents/:id` (detail dokumen lengkap).
    - `PUT /api/workspace-documents/:id` (penyimpanan draf dengan optimistic locking & penolakan status bypass).
    - `POST /api/workspace-documents/:id/submit` (transaksi atomik submit approval dengan idempotency key).
    - `POST /api/workspace-documents/:id/approve` (RBAC approval, anti self-approval, SHA-256 hash).
    - `POST /api/workspace-documents/:id/revise` (permintaan revisi dokumen dengan catatan).
    - `POST /api/workspace-documents/:id/cancel-submission` & `archive`.
    - `POST /api/workspace-documents/:id/lock` (heartbeat lock untuk multi-user safety).
    - `GET /api/workspace-documents/:id/versions` & `POST /:id/restore-version`.
    - `POST /api/workspace-documents/:id/editor-session`, `/file`, `/callback` (OnlyOffice session gateway).
    - `POST /api/workspace-documents/:id/export/pdf` (server-side PDF export deterministik).

### Tahap 3: Komponen Antarmuka Pengguna (UI)
- **`src/components/erp/workspace/SharedBlockRenderer.tsx`**:
  - Render blok standar dokumen (letterhead, heading, paragraph, list, table dengan kalkulasi formula, metadata, address, signature stamp, divider).
- **`src/components/erp/workspace/OnlyOfficeEmbeddedEditor.tsx`**:
  - Wadah embedded OnlyOffice Document Server dengan iframe/API dan tombol fallback otomatis ke editor kanvas native.
- **`src/components/erp/workspace/CanvaStudioEditor.tsx`**:
  - Editor visual kanvas multi-halaman A4 dengan Office Ribbon 6 tab, fitur track changes, komentar inline, snap grid alignment guidelines, dan riwayat undo/redo terpadu.
- **`src/pages/general/DocumentWorkspace.tsx`**:
  - Dashboard manajemen dokumen dengan tab status, pembuatan dokumen cepat dari preset template, modal preview persetujuan menggunakan `SharedBlockRenderer`, dan toggle mode editor.

### Tahap 4: Infrastruktur & Gaya Cetak
- **`docker-compose.onlyoffice.yml`**:
  - File orkestrasi container OnlyOffice Document Server (port 8080) dengan JWT authentication.
- **`src/index.css`**:
  - Aturan `@page` deterministik untuk `A4 portrait` dan `A4 landscape` serta styling media print.

---

## 3. Verifikasi & Kriteria Keberhasilan
1. **Verifikasi Build & Lint**:
   - `compile_applet`: Build TypeScript & Vite sukses tanpa error.
   - `lint_applet`: Zero lint errors (`tsc --noEmit`).
2. **Eksekusi Test Suite**:
   - Menjalankan `npx tsx src/tests/workspace_documents_test.ts` untuk memverifikasi 10 kriteria P0 (anti status bypass, atomic sequence generator, RBAC & SoD approval, penguncian permanen dokumen approved, dan outbox transaction).
3. **Pengujian Fungsional End-to-End**:
   - Membuat dokumen baru dari template preset -> nomor dokumen berformat `DOC-<DEPT>-<YYYYMM>-<SEQ>`.
   - Mengubah konten pada editor kanvas -> autosave dan version increment berjalan normal.
   - Mengajukan approval secara atomik -> status berpindah ke `PENDING_APPROVAL` tanpa bypass.
   - Approval oleh otoritas departemen terkait -> status menjadi `APPROVED`, dikunci permanen, dan siap diekspor ke PDF resmi.
