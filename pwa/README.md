# Product Requirements Document (PRD) & Cetak Biru Arsitektur Mobile Native
## Paving Joss ERP — Aplikasi Mobile Android (Kotlin) & iOS (Swift)

> **Status Dokumen**: Final Blueprint & Reference Package (`v1.0`)
> **Target Platform**: Native iOS (**Swift / SwiftUI**) & Native Android (**Kotlin / Jetpack Compose**)
> **Pola Integrasi Backend**: Konsumsi Langsung **Express ERP REST API + Socket.IO** dengan **PostgreSQL sebagai Single Source of Truth (SSOT)**
> **Prioritas Prototipe (Fase 1)**: **HR Portal (HRIS & ESS)** dan **Messages (Chat, Forum & Otorisasi Dokumen ERP)** berjalan sempurna 100% *end-to-end* sebelum ekspansi ke **Fase 2 (Shop Floor 2-Way & Back-Office ERP Hub)**.
> **Isolasi Direktori**: Seluruh isi direktori `pwa/` ini adalah paket referensi mandiri (*read-only reference blueprint*) dan **tidak terhubung, tidak di-import, serta tidak dikompilasi** oleh proyek Web ERP utama (`tsconfig.json` & `vite.config.ts` mengecualikan `pwa/`).

---

## Daftar Isi

1. [Visi Produk, Persona Pengguna & Ruang Lingkup Akses](#1-visi-produk-persona-pengguna--ruang-lingkup-akses)
2. [Peta Struktur Direktori Referensi (`pwa/`)](#2-peta-struktur-direktori-referensi-pwa)
3. [Standar Desain Visual & UI Parity (Web ERP ke SwiftUI & Jetpack Compose)](#3-standar-desain-visual--ui-parity-web-erp-ke-swiftui--jetpack-compose)
4. [Arsitektur Backend, PostgreSQL SSOT & Keamanan Autentikasi](#4-arsitektur-backend-postgresql-ssot--keamanan-autentikasi)
5. [Spesifikasi Fungsional & Kontrak API — Fase 1 (Prototipe: HR Portal/ESS & Message)](#5-spesifikasi-fungsional--kontrak-api--fase-1-prototipe-hr-portaless--message)
6. [Spesifikasi Fungsional & Kontrak API — Fase 2 (Shop Floor 2-Way & Back-Office ERP Hub)](#6-spesifikasi-fungsional--kontrak-api--fase-2-shop-floor-2-way--back-office-erp-hub)
7. [Arsitektur Real-Time (Socket.IO) & Dukungan Offline-First (SwiftData / Room)](#7-arsitektur-real-time-socketio--dukungan-offline-first-swiftdata--room)
8. [Batasan Mutlak, Aturan Bisnis & Guardrails Pengembangan](#8-batasan-mutlak-aturan-bisnis--guardrails-pengembangan)
9. [Checklist Penerimaan Prototipe (Definition of Done)](#9-checklist-penerimaan-prototipe-definition-of-done)

---

## 1. Visi Produk, Persona Pengguna & Ruang Lingkup Akses

Aplikasi mobile native **Paving Joss ERP** dirancang untuk digunakan oleh **seluruh karyawan perusahaan**—mulai dari operator mesin di lantai pabrik hingga staf back-office, supervisor, manajer departemen, dan jajaran direksi (BOD/FC)—dengan satu basis data terpadu (**PostgreSQL SSOT + SQLite WAL Cache**) yang identik dengan Web ERP.

### 1.1 Matriks Persona & Hak Akses (`app_scope`)

Saat pengguna login melalui `POST /api/mobile/auth/login`, backend secara otomatis menentukan `app_scope` dan `allowed_modules` berdasarkan peran (`role`) dan jenjang (`level`):

| Persona | Role di Database (`users.role`) | Nilai `app_scope` | Modul yang Diizinkan (`allowed_modules`) | Akses Web ERP Desktop | Navigasi Bawah Mobile (Bottom Bar) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Operator Lantai Produksi** | `OPERATOR` | `OPERATOR_MOBILE` | `MESSAGE`, `ESS`, `SHOPFLOOR_2WAY` | **Diblokir** (`403 OPERATOR_MOBILE_ONLY`) | 1. **Shop Floor** (`/shopfloor`)<br>2. **Messages** (`/forum`)<br>3. **HR Portal / ESS** (`/ess`)<br>4. **System Info / Profil** |
| **Staf, Supervisor & Manajer Back-Office** | `SALES`, `PURCHASING`, `WAREHOUSE`, `PRODUCTION`, `PPIC`, `QA_QC`, `ENGINEERING`, `FINANCE`, `HR` | `BACKOFFICE_MOBILE` | `MESSAGE`, `ESS`, `SHOPFLOOR_2WAY`, `ERP_MOBILE`, `HRIS_MOBILE` | **Diizinkan** (Sesuai RBAC/PBAC) | 1. **Home** (`/erp`)<br>2. **Role Action Hub** (`/erp?tab=hub`)<br>3. **Messages** (`/forum`)<br>4. **HR Portal** (`/ess` & `/hr`) |
| **Eksekutif / Full Control** | `FC`, `BOD`, `DIRECTOR`, `ADMIN`, `SUPERADMIN`, `GOD_MODE` | `BACKOFFICE_MOBILE` | Seluruh modul + Otorisasi Penuh Lintas Departemen | **Diizinkan Penuh** | 1. **Home** (`/erp`)<br>2. **Exec Hub** (`/erp?tab=hub`)<br>3. **Messages** (`/forum`)<br>4. **HR Portal** (`/ess` & `/hr`) |

---

## 2. Peta Struktur Direktori Referensi (`pwa/`)

Seluruh file sumber Frontend, Backend, Database, Desain UI, dan Starter Native telah disalin dan dikelompokkan berdasarkan fase pengerjaan di dalam direktori `pwa/`:

| Sub-Direktori di `pwa/` | Isi File Referensi Utama | Tujuan Penggunaan bagi Developer iOS & Android |
| :--- | :--- | :--- |
| `01-foundation-ui-and-auth/` | `styles/index.css`, `ui-primitives/*`, `mobile-shell/MobileAppShell.tsx`, `DesktopModeNotice.tsx`, `OfflineIndicator.tsx`, `auth-and-pbac/{auth.ts, pbac.ts, rbac.ts}`, `contexts/*` | Acuan sistem desain (token warna, tipografi, komponen kartu/modal/badge), kerangka navigasi mobile, aturan PBAC per-role, dan pembangkit **Daily 6-Digit Auth Key (PIN)**. |
| `02-phase1-prototype-hr-ess-message/` | **HR Portal & ESS**: `HrPortal.tsx`, `SelfService.tsx`, `IsometricHero.tsx`, `hrisTypes.ts`, `ess/{LeaveRequestModal, PayslipModal}.tsx`, `tabs/{Attendance, Leave, Payroll, Kpi, Directory, Handover, ...}.tsx`, `modals/{RequisitionModal, PrqViewModal, PrqConfirmModal}.tsx`, `engine/{hrisEngine, hrDocuments, closingEngine}.ts`<br>**Message & Forum**: `Forum.tsx`, `forumTypes.ts`, `ForumSidebar.tsx`, `ForumChatHeader.tsx`, `ForumMessageStream.tsx`, `ForumComposer.tsx`, `ForumModals.tsx`, serta modal pratinjau dokumen (`NtpPreviewModal`, `QuotationPreviewModal`, `PoDocumentModal`, `PrDetailsModal`, `InvoicePreviewModal`). | **Acuan Utama Fase 1 (Prototipe)**: Seluruh logika layar, validasi form, kalkulasi jam/gaji/cuti, percakapan chat real-time, terusan pesan multi-penerima, penyematan pesan, dan kartu otorisasi dokumen ERP di dalam chat. |
| `03-phase2-shopfloor-and-backoffice/` | **Shop Floor Terminal**: `FloorTerminal.tsx`, `ShopFloor.tsx`, `SetupMaster.tsx`, `wotCycle.ts`, `bopGraph.ts`<br>**Back-Office Hub**: `MobileMonitorHub.tsx`, `monitorTypes.ts`, `hub/{MobileHomeDashboard, MobileRoleActionHub, MobileInspectorSheet}.tsx`, `Overview.tsx` | **Acuan Fase 2 (Lanjutan)**: Terminal 2-arah Operator <-> Supervisor (WOT, BOP, Material Request, NDP Downtime, Shift Handover) dan Mobile Monitor Hub 8 kategori untuk Back-Office. |
| `04-backend-api-and-realtime/` | **Phase 1 Routes**: `mobile.ts`, `auth.ts`, `hr.ts`, `attendance.ts`, `payroll.ts`, `chat.ts`, `forum.ts`, `users.ts`, `upload.ts`<br>**Phase 2 Routes**: `dashboard.ts`, `projects.ts`, `production.ts`, `inventory.ts`, `purchasing.ts`, `sales.ts`, `finance.ts`, `workflow.ts`, `requests.ts`, `system.ts`, `closing.ts`, `integrity.ts`<br>**Middleware & Services**: `server.ts`, `serverBootstrap.ts`, `outboxService.ts`, `workflowEngine.ts`, `financialEngine.ts`, `idempotency.ts` | Kontrak kebenaran (*ground truth*) untuk setiap endpoint REST API, query database, validasi input, aturan otorisasi PIN 6-digit, serta event **Socket.IO**. |
| `05-database-postgresql-and-offline/` | **Database & PostgreSQL SSOT**: `database.ts`, `postgresClient.ts`, `postgresBridge.ts`, `pgMigrator.ts`, `migrator.ts`, `migrations/01_core.ts` s/d `06_hris.ts`<br>**Client Offline & Sync**: `localDb.ts`, `api.ts`, `smartCache.ts`, `useSyncEngine.ts`, `useOnlineStatus.ts`, `useAutoSave.ts` | Definisi tabel relasional lengkap, mekanisme replikasi dua arah **SQLite WAL <-> Supabase PostgreSQL (`public.erp_sync_records`)**, serta pola antrean offline dan *Stale-While-Revalidate* cache. |
| `06-native-starter-specs/` | `ios-swift/PavingJossNativeCore.swift`<br>`android-kotlin/PavingJossNativeCore.kt` | Kode starter native siap pakai dalam **Swift** dan **Kotlin** yang mengimplementasikan token warna, algoritma **Daily 6-Digit Auth Key** identik bit-per-bit, model DTO Fase 1, klien HTTP ber-idempotency, dan skema antrean offline. |

---

## 3. Standar Desain Visual & UI Parity (Web ERP ke SwiftUI & Jetpack Compose)

Aplikasi mobile Android dan iOS **wajib memiliki tampilan, nuansa, dan tata letak yang selaras 100% dengan Web ERP** (acuan utama: `01-foundation-ui-and-auth/styles/index.css` dan `01-foundation-ui-and-auth/mobile-shell/MobileAppShell.tsx`).

### 3.1 Sistem Tema Visual Ganda (*Dual Visual Language*)

Web ERP menerapkan dua atmosfer visual yang berbeda berdasarkan konteks modul. Aplikasi mobile native wajib mengganti tema permukaan secara dinamis saat pengguna berpindah tab:

1. **Tema 1 — Warm Monochrome Industrial (Digunakan pada: Shell Utama, Messages/Forum, Shop Floor, & Back-Office ERP Hub)**
   - **Karakter**: Utilitarian, presisi tinggi, bersih, menggunakan gradasi *Warm Stone* dengan permukaan kartu putih tegas (`#FFFFFF`), garis tepi tipis `1px` (`#E7E5E4`), dan tombol utama hitam-arang (`#1C1917`).
   - **Aturan Warna Merah**: Warna merah kop surat (`#B02524` / `--color-letterhead-red`) dan merah semantik (`#EF4444`) **dilarang** digunakan sebagai warna tombol aksi primer umum; warna merah hanya boleh digunakan untuk identitas resmi Kop Surat dokumen dan aksi destruktif/darurat (seperti *Reject*, *Delete*, atau *Machine Breakdown NDP*).
2. **Tema 2 — Airy Frosted Glass `.hris-theme` (Digunakan khusus pada: HR Portal & ESS)**
   - **Karakter**: Terinspirasi *Apple visionOS / macOS & Amie*—menggunakan permukaan latar *Clean Alabaster* (`#F7F7F9`), kartu putih dengan bayangan lembut berlapis (`rgba(18, 19, 24, 0.06)`), panel kaca buram (*frosted glass* `backdrop-blur`), serta aksen sekunder **Soft Coral-Terracotta** (`#F25730`) dan **Fresh Mint-Emerald** (`#10B981`).

### 3.2 Tabel Pemetaan Token Warna (CSS -> SwiftUI -> Jetpack Compose)

| Nama Token | Nilai Hex | Penggunaan di UI | SwiftUI (`PavingJossTheme`) | Jetpack Compose (`PavingJossTokens`) |
| :--- | :--- | :--- | :--- | :--- |
| `--color-stone-50` | `#FAFAF9` | Latar belakang kanvas utama ERP & Messages | `Stone.s50` | `Stone.S50` |
| `--color-stone-100` | `#F5F5F4` | Latar tombol sekunder, chip filter, header tabel | `Stone.s100` | `Stone.S100` |
| `--color-stone-200` | `#E7E5E4` | Garis tepi kartu (`1pt/1dp`), pembagi daftar | `Stone.s200` | `Stone.S200` |
| `--color-stone-500` | `#78716C` | Teks sekunder, label metadata, waktu pesan | `Stone.s500` | `Stone.S500` |
| `--color-stone-700` | `#44403C` | Teks isi utama & ikon navigasi aktif | `Stone.s700` | `Stone.S700` |
| `--color-stone-900` / `--color-brand` | `#1C1917` | Tombol aksi primer, badge jumlah belum dibaca, kartu profil | `Stone.s900` / `Brand.primary` | `Stone.S900` / `Brand.Primary` |
| `--color-paving-yellow` | `#FFD700` | Aksen ikon kunci **Daily 6-Digit Auth Key** di atas latar `#1C1917` | `Brand.pavingYellow` | `Brand.PavingYellow` |
| `--color-letterhead-red` | `#B02524` | Garis kop surat dokumen resmi & status kritis | `Brand.letterheadRed` | `Brand.LetterheadRed` |
| `.hris-theme --color-stone-50` | `#F7F7F9` | Latar belakang utama layar **HR Portal / ESS** | `HrisAlabaster.s50` | `HrisAlabaster.S50` |
| `.hris-theme --color-stone-200` | `#E2E3EA` | Garis tepi kartu pada layar **HR Portal / ESS** | `HrisAlabaster.s200` | `HrisAlabaster.S200` |
| `.hris-theme --color-stone-900` | `#121318` | Teks judul & angka utama pada layar **HR Portal / ESS** | `HrisAlabaster.s900` | `HrisAlabaster.S900` |
| `.hris-theme --color-violet-500` | `#F25730` | Aksen Coral-Terracotta pada highlight HRIS | `HrisAlabaster.coral500` | `HrisAlabaster.Coral500` |
| `--color-emerald-500` | `#10B981` | Status *Approved*, *Passed*, *Clocked-In*, *Paid*, *Online* | `Brand.emerald500` | `Brand.Emerald500` |
| `--color-amber-500` | `#F59E0B` | Status *Pending*, *Waiting Approval*, *Draft*, *Paused* | `Brand.amber500` | `Brand.Amber500` |
| `--color-red-500` | `#EF4444` | Status *Rejected*, *Overdue*, *Urgent*, *Machine Down* | `Brand.red500` | `Brand.Red500` |
| `--color-blue-500` | `#3B82F6` | Status *In Progress*, *Issued*, *Information* | `Brand.blue500` | `Brand.Blue500` |

### 3.3 Tipografi & Aturan Angka Tabular

1. **Keluarga Huruf Wajib**:
   - **Sans-Serif Utama (`--font-sans`)**: **Plus Jakarta Sans** (fallback ke *SF Pro* di iOS atau *Inter/Roboto* hanya jika font belum termuat; namun bundel aplikasi native **wajib menyertakan file `.ttf` Plus Jakarta Sans** dan **JetBrains Mono**).
   - **Monospace Teknis (`--font-mono`)**: **JetBrains Mono** — wajib digunakan untuk:
     - Nomor dokumen (`PR/...`, `PO/...`, `QUO/...`, `NTP/...`, `WOT-...`, `ATT-...`)
     - Nominal uang Rupiah (`Rp 12.500.000`)
     - Jam digital berjalan (`08:14:22 WIB`)
     - **Daily 6-Digit Auth Key (PIN)** (`K7M9P2`)
     - Badge role & level (`OPERATOR · STAFF`, `PURCHASING · MANAGER`)
   - **Display Serif (`--font-display`)**: **Fraunces** — hanya digunakan pada tajuk pratinjau dokumen resmi.
2. **Disiplin `tabular-nums`**:
   - Di SwiftUI: selalu terapkan `.monospacedDigit()` pada setiap `Text` yang menampilkan jam, hitungan mundur, persentase, kuota cuti, kuantitas barang, dan nominal Rupiah.
   - Di Jetpack Compose: selalu terapkan `fontFeatureSettings = "tnum"` pada `TextStyle` angka agar tata letak tidak bergeser saat angka berubah secara *real-time*.

### 3.4 Aturan Tata Letak & Ergonomi Mobile Native

1. **Top App Bar Kompak (`56pt / 56dp`)**:
   - Latar `white/95` dengan blur halus (`ultraThinMaterial` di iOS / `Surface` transparan di Android) dan border bawah `1px` (`#E7E5E4`).
   - Sisi kiri: Tombol kembali (`36x36` rounded `12dp`) atau logo Paving Joss, diikuti judul layar (`14sp Bold`) dan subjudul monospace (`10sp SemiBold`, misal `PRODUCTION · SUPERVISOR`).
   - Sisi kanan: Tombol **System Info & Key** (membuka *Bottom Sheet* profil + PIN Harian 6-digit) dan tombol **Loncing Notifikasi** dengan lencana angka merah/hitam.
2. **Bottom Navigation Bar (`64pt / 64dp`, 4 Tab Tetap)**:
   - Setiap item memiliki target sentuh minimal `48pt/48dp`, indikator aktif berbentuk kapsul lembut (`bg-stone-100` dengan ikon `16dp` dan label `10sp Bold`), serta lencana *unread count* pada tab **Messages**.
3. **Anti Horizontal-Scroll Table Rule**:
   - Di layar mobile, **dilarang menampilkan tabel lebar yang harus digeser ke kanan-kiri**. Seluruh daftar absensi, pengajuan cuti, slip gaji, antrean PR/PO, dan Work Order Ticket wajib dirender sebagai **Vertical Stack Card** (`rounded-2xl` / `16dp`, padding `14dp–16dp`, border `1dp #E7E5E4`) dengan struktur baris *Header (Kode + Badge Status)*, *Isi Utama (Judul + Subjudul)*, dan *Footer Metrik/Tombol Aksi*.
4. **Zero-Pill Discipline untuk Komponen Input & Tombol**:
   - Gunakan sudut `12dp` (`rounded-xl`) atau `16dp` (`rounded-2xl`) untuk tombol aksi, input teks, dan kartu. Hindari bentuk *full pill* (`999dp`) pada tombol formulir utama agar tetap konsisten dengan karakter industrial ERP.

---

## 4. Arsitektur Backend, PostgreSQL SSOT & Keamanan Autentikasi

### 4.1 Arsitektur Database Hibrida (PostgreSQL SSOT + SQLite WAL)

Aplikasi mobile **tidak boleh** membuat database terpisah di cloud lain dan **tidak boleh** mengakses koneksi PostgreSQL secara langsung dari perangkat pengguna. Seluruh aliran data mengikuti arsitektur 2-Engine yang sudah berjalan di server Express ERP (lihat referensi: `05-database-postgresql-and-offline/postgresql-ssot-and-migrations/`):

```
[Aplikasi iOS (Swift)] ──┐
                         ├──► [Express ERP API + Socket.IO] ◄──► [SQLite WAL Primary (erp.db + hr_attendance.db)]
[Aplikasi Android (KT)] ─┘                 │                                       ▲
                                           ▼                                       │
                                  [Outbox & Delta Sync Worker] ◄───────────────────┘
                                           │
                                           ▼
                        [Supabase Cloud PostgreSQL SSOT (public.erp_sync_records)]
```

- **Saat Server Startup**: `rehydrateSqliteFromSupabase()` memulihkan seluruh rekaman dari tabel PostgreSQL `public.erp_sync_records` ke dalam cache SQLite WAL lokal.
- **Saat Mobile Melakukan Mutasi (POST/PUT/DELETE)**:
  1. Endpoint Express menulis transaksi secara atomik ke SQLite WAL (`<1ms` latency).
  2. Endpoint memicu `syncSingleTableToPostgres("<nama_tabel>")` atau memasukkan event ke `outboxService` untuk direplikasi ke PostgreSQL (`public.erp_sync_records`).
  3. Endpoint memancarkan event **Socket.IO** (`chat:message`, `workflow:updated`, atau `production:updated`) sehingga Web ERP dan perangkat mobile lain langsung terbarui.
- **Endpoint Verifikasi Paritas Database**:
  - `GET /api/mobile/bootstrap`: Mengembalikan profil sesi aktif sekaligus blok `database_identity` (jumlah baris live, status jurnal WAL, timestamp sinkronisasi terakhir PostgreSQL).
  - `GET /api/mobile/db-status`: Mengembalikan telemetri lengkap koneksi PostgreSQL (`EXTERNAL_PG` / `SUPABASE_REST`), daftar seluruh tabel yang dibagi bersama Web ERP, dan status replikasi.
  - `POST /api/mobile/postgres/sync`: Memicu sinkronisasi paksa seluruh tabel ke PostgreSQL SSOT.

### 4.2 Protokol Autentikasi JWT & Header Wajib

1. **Login Endpoint**: `POST /api/mobile/auth/login`
   - **Request Body**:
     ```json
     {
       "username": "budi.operator",
       "password": "password123",
       "platform": "iOS"
     }
     ```
   - **Response (`200 OK`)**:
     ```json
     {
       "success": true,
       "token": "<JWT_7_DAYS>",
       "user": {
         "id": "USER-01",
         "username": "budi.operator",
         "role": "OPERATOR",
         "level": "STAFF",
         "name": "Budi Santoso",
         "status": "APPROVED",
         "employee_no": "EMP-2026-014",
         "work_center_id": "WC-PRESS-01",
         "contract_type": "PKWT",
         "join_date": "2025-01-10"
       },
       "app_scope": "OPERATOR_MOBILE",
       "allowed_modules": ["MESSAGE", "ESS", "SHOPFLOOR_2WAY"],
       "manpower": { "id": "MP-01", "name": "Budi Santoso", "status": "ON_DUTY", "hourly_rate": 45000 },
       "assigned_machine": { "id": "MC-01", "item_code": "MC - 001", "name": "Hydraulic Paving Press HPP-500", "status": "ACTIVE" }
     }
     ```
2. **Penyimpanan Token di Perangkat Native**:
   - **iOS**: Simpan `token` di **Keychain Services** (bukan `UserDefaults` biasa).
   - **Android**: Simpan `token` di **EncryptedSharedPreferences / Jetpack DataStore + Android Keystore**.
3. **Header Standar pada Setiap Request HTTP**:
   - `Authorization: Bearer <token>`
   - `x-user-email: <user.username>`
   - `x-client-platform: mobile-app`
   - `x-mobile-os: iOS` atau `Android`
   - `x-idempotency-key: <unique_key>` (Wajib untuk seluruh request `POST`, `PUT`, `PATCH`, `DELETE` guna mencegah eksekusi ganda saat sinyal tidak stabil).

### 4.3 Algoritma **Daily 6-Digit Auth Key (PIN)**

Dokumen ERP sensitif (PR, PO, Quotation, Delivery, Cuti, SPK, serta Payroll Requisition) memerlukan **6-Digit Daily Auth Key** yang berubah setiap hari per-username.
- Algoritma deterministik mengombinasikan `username.trim().toLowerCase() + YYYY-MM-DD (UTC) + secretSeed ("_sec_fhtbs_2026")` menggunakan *32-bit signed integer hash* dan memetakannya ke 6 karakter dari himpunan `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (tanpa karakter ambigu `0, O, 1, I`).
- Implementasi referensi asli ada di `01-foundation-ui-and-auth/auth-and-pbac/auth.ts`, dan sudah diterjemahkan secara presisi ke **Swift** (`PavingJossNativeCore.swift`) serta **Kotlin** (`PavingJossNativeCore.kt`).
- Selain dihitung secara lokal untuk ditampilkan pada *System Info Bottom Sheet*, aplikasi mobile juga dapat memverifikasi/mengambil kunci harian dari server melalui `GET /api/auth/daily-key`.

---

## 5. Spesifikasi Fungsional & Kontrak API — Fase 1 (Prototipe: HR Portal/ESS & Message)

> **KRUSIAL UNTUK PROTOTIPE**: Pada tahap prototipe pertama, aplikasi iOS dan Android **wajib dapat menjalankan seluruh fitur HR Portal (ESS & Manajemen HR sesuai role) serta Messages (Chat, Forum, Lampiran, & Otorisasi Dokumen ERP) secara utuh dan bebas bug**.

### 5.1 Modul 1: HR Portal & Employee Self-Service (ESS)

Referensi Frontend:
- `02-phase1-prototype-hr-ess-message/hr-portal-and-ess/pages/SelfService.tsx`
- `02-phase1-prototype-hr-ess-message/hr-portal-and-ess/pages/HrPortal.tsx`
- `02-phase1-prototype-hr-ess-message/hr-portal-and-ess/components/ess/{LeaveRequestModal.tsx, PayslipModal.tsx}`
- `02-phase1-prototype-hr-ess-message/hr-portal-and-ess/components/tabs/*`

Referensi Backend:
- `04-backend-api-and-realtime/routes-phase1-prototype/{mobile.ts, attendance.ts, hr.ts, payroll.ts}`

#### A. Fitur Wajib di Layar ESS (Untuk Seluruh Karyawan & Operator)
1. **Header Kartu Identitas & Jam Server Jakarta (`Asia/Jakarta`)**:
   - Menampilkan nama karyawan, nomor induk (`employee_no`), departemen/role, dan jam digital *real-time* dalam zona waktu `Asia/Jakarta (GMT+7)` dengan format tabular (`HH:mm:ss WIB`).
   - Memuat data awal secara instan melalui `GET /api/mobile/ess-summary` (mengembalikan profil lengkap, absensi hari ini + 14 hari terakhir, kuota cuti 12 hari + daftar pengajuan, slip gaji 6 bulan terakhir, skor KPI terbaru, dan jadwal lembur).
2. **Tab 1 — Attendance (Absensi Harian & Shift Pabrik)**:
   - Menampilkan status kehadiran hari ini (`BELUM CLOCK-IN`, `SEDANG BERTUGAS / CLOCKED-IN`, atau `SELESAI / CLOCKED-OUT`).
   - Pilihan Shift kerja sesuai konstanta `FACTORY_SHIFTS` (`GET /api/hr/shifts`):
     - `SHIFT_1`: Shift 1 - Pagi (`07:00 - 15:00`, 8 jam, pengali `1.0x`)
     - `SHIFT_2`: Shift 2 - Siang/Sore (`15:00 - 23:00`, 8 jam, pengali `1.0x`)
     - `SHIFT_3`: Shift 3 - Malam (`23:00 - 07:00`, 8 jam, pengali `1.1x` *Night Differential*)
     - `GENERAL`: General Office (`08:00 - 17:00`, 8 jam, pengali `1.0x`)
   - **Aksi Clock-In**: Memanggil `POST /api/hr/attendances/clock-in` dengan payload:
     ```json
     {
       "shift": "SHIFT_1",
       "location": "-7.2575, 112.7521 (Pabrik Paving Joss)",
       "project_id": "PRJ-2026-001"
     }
     ```
     *(Catatan: Waktu absensi ditentukan oleh jam anti-manipulasi server `getSecureJakartaTime()` di backend, bukan jam lokal perangkat).*
   - **Aksi Clock-Out**: Memanggil `PUT /api/hr/attendances/clock-out` dengan payload `{"location": "..."}`. Server otomatis menghitung `work_hours` dan `labor_cost`, serta memperbarui HPP proyek terkait.
   - **Daftar Riwayat Absensi**: Menampilkan kartu riwayat kehadiran beserta jam masuk, jam pulang, durasi kerja, dan status lembur.
3. **Tab 2 — Leave Management (Saldo & Pengajuan Cuti)**:
   - Menampilkan 3 kartu ringkasan metrik: **Kuota Tahunan (`12 Hari`)**, **Cuti Terpakai (`used_days`)**, dan **Sisa Kuota (`remaining_days`)**.
   - **Modal Pengajuan Cuti Baru** (`POST /api/hr/leaves`):
     - Pilihan `leave_type`: `"Annual Paid Leave"`, `"Sick Leave"`, `"Special Permit / Marriage / Bereavement"`, `"Maternity / Paternity Leave"`, `"Unpaid Leave"`.
     - Input `start_date` (`YYYY-MM-DD`), `end_date` (`YYYY-MM-DD`), dan `reason`.
     - Validasi wajib di sisi klien & server: `end_date >= start_date`, serta tidak boleh beririsan (*overlap*) dengan cuti berstatus `PENDING` atau `APPROVED` milik karyawan tersebut.
     - Jika pemohon berlevel `MANAGER` atau `FC`, cuti langsung berstatus `APPROVED` otomatis; selain itu berstatus `PENDING`.
   - **Mode Manajer / HR (`TEAM_APPROVALS`)**:
     - Jika pengguna login memiliki `level == "MANAGER"` atau `role` termasuk `HR` / `FC` / `EXECUTIVE`, tampilkan saklar **Personal View <-> Team Approvals**.
     - Di tab *Team Approvals*, manajer dapat mengisi catatan (`manager_note`) dan menekan **Approve** atau **Reject** yang memanggil `PUT /api/hr/leaves/:id/status` dengan body `{"status": "APPROVED" | "REJECTED", "manager_note": "..."}`.
4. **Tab 3 — Payslips (Slip Gaji Digital & Rincian Kompensasi)**:
   - Memuat daftar slip gaji yang telah diterbitkan (`PUBLISHED` / `PAID`) dari `GET /api/hr/payslips` atau blok `compensation.payslips` pada `ess-summary`.
   - Menekan kartu slip gaji membuka **Payslip Detail Sheet** (acuan: `PayslipModal.tsx`) yang menampilkan:
     - Identitas karyawan, periode bulan (`period_month`), status pembayaran.
     - Rincian Penerimaan: Gaji Pokok (`basic_salary`), Tunjangan & Lembur (`allowances`).
     - Rincian Potongan: Potongan Absensi, BPJS Kesehatan & Ketenagakerjaan, PPh 21 (`deductions`).
     - **Take-Home Pay (`net_salary`)** dengan format Rupiah (`Rp ...`) menggunakan huruf monospace tebal.
5. **Sub-Modul HRIS Lanjutan (Khusus Role `HR`, `FC`, `BOD`, & `MANAGER` di Mobile)**:
   - Mengacu pada `HrPortal.tsx`, pengguna berwenang dapat mengakses tab **Directory Karyawan** (`GET /api/users`), **Penilaian KPI** (`GET/POST /api/hr/kpis`), **Serah Terima / Handover** (`GET/POST/PUT /api/hr/handovers`), serta **Otorisasi Payroll Requisition (PRq)** (`GET /api/hr/payroll-requisitions`, `GET /api/hr/payroll-requisitions/:id`) menggunakan PIN 6-digit.

---

### 5.2 Modul 2: Messages (Chat, Forum & Integrasi Dokumen ERP)

Referensi Frontend:
- `02-phase1-prototype-hr-ess-message/message-and-forum/pages/{Forum.tsx, forumTypes.ts}`
- `02-phase1-prototype-hr-ess-message/message-and-forum/components/{ForumSidebar.tsx, ForumChatHeader.tsx, ForumMessageStream.tsx, ForumComposer.tsx, ForumModals.tsx}`

Referensi Backend:
- `04-backend-api-and-realtime/routes-phase1-prototype/{chat.ts, forum.ts, upload.ts}`

#### A. Fitur Wajib di Layar Messages (Untuk Seluruh Karyawan, Operator & Back-Office)
1. **Daftar Thread & Lencana Pesan Belum Dibaca (`Unread Badges`)**:
   - Memanggil `GET /api/chat/threads` untuk menampilkan daftar ruang percakapan (Direct Message 1-on-1, Grup Proyek/Departemen, serta kanal bawaan `THREAD-GENERAL` "General Discussion").
   - Memanggil `GET /api/chat/unread` untuk mendapatkan total `unread_count` global dan peta `unread_by_sender`.
   - Menyediakan filter cepat: `ALL`, `UNREAD`, `GROUPS`, dan filter per-Departemen (`DEPT`), serta pencarian nama rekan kerja (`GET /api/users`) untuk memulai percakapan baru (`POST /api/chat/threads`).
2. **Ruang Percakapan (`Message Stream`) & Status Baca**:
   - Memuat pesan melalui `GET /api/chat/threads/:id/messages` dan langsung menandai pesan telah dibaca via `POST /api/chat/threads/:id/read`.
   - Mendukung tampilan:
     - **Pesan Balasan Berantai (`Quoted Reply`)**: Menampilkan cuplikan `reply_to_sender` dan `reply_to_content` yang jika disentuh akan menggulir ke pesan asli.
     - **Label Terusan (`Forwarded from ...`)**: Menampilkan indikator jika pesan memiliki `forwarded_from`.
     - **Banner Pesan Disematkan (`Pinned Message`)**: Menampilkan pesan dengan `is_pinned == 1` di bagian atas ruang chat; pengguna dapat menyematkan/melepas sematan via `POST /api/chat/messages/:id/pin`.
     - **Lampiran Gambar & Berkas**: Unggah berkas melalui `POST /api/upload` (multipart form-data), pratinjau gambar *inline* dengan *fullscreen zoomable lightbox*, dan unduh berkas dokumen.
3. **Terusan Multi-Penerima (`Multi-Recipient Forwarding`)**:
   - Menekan opsi *Forward* pada pesan membuka lembar pemilih multi-penerima (Tab: *Users*, *Managers*, *Groups*) dengan catatan tambahan opsional (`note`), lalu mengirimkannya sekaligus melalui `POST /api/chat/forward`:
     ```json
     {
       "target_thread_ids": ["THR-123"],
       "target_usernames": ["manager.purchasing", "fc.director"],
       "content": "Mohon tinjau dokumen PO berikut",
       "file_url": null,
       "forwarded_from": "staf.purchasing",
       "note": "Urgent untuk proyek Surabaya"
     }
     ```
4. **Kartu Referensi Dokumen ERP Interaktif & Otorisasi Langsung dari Chat**:
   - Di dalam komposer pesan, pengguna dapat menekan tombol **Lampirkan Dokumen ERP** yang memuat daftar dokumen aktif dari `GET /api/chat/erp-references` (mendukung tipe: `NTP`, `QUOTATION`, `PR`, `PO`, `PROJECT`, `INVOICE`).
   - Saat kartu dokumen ERP dikirim ke dalam chat, semua anggota percakapan melihat kartu status dokumen secara *live*.
   - **In-Place Document Preview**: Menekan tombol **Preview** pada kartu pesan memanggil `GET /api/chat/erp-document-preview/:type/:id` dan menampilkan lembar pratinjau dokumen lengkap (item, harga, pajak PPN/PPh, total DPP/Grand Total) **tanpa keluar dari layar Messages**.
   - **Direct Manager Authorization (Dengan PIN Harian 6-Digit)**: Jika dokumen berstatus menunggu persetujuan (`requires_auth == true`) dan pengguna adalah Manajer/Eksekutif, kartu pesan menampilkan tombol **Authorize**. Menekan tombol tersebut membuka dialog input **6-Digit Daily Auth Key**, lalu mengirim `POST /api/chat/erp-authorize`:
     ```json
     {
       "type": "PO",
       "id": "PO-2026-008",
       "pin": "K7M9P2",
       "thread_id": "THR-GENERAL"
     }
     ```

### 5.3 Ringkasan Tabel Endpoint REST API — Fase 1 (Prototipe)

| Kategori | Method & Path Endpoint | Fungsi Utama | Role Akses |
| :--- | :--- | :--- | :--- |
| **Auth** | `POST /api/mobile/auth/login` | Login mobile, menghasilkan JWT 7 hari, `app_scope`, `allowed_modules`, profil manpower & mesin | Publik -> Semua Karyawan |
| **Auth** | `GET /api/mobile/bootstrap` | Memuat profil sesi aktif & identitas paritas database PostgreSQL SSOT | Semua Karyawan |
| **Auth** | `GET /api/auth/daily-key` | Mengambil 6-Digit Daily Auth Key (PIN) hari ini untuk akun aktif | Semua Karyawan |
| **ESS / HR** | `GET /api/mobile/ess-summary` | Satu panggilan ringkas untuk seluruh kartu ESS (Profil, Absensi, Cuti, Slip Gaji, KPI, Lembur) | Semua Karyawan |
| **ESS / HR** | `GET /api/hr/shifts` | Daftar definisi 4 shift pabrik (`SHIFT_1`, `SHIFT_2`, `SHIFT_3`, `GENERAL`) | Semua Karyawan |
| **ESS / HR** | `GET /api/hr/attendances` | Riwayat absensi (mendukung query `?date=`, `?project_id=`, `?shift=`) | Semua Karyawan |
| **ESS / HR** | `POST /api/hr/attendances/clock-in` | Mencatat kehadiran masuk dengan jam server Jakarta GMT+7 & sinkron status `ON_DUTY` | Semua Karyawan |
| **ESS / HR** | `PUT /api/hr/attendances/clock-out` | Mencatat jam pulang, menghitung jam kerja & biaya tenaga kerja proyek | Semua Karyawan |
| **ESS / HR** | `GET /api/hr/leaves` | Daftar riwayat permohonan cuti & status persetujuan | Semua Karyawan |
| **ESS / HR** | `POST /api/hr/leaves` | Mengajukan cuti baru dengan validasi anti-overlap tanggal | Semua Karyawan |
| **ESS / HR** | `PUT /api/hr/leaves/:id/status` | Menyetujui (`APPROVED`) atau menolak (`REJECTED`) permohonan cuti anggota tim | Manager, HR, FC, Exec |
| **ESS / HR** | `GET /api/hr/payslips` | Daftar slip gaji karyawan (filter otomatis untuk staf, semua untuk HR/Exec) | Semua Karyawan |
| **HR Portal** | `GET /api/users` | Direktori rekan kerja untuk kontak chat & direktori HRIS | Semua Karyawan |
| **HR Portal** | `GET /api/hr/kpis` & `POST /api/hr/kpis` | Melihat & mengirim penilaian KPI karyawan | Semua (GET) / Manager & HR (POST) |
| **HR Portal** | `GET /api/hr/handovers` & `POST/PUT /api/hr/handovers` | Pelacak serah terima tugas & shift | Semua Karyawan |
| **HR Portal** | `GET /api/hr/payroll-requisitions` | Daftar dokumen pengajuan payroll bulanan (PRq) | HR, Finance, FC, BOD |
| **Message** | `GET /api/chat/unread` | Jumlah pesan belum dibaca total, per pengirim, dan pesan terbaru | Semua Karyawan |
| **Message** | `GET /api/chat/threads` & `POST /api/chat/threads` | Mengambil daftar percakapan & membuat DM/Grup baru | Semua Karyawan |
| **Message** | `GET /api/chat/threads/:id/messages` | Mengambil seluruh pesan dalam satu thread secara kronologis | Peserta Thread |
| **Message** | `POST /api/chat/threads/:id/messages` | Mengirim pesan teks, kutipan balasan, lampiran berkas, atau kartu ERP | Peserta Thread |
| **Message** | `POST /api/chat/threads/:id/read` | Menandai seluruh pesan masuk di thread tersebut sebagai sudah dibaca | Peserta Thread |
| **Message** | `POST /api/chat/forward` | Meneruskan pesan ke banyak pengguna dan/atau grup sekaligus | Semua Karyawan |
| **Message** | `POST /api/chat/messages/:id/pin` | Menyematkan atau melepas sematan pesan penting di dalam thread | Peserta Thread |
| **Message** | `DELETE /api/chat/messages/:id` | Menghapus pesan (soft/hard delete sesuai izin) | Pengirim / Admin |
| **Message** | `GET /api/chat/erp-references` | Daftar dokumen ERP aktif (NTP, PR, PO, Quotation, Project, Invoice) untuk komposer chat | Semua Karyawan |
| **Message** | `GET /api/chat/erp-document-preview/:type/:id` | Data lengkap untuk modal pratinjau dokumen ERP langsung di dalam layar chat | Semua Karyawan |
| **Message** | `POST /api/chat/erp-authorize` | Otorisasi langsung dokumen PR/PO/Quotation/NTP dari kartu chat dengan PIN 6-digit | Manager & Executive |
| **Forum** | `GET/POST /api/forum/posts` & `GET/POST /api/forum/posts/:id/comments` | Papan pengumuman & diskusi terbuka perusahaan | Semua Karyawan |

---

## 6. Spesifikasi Fungsional & Kontrak API — Fase 2 (Shop Floor 2-Way & Back-Office ERP Hub)

Setelah Fase 1 (HR Portal/ESS & Message) lulus verifikasi prototipe, pengembangan dilanjutkan ke **Fase 2** dengan mengacu pada direktori `03-phase2-shopfloor-and-backoffice/` dan `04-backend-api-and-realtime/routes-phase2-advanced/`.

### 6.1 Modul 3: Shop Floor 2-Way Workstation (Operator & Supervisor Produksi)

1. **Data Workstation Terpadu (`GET /api/mobile/shopfloor/workstation?project_id=...`)**:
   - Mengembalikan profil manpower operator, mesin yang ditugaskan (`assigned_machine`), daftar proyek aktif (`active_projects`), tiket kerja (`work_order_tickets`), tahapan proses (`bop_steps`), permintaan lantai produksi (`floor_requests`), laporan mesin rusak (`active_ndps`), serah terima shift (`shift_handovers`), dan thread catatan lantai produksi (`floor_threads`).
2. **Aksi Cepat Operator 2-Arah (`POST /api/mobile/shopfloor/quick-action`)**:
   - Mendukung 4 jenis `action_type` dalam satu pintu yang langsung menyinkronkan tabel PostgreSQL dan memancarkan Socket.IO `production:updated`:
     - `"WOT_STATUS"`: Memperbarui status Work Order Ticket (`IN_PROGRESS`, `PAUSED`, `COMPLETED`) beserta `good_qty` dan `scrap_qty` (atau melalui pemindai QR `POST /api/wots/scan` dan `POST /api/wots/complete`).
     - `"FLOOR_REQUEST"`: Mengajukan permintaan material atau alat kerja mendesak dari workstation ke gudang/supervisor.
     - `"REPORT_NDP"`: Melaporkan *Notice to Down Process* (kerusakan mesin/cetakan) dan mengubah status mesin terkait menjadi `MAINTENANCE`.
     - `"SHIFT_HANDOVER"`: Mencatat laporan serah terima tugas dan kendala kepada operator shift berikutnya.
3. **Catatan Lantai Produksi (`POST /api/mobile/shopfloor/thread-reply`)**:
   - Mengirim catatan langsung pada konteks proyek atau WOT tertentu yang otomatis terhubung ke kanal `chat_messages` dan memancarkan notifikasi real-time ke Supervisor.

### 6.2 Modul 4: Back-Office Mobile Monitor & Role Action Hub

Mengacu pada `MobileMonitorHub.tsx`, `MobileHomeDashboard.tsx`, `MobileRoleActionHub.tsx`, dan `MobileInspectorSheet.tsx`:
1. **8 Kategori Hub Responsif (`GET /api/mobile/backoffice/hub` & `GET /api/mobile/approvals/pending`)**:
   - `OVERVIEW`: Ringkasan KPI bisnis, total pendapatan, biaya, laba bersih, proyek aktif, dan stok kritis.
   - `APPROVALS`: Antrean dokumen lintas departemen yang membutuhkan persetujuan segera.
   - `PROJECTS`, `QUOTATIONS`, `PROCUREMENT` (PR & PO), `INVENTORY` (Stok Gudang), `DELIVERIES` (Surat Jalan), `CONTACTS` (Pelanggan & Vendor), serta `FINANCE`.
2. **Mobile Inspector Sheet & Otorisasi PIN 6-Digit (`POST /api/mobile/backoffice/authorize`)**:
   - Menekan item dokumen apa pun membuka lembar inspektur bawah (*bottom sheet*) yang merangkum metadata dokumen.
   - Manajer/Eksekutif dapat memilih aksi `APPROVE`, `REVISE`, atau `REJECT` dengan memasukkan **Daily 6-Digit Auth Key (`pin`)** dan catatan (`notes`).
3. **Batas Layar Desktop-Only (`DesktopModeNotice.tsx`)**:
   - Sesuai permintaan pengguna ("*dalam keterbatasan seperti responsive mobile saat ini*"), modul penyuntingan kanvas kompleks seperti **Document Studio A4 (`/document-workspace`)**, **Engineering BOM/BOP Graph (`/engineering`)**, **Vendor Price Matrix (`/pricing`)**, **General Ledger Penuh (`/general-ledger`)**, **Master Data Studio (`/data-center`)**, dan **RBAC Account Matrix (`/manage-accounts`)** tidak di-render sebagai tabel/kanvas penuh di mobile, melainkan diarahkan ke ringkasan baca/approval di **Role Action Hub** atau menampilkan informasi bahwa penyuntingan skema penuh tersedia di Web ERP Desktop.

---

## 7. Arsitektur Real-Time (Socket.IO) & Dukungan Offline-First (SwiftData / Room)

### 7.1 Koneksi & Kanal Event Socket.IO

Referensi Backend: `04-backend-api-and-realtime/middleware-and-socket/serverBootstrap.ts` (`attachSocketServer`).

1. **Inisialisasi Handshake Klien Native**:
   - Gunakan pustaka resmi `Socket.IO-Client-Swift` (iOS) dan ` io.socket:socket.io-client` (Android).
   - Kirimkan token JWT pada objek `auth` atau header `Authorization`:
     ```json
     {
       "auth": { "token": "<JWT_TOKEN>" },
       "extraHeaders": { "Authorization": "Bearer <JWT_TOKEN>" }
     }
     ```
2. **Daftar Event Real-Time yang Wajib Didengarkan (`socket.on`)**:

| Nama Event Socket.IO | Contoh Payload | Aksi yang Wajib Dilakukan Aplikasi Mobile |
| :--- | :--- | :--- |
| `chat:message` | `{"id": "MSG-...", "thread_id": "THR-...", "sender_username": "...", "content": "...", "created_at": "..."}` | Jika pengguna sedang membuka `thread_id` tersebut, tambahkan pesan ke layar secara instan dan panggil `/read`. Jika sedang di layar lain, tambahkan *badge* `unreadForumCount` dan simpan notifikasi lokal. |
| `workflow:updated` | `{"doc_type": "PO", "doc_id": "PO-01", "status": "APPROVED", "actor": "fc"}` | Segarkan cache lokal untuk antrean persetujuan, kartu dokumen ERP di dalam chat, dan status dokumen di Back-Office Hub. |
| `production:updated` | `{"type": "WOT_STATUS" \| "FLOOR_REQUEST" \| "REPORT_NDP" \| "SHIFT_HANDOVER" \| "FLOOR_NOTE", "project_id": "...", "wot_id": "..."}` | Segarkan state layar Shop Floor Workstation dan tampilkan banner/toast pemberitahuan kepada Operator & Supervisor. |

### 7.2 Strategi Cache Lokal & Sinkronisasi Offline-First

Referensi:
- `05-database-postgresql-and-offline/client-offline-and-sync/localDb.ts`
- `05-database-postgresql-and-offline/client-offline-and-sync/useSyncEngine.ts`
- `05-database-postgresql-and-offline/client-offline-and-sync/api.ts`

1. **Penyimpanan Lokal Terstruktur (SwiftData di iOS / Room Database di Android)**:
   - Buat 5 tabel lokal utama pada perangkat:
     1. `CachedEssSummary`: Menyimpan respons terakhir `GET /api/mobile/ess-summary` dan daftar `payslips` agar karyawan tetap bisa melihat jadwal shift, sisa cuti, dan slip gaji saat berada di area pabrik tanpa sinyal.
     2. `CachedChatThread` & `CachedChatMessage`: Menyimpan daftar thread dan 50 pesan terakhir per thread agar riwayat percakapan langsung terbuka (`0ms` *cold start*) sebelum jaringan merespons.
     3. `CachedNotification`: Menyimpan hingga 50 notifikasi terakhir (`id`, `type`, `title`, `message`, `timestamp`, `isRead`, `link`) persis seperti `NotificationContext.tsx`.
     4. `OfflineActionQueue`: Menyimpan mutasi yang dilakukan saat perangkat *offline* (`id`, `entity`, `action`, `endpoint`, `method`, `payloadJson`, `idempotencyKey`, `timestamp`, `status`: `"pending" | "synced" | "failed"`, `error`).
2. **Aturan *Stale-While-Revalidate* & Daftar Prefix Non-Cache**:
   - Untuk endpoint `GET` umum, tampilkan data lokal terlebih dahulu sembari memperbarui data di latar belakang (jendela segar `25 detik`).
   - Sesuai `src/utils/api.ts`, **jangan pernah menyajikan cache basi** untuk prefix kritis berikut: `/api/auth/`, `/api/time`, `/api/health`, `/api/notifications`.
3. **Pemrosesan Antrean Offline (`SyncEngine` Worker)**:
   - Pantau status jaringan menggunakan `NWPathMonitor` (iOS) dan `ConnectivityManager` + `WorkManager` (Android).
   - Saat perangkat offline, tampilkan komponen banner **Offline Indicator** (acuan: `OfflineIndicator.tsx`).
   - Saat koneksi kembali online, jalankan antrean `OfflineActionQueue` secara berurutan (*FIFO*) berdasarkan `timestamp` menggunakan header `x-idempotency-key` yang dibuat saat aksi direkam agar server Express menolak duplikasi (`idempotency.ts`).

---

## 8. Batasan Mutlak, Aturan Bisnis & Guardrails Pengembangan

Untuk memastikan aplikasi Android dan iOS tidak menyimpang dari sistem ERP utama, tim pengembang wajib mematuhi **8 aturan pembatas (*guardrails*)** berikut:

1. **Dilarang Mengakses PostgreSQL / Supabase Langsung dari Aplikasi Mobile**:
   - Aplikasi mobile **hanya boleh** berkomunikasi melalui endpoint Express ERP (`/api/*`). Kredensial `DATABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` adalah rahasia server-side murni karena tabel `public.erp_sync_records` dilindungi kebijakan RLS khusus `service_role`.
2. **Kepatuhan Zona Waktu Server (`Asia/Jakarta` GMT+7)**:
   - Seluruh pencatatan absensi (`clock-in` / `clock-out`) dan batas periode penggajian menggunakan waktu otoritatif server Jakarta. Aplikasi mobile tidak boleh mengandalkan jam perangkat lokal untuk memvalidasi keterlambatan atau tanggal absensi.
3. **Aturan Jendela Tutup Buku Payroll (Tanggal 15–24)**:
   - Sesuai `closingEngine.ts` dan `payroll.ts`, pembuatan/pengajuan dokumen Payroll Requisition (PRq) tunduk pada evaluasi jendela periode akuntansi (`assertClosingWindowOpen()` & `assertAccountingPeriodOpen()`). Tampilkan pesan error dari server apa adanya jika periode sedang terkunci.
4. **Wajib Verifikasi 6-Digit Daily Auth Key pada Setiap Otorisasi Dokumen**:
   - Setiap aksi persetujuan manajerial (`POST /api/chat/erp-authorize`, `POST /api/mobile/backoffice/authorize`, dan pengajuan/persetujuan `payroll-requisitions`) **wajib** menyertakan PIN 6-digit harian yang valid. Jangan pernah membuat bypass persetujuan tanpa PIN di sisi UI mobile.
5. **Isolasi Peran `OPERATOR` vs `BACK_OFFICE`**:
   - Jika `user.role == "OPERATOR"` (`app_scope == "OPERATOR_MOBILE"`), aplikasi mobile **dilarang** menampilkan tab keuangan, penjualan, pengadaan, atau manajemen gaji staf lain. Operator hanya boleh mengakses **Shop Floor 2-Way**, **Messages**, **HR Portal / ESS Pribadi**, dan **Profil/System Info**.
6. **Penanganan Format Mata Uang & Pembulatan Keuangan**:
   - Seluruh nominal mata uang adalah **Rupiah (IDR)** tanpa sen desimal (`Rp 1.250.000`). Kalkulasi PPN (`11%` / DPP Nilai Lain `11/12`), PPh 21/23, dan BPJS wajib menggunakan nilai yang dihitung oleh server (`financialEngine.ts` & `hrisEngine.ts`), bukan dihitung ulang secara berbeda di klien.
7. **Tanpa Fitur AI / Chatbot Tambahan**:
   - Jaga antarmuka aplikasi tetap bersih, cepat, dan fokus pada operasional ERP/HRIS/Messages tanpa menambahkan asisten AI, tombol *Ask AI*, atau panel telemetri internal.
8. **Isolasi Direktori `pwa/` dari Proyek Web ERP**:
   - Jangan pernah meng-import file dari `pwa/` ke dalam `src/` atau `server.ts`. Direktori `pwa/` harus tetap 100% independen sebagai repositori referensi pengembangan aplikasi mobile.

---

## 9. Checklist Penerimaan Prototipe (Definition of Done)

Sebelum melangkah dari **Fase 1 (Prototipe)** ke **Fase 2**, pastikan seluruh skenario uji berikut berjalan mulus di iOS (Swift) dan Android (Kotlin):

- [ ] **Login & Sesi Multi-Role**: Login menggunakan akun `OPERATOR`, `STAFF`, `MANAGER`, dan `FC` berhasil memperoleh token JWT, mendeteksi `app_scope` dengan benar, dan menampilkan *Daily 6-Digit Auth Key* di *System Info Bottom Sheet* yang **sama persis** dengan Web ERP.
- [ ] **Parity Visual & Tema**: Layar *Messages* menggunakan tema *Warm Monochrome Stone* (`#FAFAF9` / `#1C1917`), sedangkan layar *HR Portal / ESS* menggunakan tema *Airy Frosted Glass Alabaster* (`#F7F7F9` / `#121318`) dengan font *Plus Jakarta Sans* dan angka tabular *JetBrains Mono*.
- [ ] **ESS Attendance**: Menampilkan jam live Jakarta GMT+7, memilih shift pabrik (`SHIFT_1` s/d `GENERAL`), melakukan *Clock-In* dan *Clock-Out*, serta langsung tercermin di tabel absensi Web ERP.
- [ ] **ESS Leave & Persetujuan Manajer**: Menampilkan kuota 12 hari, mengajukan cuti baru (dengan pencegahan *overlap* tanggal), serta menyetujui/menolak cuti dari akun Manajer/HR yang langsung memperbarui saldo cuti karyawan.
- [ ] **ESS Payslip**: Menampilkan daftar slip gaji bulanan dan membuka rincian lengkap (Gaji Pokok, Tunjangan, Potongan BPJS/PPh21, dan *Take-Home Pay* Rupiah).
- [ ] **Messages & Forum Real-Time**: Membuka daftar thread dengan *unread badge* akurat, mengirim pesan teks & gambar, membalas pesan (*quoted reply*), menyematkan pesan (*pin*), meneruskan pesan ke banyak pengguna/grup sekaligus (*multi-forward*), serta menerima pesan masuk secara instan melalui **Socket.IO** (`chat:message`).
- [ ] **In-Chat ERP Document Preview & PIN Authorization**: Melampirkan kartu dokumen ERP (PR/PO/Quotation/NTP/Invoice) ke dalam chat, membuka pratinjau dokumen lengkap di tempat (*in-place modal*), dan melakukan otorisasi dokumen menggunakan **Daily 6-Digit Auth Key** yang langsung memperbarui status dokumen di PostgreSQL SSOT & Web ERP.
- [ ] **Dukungan Offline & Sinkronisasi**: Tetap dapat membuka ringkasan ESS, slip gaji, dan riwayat chat saat mode pesawat (*airplane mode*) aktif, menampilkan *Offline Indicator*, serta menyinkronkan antrean aksi secara aman dengan `x-idempotency-key` saat kembali online.
