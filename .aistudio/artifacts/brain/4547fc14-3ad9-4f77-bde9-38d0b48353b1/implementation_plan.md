# Rencana Implementasi: Stabilisasi Keamanan & Integritas Workflow Document Workshop Studio (Fase 0)

Rencana ini mengeksekusi perbaikan prioritas kritis (P0 & P1) dari Laporan Audit Komprehensif Document Workshop Studio: menutup bypass status approval, menegakkan RBAC dan validasi departemen, mengamankan identitas user via sesi JWT, menerapkan atomisitas submit approval, memperbaiki penomoran dokumen, mengunci dokumen berstatus `APPROVED` (immutable), serta menetapkan role resmi `FINANCE`.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Berdasarkan sesi klarifikasi, berikut keputusan kunci yang telah disepakati dan menjadi landasan arsitektur Fase 0:

- **Confirmed Decision 1 (Fokus Prioritas)**: Menyelesaikan seluruh perbaikan keamanan dan integritas workflow **Fase 0** terlebih dahulu sebelum melangkah ke integrasi engine dokumen eksternal.
- **Confirmed Decision 2 (Kebijakan Dokumen Approved)**: Dokumen berstatus `APPROVED` dikunci secara permanen (immutable). Perubahan konten setelah disahkan wajib melalui pembuatan versi revisi/dokumen baru.
- **Confirmed Decision 3 (Role Resmi Departemen Finance)**: Menambahkan `FINANCE` sebagai role RBAC resmi tersendiri di dalam sistem ERP, memisahkannya dari role `SALES`.

---

## 1. Overview & Core Concept

- **What It Does**: Memperkuat backend dan alur interaksi frontend Document Workspace Studio sehingga seluruh proses pembuatan dokumen, penyimpanan draf, pengajuan otorisasi (submit), persetujuan (approve), dan permintaan revisi berjalan aman, atomik, dan patuh terhadap aturan Role-Based Access Control (RBAC).
- **Target Audience / Persona**:
  - *Pembuat Dokumen (Authors)*: Pengguna dari seluruh divisi operasional (Purchasing, HR, Production, Warehouse, Engineering, Finance, Sales).
  - *Pejabat Berwenang (Department Approvers & Factory Controller)*: Approver yang memverifikasi dan menandatangani dokumen sesuai kewenangan departemen.
- **Key Value**: Menjamin dokumen bisnis dan surat perintah kerja memiliki kepastian hukum, tidak dapat dimanipulasi statusnya oleh pihak tak berwenang, serta memiliki audit trail yang valid dan terpercaya.

---

## 2. User Experience & Visual Design

- **State Guards & Read-Only Locks**:
  - Pada dokumen berstatus `APPROVED`, editor kanvas dan form properties dinonaktifkan (`isEditable = false`), badge tanda tangan menampilkan stempel hijau "APPROVED" yang sah, dan tombol edit diubah menjadi opsi *"Buat Versi Baru / Klon Dokumen"*.
  - Pada status `PENDING_APPROVAL`, dokumen dikunci dari pengeditan langsung oleh pembuat untuk menjaga integritas substansi yang sedang ditinjau.
- **Feedback & Error Transparency**:
  - Submit approval berjalan dalam satu langkah atomik dengan indikator pemrosesan; jika terjadi penolakan atau validasi gagal, UI menampilkan pesan error spesifik (HTTP 400), bukan error generik 500.
- **Badge & Tampilan Role Finance**:
  - Menghadirkan badge dan filter departemen `FINANCE` tersendiri dengan aksen emerald (`bg-emerald-50 border-emerald-200 text-emerald-800`), sejajar dengan 7 departemen ERP lainnya.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Penghapusan `status` dari Whitelist Update Umum (`PUT`)**
  - *Chosen Approach*: Status dokumen hanya dapat berubah melalui endpoint transisi state machine (`/submit`, `/approve`, `/revise`). Payload pada endpoint update umum dilarang memuat perubahan field `status`.
  - *Why*: Menghilangkan celah bypass P0-01 di mana client sembarang dapat mengirimkan `{"status": "APPROVED"}`.
- **Decision 2: Penegakan Otorisasi Approver Berbasis Sesi JWT**
  - *Chosen Approach*: Mengabaikan header `x-user-username` dan `x-user-name` yang tidak terpercaya; backend memvalidasi identitas approver langsung dari `req.user` (JWT session) dan memverifikasi fungsi `canUserApproveDepartment(userRole, doc.authorization_department)`.
  - *Why*: Menutup celah P0-02 dan P0-03 sehingga user dari departemen lain (misal Sales) tidak dapat menyetujui dokumen Purchasing/Finance.
- **Decision 3: Penomoran Dokumen Berbasis Sequence Atomik**
  - *Chosen Approach*: Menggantikan kalkulasi `COUNT(*) + 1` dengan tabel sequence (`document_sequences`) yang di-increment secara atomik dalam transaksi pembuatan dokumen.
  - *Why*: Menutup celah P0-05 yang menyebabkan tabrakan nomor unik (unique constraint violation) jika ada dokumen terdahulu yang dihapus.
- **Decision 4: State Immutability untuk Dokumen `APPROVED`**
  - *Chosen Approach*: Menolak mutasi `PUT` atau `DELETE` pada dokumen `APPROVED`. Menambahkan tombol *"Klon sebagai Revisi Baru"* di UI jika ada kebutuhan modifikasi dokumen setelah disahkan.

---

## 4. Technical Architecture & Data Strategy

### System Workflow & RBAC State Machine

```
   ┌──────────────────────────────────────────────────────────────┐
   │                     DRAFT (Editable by Author)               │
   └──────────────────────────────┬───────────────────────────────┘
                                  │ POST /submit (Atomic)
                                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │               PENDING_APPROVAL (Locked for Review)           │
   └───────────────┬──────────────────────────────┬───────────────┘
                   │                              │
  POST /approve    │                              │ POST /revise
  (Dept Role / FC) │                              │ (Requires Note)
                   ▼                              ▼
┌─────────────────────────────────┐   ┌───────────────────────────┐
│       APPROVED (Immutable)      │   │     REVISION_REQUIRED     │
│  - Locked permanently           │   │  - Unlocks Draft Editor   │
│  - Clone for new version        │   │  - Author addresses note  │
└─────────────────────────────────┘   └─────────────┬─────────────┘
                                                    │ Resubmit
                                                    └─────────► [PENDING_APPROVAL]
```

### Backend & Data Schema Hardening

1. **Tabel Sequence Dokumen (`document_sequences`)**:
   ```sql
   CREATE TABLE IF NOT EXISTS document_sequences (
     scope TEXT PRIMARY KEY,
     next_val INTEGER NOT NULL DEFAULT 1,
     updated_at TEXT NOT NULL
   );
   ```
2. **Schema Validator & Request Sanitizer (Zod)**:
   - Validasi payload `title`, `content` (`DocBlock[]`), `document_type`, dan `layout_preset`.
   - Mengembalikan HTTP 400 dengan rincian `fieldErrors` jika payload tidak valid.
3. **Penyelarasan RBAC Role Finance**:
   - Update `src/constants/rbac.ts` untuk menyertakan `FINANCE` dalam `ERPDepartmentRole` dan `ERP_DEPARTMENT_OPTIONS`.
   - Update `normalizeDepartmentToRole` agar mengenali keyword `FINANCE`, `ACCOUNTING`, `KEUANGAN` sebagai role `FINANCE`.
   - Update `DEPARTMENT_ROUTING_CONFIG` di `CanvaStudioEditor.tsx` agar mengarahkan blok tanda tangan Finance ke role `FINANCE`.
4. **Endpoint Transaksional Baru**:
   - `POST /api/workspace-documents/:id/submit`: Menyimpan content terakhir dan mengubah status ke `PENDING_APPROVAL` dalam satu transaksi database.
   - `POST /api/workspace-documents/:id/clone`: Membuat draf baru dari dokumen yang sudah disetujui untuk siklus revisi formal.
