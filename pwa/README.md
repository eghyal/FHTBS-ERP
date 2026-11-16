# Product Requirements Document (PRD) & Cetak Biru Arsitektur Mobile Native
## Paving Joss ERP — Aplikasi Mobile Android (Kotlin) & iOS (Swift)

> **Status Dokumen**: Final Blueprint, UI Constitution & Reference Package (`v2.0 — Enhanced Clean UI Edition`)
> **Target Platform**: Native iOS (**Swift / SwiftUI**) & Native Android (**Kotlin / Jetpack Compose**)
> **Pola Integrasi Backend**: Konsumsi Langsung **Express ERP REST API + Socket.IO** dengan **PostgreSQL sebagai Single Source of Truth (SSOT)**
> **Filosofi Desain Utama**: **Elegan, Clean, Modern & Tidak Overinformatif (*Clean Industrial Precision & Progressive Disclosure*)**
> **Prioritas Prototipe (Fase 1)**: **HR Portal (HRIS & ESS)** dan **Messages (Chat, Forum & Otorisasi Dokumen ERP)** berjalan sempurna 100% *end-to-end* sebelum ekspansi ke **Fase 2 (Shop Floor 2-Way & Back-Office ERP Hub)**.
> **Isolasi Direktori**: Seluruh isi direktori `pwa/` (termasuk `pwa/ui-references/`) adalah paket referensi mandiri (*read-only reference blueprint*) dan **tidak terhubung, tidak di-import, serta tidak dikompilasi** oleh proyek Web ERP utama (`tsconfig.json` & `vite.config.ts` mengecualikan `pwa/`).

---

## Daftar Isi

1. [Visi Produk, Persona Pengguna & Ruang Lingkup Akses](#1-visi-produk-persona-pengguna--ruang-lingkup-akses)
2. [Peta Struktur Direktori Referensi (`pwa/` & `pwa/ui-references/`)](#2-peta-struktur-direktori-referensi-pwa--pwaui-references)
3. [Konstitusi Desain UI Mobile: Elegan, Clean & Anti-Overinformatif](#3-konstitusi-desain-ui-mobile-elegan-clean--anti-overinformatif)
4. [Wireframe & Anatomi Visual 4 Layar Inti + Bottom Inspector Sheet](#4-wireframe--anatomi-visual-4-layar-inti--bottom-inspector-sheet)
5. [Arsitektur Backend, PostgreSQL SSOT & Keamanan Autentikasi](#5-arsitektur-backend-postgresql-ssot--keamanan-autentikasi)
6. [Spesifikasi Fungsional & Kontrak API — Fase 1 (Prototipe: HR Portal/ESS & Message)](#6-spesifikasi-fungsional--kontrak-api--fase-1-prototipe-hr-portaless--message)
7. [Spesifikasi Fungsional & Kontrak API — Fase 2 (Shop Floor 2-Way & Back-Office ERP Hub)](#7-spesifikasi-fungsional--kontrak-api--fase-2-shop-floor-2-way--back-office-erp-hub)
8. [Arsitektur Real-Time (Socket.IO) & Dukungan Offline-First (SwiftData / Room)](#8-arsitektur-real-time-socketio--dukungan-offline-first-swiftdata--room)
9. [Batasan Mutlak, Aturan Bisnis & Guardrails Pengembangan](#9-batasan-mutlak-aturan-bisnis--guardrails-pengembangan)
10. [Checklist Penerimaan Prototipe (Definition of Done)](#10-checklist-penerimaan-prototipe-definition-of-done)

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

## 2. Peta Struktur Direktori Referensi (`pwa/` & `pwa/ui-references/`)

Seluruh file referensi kode dan standar visual UI dikelompokkan secara sistematis di dalam direktori `pwa/`:

| Sub-Direktori di `pwa/` | Isi File Referensi Utama | Tujuan Penggunaan bagi Developer iOS & Android |
| :--- | :--- | :--- |
| **`ui-references/`** *(BARU)* | • `mockups/01_hr_portal_ess_clean_ui.jpg`<br>• `mockups/02_messages_erp_auth_card_ui.jpg`<br>• `mockups/03_shopfloor_2way_workstation_ui.jpg`<br>• `mockups/04_backoffice_exec_action_hub_ui.jpg`<br>• `guidelines/UI_DESIGN_STANDARDS_DO_AND_DONT.md`<br>• `native-components/ios-swiftui/PavingJossCleanUI.swift`<br>• `native-components/android-compose/PavingJossCleanUI.kt`<br>• `interactive-preview/index.html` | **Pusat Referensi Visual & Standar Anti-Overinformatif**: Berisi 4 gambar mockup UI beresolusi tinggi, panduan *Do vs Don't* per komponen, komponen SwiftUI & Jetpack Compose siap pakai (*3-Point Card*, *2x2 Metric Grid*, *Bottom Sheet*), serta simulator HTML interaktif. |
| `01-foundation-ui-and-auth/` | `styles/index.css`, `ui-primitives/*`, `mobile-shell/MobileAppShell.tsx`, `DesktopModeNotice.tsx`, `OfflineIndicator.tsx`, `auth-and-pbac/{auth.ts, authMiddleware.ts, pbac.ts, rbac.ts}`, `contexts/*` | Acuan sistem desain dasar, kerangka navigasi mobile, aturan PBAC per-role, dan pembangkit **Daily 6-Digit Auth Key (PIN)**. |
| `02-phase1-prototype-hr-ess-message/` | **HR Portal & ESS**: `HrPortal.tsx`, `SelfService.tsx`, `IsometricHero.tsx`, `hrisTypes.ts`, `ess/{LeaveRequestModal, PayslipModal}.tsx`, `tabs/*`, `modals/*`, `engine/{hrisEngine, hrDocuments, closingEngine}.ts`<br>**Message & Forum**: `Forum.tsx`, `forumTypes.ts`, `ForumSidebar.tsx`, `ForumChatHeader.tsx`, `ForumMessageStream.tsx`, `ForumComposer.tsx`, `ForumModals.tsx`, serta modal pratinjau dokumen (`NtpPreviewModal`, `QuotationPreviewModal`, `PoDocumentModal`, `PrDetailsModal`, `InvoicePreviewModal`). | **Acuan Utama Fase 1 (Prototipe)**: Seluruh logika layar, validasi form, kalkulasi jam/gaji/cuti, percakapan chat real-time, terusan pesan multi-penerima, penyematan pesan, dan kartu otorisasi dokumen ERP di dalam chat. |
| `03-phase2-shopfloor-and-backoffice/` | **Shop Floor Terminal**: `FloorTerminal.tsx`, `ShopFloorExecution.tsx`, `ShopFloorProjectDetail.tsx`, `ManPower.tsx`, `MachineFleet.tsx`, `Requests.tsx`, `shopfloor/*`, `wotCycle.ts`, `bopGraph.ts`<br>**Back-Office Hub**: `MobileMonitorHub.tsx`, `monitorTypes.ts`, `hub/{MobileHomeDashboard, MobileRoleActionHub, MobileInspectorSheet}.tsx`, `Overview.tsx` | **Acuan Fase 2 (Lanjutan)**: Terminal 2-arah Operator <-> Supervisor (WOT, BOP, Material Request, NDP Downtime, Shift Handover) dan Mobile Monitor Hub 8 kategori untuk Back-Office. |
| `04-backend-api-and-realtime/` | **Phase 1 Routes**: `mobile.ts`, `auth.ts`, `hr.ts`, `attendance.ts`, `payroll.ts`, `chat.ts`, `forum.ts`, `users.ts`, `upload.ts`<br>**Phase 2 Routes**: `dashboard.ts`, `projects.ts`, `production.ts`, `inventory.ts`, `purchasing.ts`, `sales.ts`, `finance.ts`, `workflow.ts`, `requests.ts`, `system.ts`, `closing.ts`, `integrity.ts`<br>**Middleware & Services**: `server.ts`, `serverBootstrap.ts`, `outboxService.ts`, `workflowEngine.ts`, `financialEngine.ts`, `idempotency.ts` | Kontrak kebenaran (*ground truth*) untuk setiap endpoint REST API, query database, validasi input, aturan otorisasi PIN 6-digit, serta event **Socket.IO**. |
| `05-database-postgresql-and-offline/` | **Database & PostgreSQL SSOT**: `database.ts`, `postgresClient.ts`, `postgresBridge.ts`, `pgMigrator.ts`, `migrator.ts`, `migrations/01_core.ts` s/d `06_hris.ts`<br>**Client Offline & Sync**: `localDb.ts`, `api.ts`, `smartCache.ts`, `useSyncEngine.ts`, `useOnlineStatus.ts`, `useAutoSave.ts` | Definisi tabel relasional lengkap, mekanisme replikasi dua arah **SQLite WAL <-> Supabase PostgreSQL (`public.erp_sync_records`)**, serta pola antrean offline dan *Stale-While-Revalidate* cache. |
| `06-native-starter-specs/` | `ios-swift/PavingJossNativeCore.swift`<br>`android-kotlin/PavingJossNativeCore.kt` | Kode starter native siap pakai dalam **Swift** dan **Kotlin** yang mengimplementasikan token warna, algoritma **Daily 6-Digit Auth Key** identik bit-per-bit, model DTO Fase 1, klien HTTP ber-idempotency, dan skema antrean offline. |

---

## 3. Konstitusi Desain UI Mobile: Elegan, Clean & Anti-Overinformatif

> **PRINSIP EMAS UI MOBILE PAVING JOSS ERP**:
> *"Jangan pernah menyalin tabel desktop 10 kolom ke layar ponsel. Tampilkan hanya 3–4 titik informasi paling bernilai di permukaan kartu, berikan ruang napas (whitespace) yang lega, dan ungkap rincian lengkap melalui Bottom Inspector Sheet saat kartu disentuh (Progressive Disclosure)."*

Lihat acuan visual langsung di dalam folder **`pwa/ui-references/`** (`mockups/*.jpg`, `guidelines/UI_DESIGN_STANDARDS_DO_AND_DONT.md`, dan `interactive-preview/index.html`).

### 3.1 Lima Aturan Batas Kepadatan Data (*Strict Data Density Caps*)

1. **Aturan 15% Aggregate Sticky Surface Cap**:
   - Gabungan tinggi seluruh elemen tetap (*Top App Bar `56pt/dp`* + *Bottom Navigation Bar `64pt/dp`*) **dilarang melebihi 15% dari tinggi layar**.
   - Minimal **85% ruang vertikal layar** harus tetap terbuka dan bersih untuk konten yang dapat digulir. Dilarang memasang sub-header bertumpuk 3 lapis yang memakan setengah layar ponsel.
2. **Aturan Grid Ringkasan Maksimal `2x2` (2 Kolom)**:
   - Kartu ringkasan KPI pada bagian atas halaman (baik di HR Portal, Shop Floor, maupun Back-Office Hub) **wajib disusun maksimal 2 kolom (`2x2`)** dengan tinggi seragam (`min-h 92pt/dp`), padding `14pt/dp`, 1 label pendek uppercase (`10sp Bold`), dan 1 nilai utama `JetBrains Mono` (`20sp–24sp Black` `tabular-nums`).
   - **Dilarang** membuat 3 atau 4 kolom metrik berjejalan dalam satu baris layar ponsel.
3. **Aturan Kartu Daftar 3-Lapis (*3-Point Card Anatomy*)**:
   - Setiap kartu dalam daftar (riwayat cuti, slip gaji, antrean PR/PO, daftar proyek, maupun WOT) hanya boleh memiliki **3 baris terstruktur**:
     - **Baris 1 (Metadata & Status)**: Kode dokumen monospace (`11sp Bold`, warna `stone-500`) di kiri + **maksimal 1 lencana status semantik** (`10sp Mono Bold`, `rounded-lg`) di kanan. *(Dilarang menumpuk 3–4 badge sekaligus).*
     - **Baris 2 (Identitas Utama)**: Judul utama (`14sp Bold`, maksimal 1 baris dengan `ellipsis`) + 1 baris subjudul tenang (`12sp Regular`, warna `stone-500`).
     - **Baris 3 (Metrik Kunci & Aksi)**: Nominal Rupiah / kuantitas dalam `JetBrains Mono` (`13sp Black` `tabular-nums`) di kiri + petunjuk `Inspect ›` di kanan.
4. **Aturan *Zero Horizontal-Scroll Table***:
   - Di layar mobile native, **dilarang keras menggunakan tabel horizontal (`HorizontalScrollView`)**. Seluruh data tabular diubah menjadi daftar vertikal `CleanThreePointCard` dengan jarak antar-kartu `10pt/dp` dan ketuk-untuk-detail (*tap-to-inspect*) melalui *Bottom Sheet*.
5. **Aturan Ergonomi Jangkauan Ibu Jari (*Thumb-Zone Distribution*) & Target Sentuh**:
   - Seluruh elemen interaktif wajib memiliki area sentuh (*hitbox*) minimal **`44 x 44pt/dp`** (`48pt/dp` untuk tombol CTA utama seperti *Clock-In/Out* atau *Confirm Authorization*).
   - Tombol aksi utama selalu ditempatkan di **40% bagian bawah layar (*Natural Thumb Zone*)** atau di bagian bawah *Bottom Sheet*.

### 3.2 Sistem Tema Visual Ganda (*Dual Visual Language*)

Aplikasi mobile native wajib menerapkan dua atmosfer visual sesuai modul yang sedang aktif:

1. **Tema 1 — Warm Monochrome Industrial (Messages, Shop Floor, & Back-Office ERP Hub)**
   - Kanvas latar `#FAFAF9` (`Stone-50`), permukaan kartu putih `#FFFFFF`, garis tepi tipis `1pt/dp` `#E7E5E4` (`Stone-200`), dan tombol utama hitam-arang `#1C1917` (`Stone-900`).
   - Warna merah (`#B02524` / `#EF4444`) **dilarang** untuk tombol primer; warna merah hanya digunakan untuk garis Kop Surat resmi pada pratinjau dokumen dan aksi destruktif/darurat (*Reject* / *Machine Down NDP*).
2. **Tema 2 — Airy Frosted Glass `.hris-theme` (Khusus HR Portal & ESS)**
   - Kanvas latar *Clean Alabaster* `#F7F7F9`, kartu putih `#FFFFFF` dengan garis tepi `#E2E3EA` dan bayangan lembut berlapis (`rgba(18, 19, 24, 0.06)`), teks utama `#121318`, serta aksen fungsional **Fresh Mint-Emerald** (`#10B981`) dan **Soft Coral-Terracotta** (`#F25730`).

### 3.3 Tabel Pemetaan Token Warna (CSS -> SwiftUI -> Jetpack Compose)

| Nama Token | Nilai Hex | Penggunaan di UI | SwiftUI (`PavingJossTheme`) | Jetpack Compose (`PavingJossTokens`) |
| :--- | :--- | :--- | :--- | :--- |
| `--color-stone-50` | `#FAFAF9` | Latar belakang kanvas utama ERP, Shop Floor & Messages | `Stone.s50` | `Stone.S50` |
| `--color-stone-100` | `#F5F5F4` | Latar tombol sekunder, chip filter, pil tab aktif | `Stone.s100` | `Stone.S100` |
| `--color-stone-200` | `#E7E5E4` | Garis tepi kartu (`1pt/1dp`), pembagi daftar | `Stone.s200` | `Stone.S200` |
| `--color-stone-500` | `#78716C` | Teks sekunder, label metadata, waktu pesan | `Stone.s500` | `Stone.S500` |
| `--color-stone-700` | `#44403C` | Teks isi utama & ikon navigasi | `Stone.s700` | `Stone.S700` |
| `--color-stone-900` / `--color-brand` | `#1C1917` | Tombol aksi primer, kartu hero workstation/hub, badge unread | `Stone.s900` / `Brand.primary` | `Stone.S900` / `Brand.Primary` |
| `--color-paving-yellow` | `#FFD700` | Aksen ikon kunci **Daily 6-Digit Auth Key** di atas latar `#1C1917` | `Brand.pavingYellow` | `Brand.PavingYellow` |
| `--color-letterhead-red` | `#B02524` | Garis kop surat dokumen resmi & status kritis | `Brand.letterheadRed` | `Brand.LetterheadRed` |
| `.hris-theme --color-stone-50` | `#F7F7F9` | Latar belakang utama layar **HR Portal / ESS** | `HrisAlabaster.s50` | `HrisAlabaster.S50` |
| `.hris-theme --color-stone-200` | `#E2E3EA` | Garis tepi kartu pada layar **HR Portal / ESS** | `HrisAlabaster.s200` | `HrisAlabaster.S200` |
| `.hris-theme --color-stone-900` | `#121318` | Teks judul, jam digital & tombol utama pada **HR Portal / ESS** | `HrisAlabaster.s900` | `HrisAlabaster.S900` |
| `.hris-theme --color-violet-500` | `#F25730` | Aksen Coral-Terracotta pada highlight HRIS | `HrisAlabaster.coral500` | `HrisAlabaster.Coral500` |
| `--color-emerald-500` | `#10B981` | Status *Approved*, *Passed*, *On Duty*, *Published*, *Online* | `Brand.emerald500` | `Brand.Emerald500` |
| `--color-amber-500` | `#F59E0B` | Status *Pending*, *Waiting Auth*, *Draft*, *Paused* | `Brand.amber500` | `Brand.Amber500` |
| `--color-red-500` | `#EF4444` | Status *Rejected*, *Overdue*, *Urgent*, *Machine Down* | `Brand.red500` | `Brand.Red500` |

### 3.4 Tipografi & Disiplin Angka Tabular (`tabular-nums`)

- **Font Utama (`--font-sans`)**: **Plus Jakarta Sans** (`Regular 400`, `Medium 500`, `SemiBold 600`, `Bold 700`, `ExtraBold 800`).
- **Font Teknis & Angka (`--font-mono`)**: **JetBrains Mono** — wajib digunakan bersama fitur angka tabular (`.monospacedDigit()` di SwiftUI / `fontFeatureSettings = "tnum"` di Jetpack Compose) pada:
  - Jam live Jakarta (`08:14:22 WIB`)
  - Kode dokumen & tiket (`PO/2026/018`, `WOT-2026-041`, `LV-2026-091`, `PAY-2026-10`)
  - Nominal Rupiah (`Rp 48.500.000`) & kuantitas produksi (`840 Pcs`)
  - **6-Digit Daily Auth Key (PIN)** (`K7M9P2`)

### 3.5 Matriks Ringkas *Do vs Don't* (Anti-Overinformatif)

| Area UI | ❌ JANGAN LAKUKAN (*Overinformatif & Berantakan*) | ✅ LAKUKAN (*Standar Clean ERP*) |
| :--- | :--- | :--- |
| **Kartu Daftar (PO, PR, Cuti, Slip Gaji)** | Menampilkan 8–10 field (NPWP, pembuat, rincian pajak DPP/PPN, 4 badge, dan 4 tombol aksi) langsung di kartu daftar. | Gunakan **3-Point Card Anatomy** (`Kode + 1 Badge`, `Judul + Subjudul`, `Nominal + Inspect ›`). Rincian dibuka via *Bottom Sheet*. |
| **Kartu Dokumen ERP di Chat** | Merender tabel 15 baris barang PO langsung di dalam bubble chat. | Render **Compact ERP Share Card** berisi Kode, Mitra, Status, Total Rupiah, serta 2 tombol: `Preview` & `Authorize`. |
| **Otorisasi PIN 6-Digit** | Menampilkan kolom input PIN di setiap baris kartu pada halaman daftar. | Tempatkan kotak **6-Digit Daily Auth PIN** secara eksklusif di dalam **Bottom Inspector Sheet** saat pengguna menekan *Authorize / Inspect*. |

---

## 4. Wireframe & Anatomi Visual 4 Layar Inti + Bottom Inspector Sheet

*(Lihat gambar mockup resolusi tinggi di `pwa/ui-references/mockups/01_*.jpg` s/d `04_*.jpg` serta komponen SwiftUI/Compose di `pwa/ui-references/native-components/`).*

```
┌─────────────────────────────────────────┐   ┌─────────────────────────────────────────┐
│ [PJ] HR Portal · ESS        [Key] [Bell]│   │ [<-] Pengadaan Semen · Grup [Pin] [Bell]│
├─────────────────────────────────────────┤   ├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │   │ ┌─────────────────────────────────────┐ │
│ │ EMP-2026-014 · SHIFT 1 PAGI [DUTY]  │ │   │ │ 📌 PINNED: Verifikasi PO sebelum 15h│ │
│ │ Budi Santoso                        │ │   │ └─────────────────────────────────────┘ │
│ │ 08:14:22 WIB                        │ │   │ Andi (Purchasing) · 09:40 WIB           │
│ │ ┌─────────────────────────────────┐ │ │   │ Mohon otorisasi PO semen curah Proyek A1│
│ │ │      Clock Out Sekarang         │ │ │   │ ┌─────────────────────────────────────┐ │
│ │ └─────────────────────────────────┘ │ │   │ │ ERP Purchase Order   [WAITING AUTH] │ │
│ └─────────────────────────────────────┘ │   │ │ PO/2026/018 · PT Sinar Beton        │ │
│ [Absensi]   [Cuti (Sisa 9)]  [Slip Gaji]│   │ │ Rp 48.500.000                       │ │
│ ┌─────────────────┐ ┌─────────────────┐ │   │ │ [Preview Dokumen]    [Authorize PO] │ │
│ │ KUOTA TAHUNAN   │ │ SISA CUTI AKTIF │ │   │ └─────────────────────────────────────┘ │
│ │ 12 Hari         │ │ 9 Hari          │ │   ├─────────────────────────────────────────┤
│ └─────────────────┘ └─────────────────┘ │   │ ┌───────────────═══───────────────────┐ │
│ ┌─────────────────────────────────────┐ │   │ │   6-Digit Daily Authorization PIN   │ │
│ │ LV-2026-091 · Cuti Tahunan [APPROV] │ │   │ │  [    K  7  M  9  P  2       🔑 ]   │ │
│ │ 12 Nov – 14 Nov 2026                │ │   │ │  [    Confirm Authorization     ]   │ │
│ │ 3 Hari Kerja               Detail › │ │   │ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤   └─────────────────────────────────────────┘
│  [Home]   [Hub]   [Messages]  [*HR*]    │     Layar 2: Messages + Kartu ERP + PIN Sheet
└─────────────────────────────────────────┘     (Mockup: 02_messages_erp_auth_card_ui.jpg)
  Layar 1: HR Portal & ESS (.hris-theme)
  (Mockup: 01_hr_portal_ess_clean_ui.jpg)

┌─────────────────────────────────────────┐   ┌─────────────────────────────────────────┐
│ [PJ] Shop Floor 2-Way       [Key] [Bell]│   │ [PJ] Exec Action Hub        [Key] [Bell]│
├─────────────────────────────────────────┤   ├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │   │ ┌─────────────────────────────────────┐ │
│ │ WC-PRESS-01 · MC-001       [ACTIVE] │ │   │ │ PURCHASING · MANAGER                │ │
│ │ Hydraulic Paving Press HPP-500      │ │   │ │ Hi, Hendra Wijaya                   │ │
│ └─────────────────────────────────────┘ │   │ │ [Open Procurement Hub]              │ │
│ ┌─────────────────┐ ┌─────────────────┐ │   │ └─────────────────────────────────────┘ │
│ │ TARGET HARI INI │ │ OUTPUT GOOD     │ │   │ ┌─────────────────┐ ┌─────────────────┐ │
│ │ 1.200 Pcs       │ │ 840 Pcs (70%)   │ │   │ │ PENDING AUTH    │ │ ACTIVE PROJECTS │ │
│ └─────────────────┘ └─────────────────┘ │   │ │ 7 Docs          │ │ 12              │ │
│ ┌─────────────────────────────────────┐ │   │ └─────────────────┘ └─────────────────┘ │
│ │ Work Order Ticket                   │ │   │ (Approvals 7) (PR & PO) (Quotations)    │
│ │ WOT-2026-041 · Paving 8cm K-400     │ │   │ ┌─────────────────────────────────────┐ │
│ │ ████████████████░░░░░░░ 70%         │ │   │ │ PO/2026/018 · PURCHASE ORD [PENDING]│ │
│ │ [Update Output]  [Request Mat / NDP]│ │   │ │ PT Sinar Beton Perkasa              │ │
│ └─────────────────────────────────────┘ │   │ │ Rp 48.500.000              Inspect ›│ │
├─────────────────────────────────────────┤   ├─────────────────────────────────────────┤
│ [*ShopFloor*] [Messages] [HR] [Profile] │   │  [Home]  [*Exec Hub*] [Messages] [HR]   │
└─────────────────────────────────────────┘   └─────────────────────────────────────────┘
  Layar 3: Shop Floor 2-Way Workstation         Layar 4: Back-Office Exec Action Hub
  (Mockup: 03_shopfloor_2way_..._ui.jpg)        (Mockup: 04_backoffice_exec_..._ui.jpg)
```

---

## 5. Arsitektur Backend, PostgreSQL SSOT & Keamanan Autentikasi

### 5.1 Arsitektur Database Hibrida (PostgreSQL SSOT + SQLite WAL)

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

### 5.2 Protokol Autentikasi JWT & Header Wajib

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

### 5.3 Algoritma **Daily 6-Digit Auth Key (PIN)**

Dokumen ERP sensitif (PR, PO, Quotation, Delivery, Cuti, SPK, serta Payroll Requisition) memerlukan **6-Digit Daily Auth Key** yang berubah setiap hari per-username.
- Algoritma deterministik mengombinasikan `username.trim().toLowerCase() + YYYY-MM-DD (UTC) + secretSeed ("_sec_fhtbs_2026")` menggunakan *32-bit signed integer hash* dan memetakannya ke 6 karakter dari himpunan `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (tanpa karakter ambigu `0, O, 1, I`).
- Implementasi referensi asli ada di `01-foundation-ui-and-auth/auth-and-pbac/auth.ts`, dan sudah diterjemahkan secara presisi ke **Swift** (`PavingJossNativeCore.swift`) serta **Kotlin** (`PavingJossNativeCore.kt`).
- Selain dihitung secara lokal untuk ditampilkan pada *System Info Bottom Sheet*, aplikasi mobile juga dapat memverifikasi/mengambil kunci harian dari server melalui `GET /api/auth/daily-key`.

---

## 6. Spesifikasi Fungsional & Kontrak API — Fase 1 (Prototipe: HR Portal/ESS & Message)

> **KRUSIAL UNTUK PROTOTIPE**: Pada tahap prototipe pertama, aplikasi iOS dan Android **wajib dapat menjalankan seluruh fitur HR Portal (ESS & Manajemen HR sesuai role) serta Messages (Chat, Forum, Lampiran, & Otorisasi Dokumen ERP) secara utuh dan bebas bug** dengan mematuhi tata letak *Clean 3-Point Card* dan *Progressive Disclosure*.

### 6.1 Modul 1: HR Portal & Employee Self-Service (ESS)

Referensi Frontend & UI:
- `ui-references/mockups/01_hr_portal_ess_clean_ui.jpg`
- `ui-references/native-components/ios-swiftui/PavingJossCleanUI.swift` (`EssAttendanceHeroCard`, `CleanMetricGrid2x2`, `CleanThreePointCard`)
- `02-phase1-prototype-hr-ess-message/hr-portal-and-ess/pages/{SelfService.tsx, HrPortal.tsx}`

Referensi Backend:
- `04-backend-api-and-realtime/routes-phase1-prototype/{mobile.ts, attendance.ts, hr.ts, payroll.ts}`

#### A. Fitur Wajib di Layar ESS (Untuk Seluruh Karyawan & Operator)
1. **Header Kartu Identitas & Jam Server Jakarta (`Asia/Jakarta`)**:
   - Menampilkan `employee_no`, shift aktif, nama karyawan, badge status (`ON DUTY` / `OFF DUTY`), dan jam digital *real-time* dalam zona waktu `Asia/Jakarta (GMT+7)` dengan format tabular (`HH:mm:ss WIB`) serta 1 tombol CTA penuh (`48pt/dp`).
   - Memuat data awal secara instan melalui `GET /api/mobile/ess-summary`.
2. **Tab 1 — Attendance (Absensi Harian & Shift Pabrik)**:
   - Pilihan Shift kerja sesuai konstanta `FACTORY_SHIFTS` (`GET /api/hr/shifts`): `SHIFT_1` (`07:00-15:00`), `SHIFT_2` (`15:00-23:00`), `SHIFT_3` (`23:00-07:00`, pengali `1.1x`), dan `GENERAL` (`08:00-17:00`).
   - **Aksi Clock-In**: `POST /api/hr/attendances/clock-in` (`{"shift": "SHIFT_1", "location": "...", "project_id": "..."}`).
   - **Aksi Clock-Out**: `PUT /api/hr/attendances/clock-out` (`{"location": "..."}`).
   - **Daftar Riwayat Absensi**: Ditampilkan sebagai kartu 3-baris bersih (Tanggal + Badge Shift, Jam Masuk – Jam Pulang, Total Jam Kerja).
3. **Tab 2 — Leave Management (Saldo & Pengajuan Cuti)**:
   - Menampilkan Grid `2x2` bersih: **Kuota Tahunan (`12 Hari`)** dan **Sisa Kuota (`remaining_days`)**.
   - **Modal Sheet Pengajuan Cuti Baru** (`POST /api/hr/leaves`): Pilihan `leave_type`, `start_date`, `end_date`, dan `reason` dengan validasi anti-overlap.
   - **Mode Manajer / HR (`TEAM_APPROVALS`)**: Saklar bersih untuk meninjau pengajuan cuti anggota tim dan menyetujui/menolak via `PUT /api/hr/leaves/:id/status` dari dalam *Bottom Sheet*.
4. **Tab 3 — Payslips (Slip Gaji Digital & Rincian Kompensasi)**:
   - Daftar slip gaji (`GET /api/hr/payslips`) dirender menggunakan `CleanThreePointCard` (Kode + Badge `PUBLISHED`, Periode Bulan, *Take-Home Pay* Rupiah + `Rincian Slip ›`).
   - Mengetuk kartu membuka **Payslip Detail Bottom Sheet** yang menampilkan Gaji Pokok, Tunjangan, Lembur, Potongan BPJS Kesehatan/TK, PPh 21, dan Gaji Bersih.

---

### 6.2 Modul 2: Messages (Chat, Forum & Integrasi Dokumen ERP)

Referensi Frontend & UI:
- `ui-references/mockups/02_messages_erp_auth_card_ui.jpg`
- `ui-references/native-components/ios-swiftui/PavingJossCleanUI.swift` (`ChatErpDocumentCard`)
- `02-phase1-prototype-hr-ess-message/message-and-forum/pages/{Forum.tsx, forumTypes.ts}`

Referensi Backend:
- `04-backend-api-and-realtime/routes-phase1-prototype/{chat.ts, forum.ts, upload.ts}`

#### A. Fitur Wajib di Layar Messages (Untuk Seluruh Karyawan, Operator & Back-Office)
1. **Daftar Thread Bersih & Lencana Pesan Belum Dibaca (`Unread Badges`)**:
   - Memanggil `GET /api/chat/threads` dan `GET /api/chat/unread`.
   - Setiap baris thread hanya menampilkan Avatar/Inisial, Nama Thread/Pengirim, 1 baris cuplikan pesan terakhir (`ellipsis`), waktu singkat (`09:40`), dan 1 badge angka belum dibaca.
2. **Ruang Percakapan (`Message Stream`)**:
   - Memuat pesan melalui `GET /api/chat/threads/:id/messages` dan menandai terbaca via `POST /api/chat/threads/:id/read`.
   - Mendukung: *Quoted Reply*, label *Forwarded from ...*, *Pinned Message Banner* di atas ruang chat (`POST /api/chat/messages/:id/pin`), unggah gambar/berkas (`POST /api/upload`), serta *Multi-Recipient Forwarding* (`POST /api/chat/forward`).
3. **Compact ERP Share Card & Otorisasi Langsung dengan PIN 6-Digit**:
   - Saat dokumen ERP (`NTP`, `QUOTATION`, `PR`, `PO`, `PROJECT`, `INVOICE` dari `GET /api/chat/erp-references`) dibagikan ke ruang chat, kartu di dalam chat hanya menampilkan:
     - Label tipe dokumen + 1 Status Badge (`WAITING AUTH` / `APPROVED`)
     - Nomor dokumen & nama vendor/pelanggan (`PO/2026/018 · PT Sinar Beton`)
     - Nominal Total Rupiah dalam `JetBrains Mono` (`Rp 48.500.000`)
     - 2 Tombol bersih: **`Preview Dokumen`** (membuka modal pratinjau penuh dari `GET /api/chat/erp-document-preview/:type/:id`) dan **`Authorize`** (khusus Manajer/Eksekutif, membuka *Bottom Sheet* input **6-Digit Daily Auth Key** yang mengirim `POST /api/chat/erp-authorize`).

### 6.3 Ringkasan Tabel Endpoint REST API — Fase 1 (Prototipe)

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

## 7. Spesifikasi Fungsional & Kontrak API — Fase 2 (Shop Floor 2-Way & Back-Office ERP Hub)

Mengacu pada mockup `03_shopfloor_2way_workstation_ui.jpg` dan `04_backoffice_exec_action_hub_ui.jpg` serta direktori `03-phase2-shopfloor-and-backoffice/`:

### 7.1 Modul 3: Shop Floor 2-Way Workstation (Operator & Supervisor Produksi)
- **Tampilan Bersih & Fokus Lapangan**:
  1. **Kartu Mesin Aktif (`#1C1917`)**: Menampilkan Kode Work Center & Mesin (`WC-PRESS-01 · MC-001`), nama mesin, dan 1 badge status (`ACTIVE` / `MAINTENANCE`).
  2. **Grid Metrik `2x2`**: `Target Hari Ini` vs `Output Good (Pcs & %)`.
  3. **Kartu Work Order Ticket Aktif**: Menampilkan Nomor WOT, Nama Produk Paving, bilah progres visual, dan 2 tombol sentuh besar (`Update Output` & `Request Material / NDP`).
- **Endpoint**: `GET /api/mobile/shopfloor/workstation`, `POST /api/mobile/shopfloor/quick-action` (`WOT_STATUS`, `FLOOR_REQUEST`, `REPORT_NDP`, `SHIFT_HANDOVER`), dan `POST /api/mobile/shopfloor/thread-reply`.

### 7.2 Modul 4: Back-Office Mobile Monitor & Role Action Hub
- **Tampilan Eksekutif & Manajerial Bersih**:
  1. **Kartu Sapaan Role (`#1C1917`)**: Menampilkan Role & Level (`PURCHASING · MANAGER`), nama pengguna, dan tombol pintas ke kategori utama departemennya.
  2. **Grid KPI `2x2`**: Menampilkan 4 metrik paling relevan bagi peran tersebut (`Pending Approvals`, `Active Projects`, `Critical Stock`, `Net Margin`).
  3. **Daftar Kartu 3-Lapis & Bottom Inspector Sheet**: Seluruh 8 kategori (`OVERVIEW`, `APPROVALS`, `PROJECTS`, `QUOTATIONS`, `PROCUREMENT`, `INVENTORY`, `DELIVERIES`, `CONTACTS`, `FINANCE` dari `GET /api/mobile/backoffice/hub`) dirender menggunakan `CleanThreePointCard`. Mengetuk kartu akan mengangkat **Mobile Inspector Sheet** untuk melihat rincian dan melakukan otorisasi via `POST /api/mobile/backoffice/authorize` menggunakan **Daily 6-Digit Auth Key**.

---

## 8. Arsitektur Real-Time (Socket.IO) & Dukungan Offline-First (SwiftData / Room)

### 8.1 Koneksi & Kanal Event Socket.IO
- Kirimkan token JWT pada `socket.handshake.auth.token` atau header `Authorization: Bearer <token>`.
- Dengarkan 3 kanal utama:
  1. `chat:message`: Memperbarui daftar pesan aktif secara instan atau menambah lencana *unread*.
  2. `workflow:updated`: Menyegarkan status dokumen PR/PO/Quotation/Cuti pada kartu chat dan antrean persetujuan Hub.
  3. `production:updated`: Menyegarkan progres WOT, permintaan material, dan status mesin NDP di layar Shop Floor.

### 8.2 Strategi Cache Lokal & Sinkronisasi Offline-First
- Gunakan **SwiftData** (iOS) dan **Room + WorkManager** (Android) untuk menyimpan `CachedEssSummary`, `CachedChatThread`, `CachedChatMessage`, `CachedNotification`, dan `OfflineActionQueue`.
- Terapkan strategi *Stale-While-Revalidate* (jendela segar `25 detik`) untuk request `GET` non-kritis, dan gunakan header `x-idempotency-key` saat mengirim antrean mutasi dari `OfflineActionQueue` begitu koneksi kembali online.

---

## 9. Batasan Mutlak, Aturan Bisnis & Guardrails Pengembangan

1. **Dilarang Membuat Tampilan Overinformatif atau Tabel Horizontal**: Setiap kartu daftar wajib mematuhi *3-Point Card Anatomy* (maksimal 4 titik informasi, maksimal 1 badge status) dan memindahkan seluruh detail rincian ke dalam *Bottom Inspector Sheet*.
2. **Dilarang Mengakses PostgreSQL / Supabase Langsung dari Aplikasi Mobile**: Seluruh komunikasi data wajib melewati REST API Express ERP (`/api/*`) untuk menjaga keamanan RLS `service_role` pada `public.erp_sync_records`.
3. **Kepatuhan Zona Waktu Server (`Asia/Jakarta` GMT+7)**: Pencatatan absensi menggunakan waktu otoritatif server Jakarta (`getSecureJakartaTime()`).
4. **Wajib Verifikasi 6-Digit Daily Auth Key pada Setiap Otorisasi Dokumen**: Seluruh persetujuan dokumen di Chat maupun Back-Office Hub wajib memvalidasi PIN harian 6-digit.
5. **Isolasi Peran `OPERATOR` vs `BACK_OFFICE`**: Akun `OPERATOR` (`OPERATOR_MOBILE`) hanya boleh melihat Shop Floor 2-Way, Messages, HR Portal/ESS Pribadi, dan Profil.
6. **Konsistensi Perhitungan Finansial & Payroll**: Gunakan angka DPP, PPN, PPh, dan BPJS yang dihitung oleh mesin server (`financialEngine.ts` & `hrisEngine.ts`).
7. **Tanpa Fitur AI / Chatbot Tambahan**: Jaga aplikasi tetap murni fokus pada kecepatan operasional ERP, HRIS, dan komunikasi tim.
8. **Isolasi Direktori `pwa/`**: Jangan pernah meng-import file apa pun dari `pwa/` ke dalam kode sumber Web ERP utama (`src/` atau `server.ts`).

---

## 10. Checklist Penerimaan Prototipe (Definition of Done)

- [ ] **Kepatuhan Standar UI Clean & Anti-Overinformatif**: Seluruh layar di iOS (SwiftUI) dan Android (Jetpack Compose) sesuai dengan 4 mockup di `pwa/ui-references/mockups/`, mematuhi batas *sticky surface* $\le 15\%$, grid KPI `2x2`, kartu daftar 3-lapis tanpa tabel geser horizontal, serta menggunakan *Bottom Inspector Sheet* untuk rincian data.
- [ ] **Login & Sesi Multi-Role**: Login akun `OPERATOR`, `STAFF`, `MANAGER`, dan `FC` mendeteksi `app_scope` dengan benar dan menampilkan *Daily 6-Digit Auth Key* yang identik dengan Web ERP.
- [ ] **ESS Attendance, Leave & Payslip**: Jam live Jakarta GMT+7 (`tabular-nums`), *Clock-In/Out* 4 shift pabrik, pengajuan & persetujuan cuti, serta rincian slip gaji di *Bottom Sheet* berjalan sempurna.
- [ ] **Messages, Forum & Kartu Otorisasi ERP**: Chat real-time via Socket.IO, *unread badges*, *quoted reply*, *pin*, *multi-forward*, serta pratinjau dokumen ERP dan otorisasi PIN 6-digit langsung dari kartu chat berfungsi penuh dan tersinkronisasi ke PostgreSQL SSOT.
