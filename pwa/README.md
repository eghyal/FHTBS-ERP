# 📱 Master Blueprint: Arsitektur, Standar UI ERP & Integrasi PostgreSQL untuk Aplikasi Mobile (Android & iOS) — Paving Joss

> **Status Isolasi Direktori `pwa/`**:  
> Direktori `pwa/` ini **100% terisolasi** dari kompilasi, *type-checking*, dan *build* produksi Web ERP & HRIS (`"pwa"` telah dikecualikan secara eksplisit di dalam `tsconfig.json`). Seluruh file di dalam direktori ini siap disalin langsung ke repositori baru untuk pembangunan aplikasi **Android** dan **iOS** tanpa memengaruhi sistem Web ERP saat ini.

---

## 📑 Daftar Isi
1. [Cakupan Pengguna & Fitur Aplikasi Mobile (Operator vs Back-Office)](#1-cakupan-pengguna--fitur-aplikasi-mobile-operator-vs-back-office)
2. [Spesifikasi Lengkap Style & Standar UI Web ERP (Design System Contract)](#2-spesifikasi-lengkap-style--standar-ui-web-erp-design-system-contract)
   - [2.1 Filosofi Visual & Aturan Proporsi 60-30-10](#21-filosofi-visual--aturan-proporsi-60-30-10)
   - [2.2 Token Warna Resmi: Light Mode (Default) & Dark Mode (Stealth Gunmetal)](#22-token-warna-resmi-light-mode-default--dark-mode-stealth-gunmetal)
   - [2.3 Sistem Tipografi, Skala Huruf Mobile & Disiplin `tabular-nums`](#23-sistem-tipografi-skala-huruf-mobile--disiplin-tabular-nums)
   - [2.4 Geometri Viewport Ponsel (390 × 844 px), Radius, Spacing & Hairline Border](#24-geometri-viewport-ponsel-390--844-px-radius-spacing--hairline-border)
   - [2.5 Spesifikasi Anatomi Komponen Standar UI ERP (Component Recipes)](#25-spesifikasi-anatomi-komponen-standar-ui-erp-component-recipes)
   - [2.6 Blueprint Tata Letak Layar per Modul (ASCII Wireframe & Class Contract)](#26-blueprint-tata-letak-layar-per-modul-ascii-wireframe--class-contract)
   - [2.7 Daftar Pantangan Visual (Anti-Pattern Rules)](#27-daftar-pantangan-visual-anti-pattern-rules)
3. [Arsitektur Integrasi Database PostgreSQL & Sinkronisasi Data 2-Arah](#3-arsitektur-integrasi-database-postgresql--sinkronisasi-data-2-arah)
4. [Kontrak API, Endpoint & Payload Pertukaran Data (Mobile $\longleftrightarrow$ Web ERP)](#4-kontrak-api-endpoint--payload-pertukaran-data-mobile--web-erp)
5. [Batasan & Aturan Ketat Pembuatan Aplikasi (FE & BE Constraints)](#5-batasan--aturan-ketat-pembuatan-aplikasi-fe--be-constraints)
6. [Peta Referensi File di Dalam Direktori `pwa/`](#6-peta-referensi-file-di-dalam-direktori-pwa)
7. [Panduan Langkah Demi Langkah Build Android & iOS](#7-panduan-langkah-demi-langkah-build-android--ios)

---

## 1. Cakupan Pengguna & Fitur Aplikasi Mobile (Operator vs Back-Office)

Aplikasi mobile dirancang untuk digunakan oleh **seluruh karyawan perusahaan** (baik Operator Lantai Produksi maupun Staf Back-Office/Manajemen) dengan pembagian ruang lingkup (*scope*) otomatis berdasarkan peran pada saat login:

### A. Seluruh Karyawan & Operator Produksi (`app_scope: "OPERATOR_MOBILE"`)
Mendapatkan navigasi **4 Tab Utama**:
1. **Shop Floor 2-Arah (`/shopfloor`)**:
   - Melihat stasiun kerja & mesin aktif yang ditugaskan (`production_manpower` & `items`).
   - Menjalankan eksekusi *Work Order Ticket (WOT)*: **Start, Pause, Resume, Complete** beserta input kuantitas *Good* & *Scrap*.
   - **Komunikasi 2-Arah Supervisor $\longleftrightarrow$ Operator**: Menerima instruksi langsung dari Supervisor pada proyek/WOT terkait dan mengirim balasan cepat (*Floor Note*) secara *real-time*.
   - **Quick Floor Actions**: Meminta pasokan material/tooling (*Floor Request*), melaporkan kerusakan mesin darurat (*NDP Breakdown*), dan menyerahkan laporan pergantian shift (*Shift Handover*).
2. **Messages & Forum (`/forum`)**:
   - Percakapan instan (Direct Chat & Grup Proyek/Departemen).
   - **Pratinjau Dokumen Teknis In-App**: Membuka lampiran dokumen ERP (SOP, BOP, SPK, Gambar Teknik PDF) melalui *In-App Modal Preview* tanpa keluar dari layar percakapan.
3. **HR Portal / ESS (`/ess`)**:
   - **Absensi Live Clock-In / Clock-Out**: Pencatatan kehadiran dengan jam digital server Jakarta dan verifikasi titik koordinat lokasi pabrik (*GPS Geofence*).
   - **Manajemen Cuti & Izin**: Melihat sisa kuota cuti tahunan dan mengajukan permohonan cuti/izin.
   - **Slip Gaji (Payslip PDF), KPI & Lembur**: Mengunduh rincian slip gaji bulanan, memantau nilai performa KPI pribadi, serta jadwal lembur yang disetujui.
4. **Profile**:
   - Identitas digital karyawan, informasi shift/stasiun kerja, status sinkronisasi offline, dan *logout*.

### B. Staf Back-Office, Supervisor & Manajemen (`app_scope: "BACKOFFICE_MOBILE"`)
Mendapatkan seluruh fitur di atas (**Shop Floor 2-Way**, **Messages**, **ESS**) **DITAMBAH** kapabilitas penuh **ERP & HRIS Mobile (`MobileMonitorHub`)** dalam tata letak responsif mobile bebas tabel horizontal:
1. **Home Executive Overview (`/erp`)**:
   - Kartu sapaan peran (`bg-stone-900`), *Daily 6-Digit Auth Key (PIN)*, serta ringkasan KPI *real-time* 2×2 (*Pending Approvals, Active Projects, Low Stock Alerts, Revenue*).
2. **Role Action Hub (`/erp?tab=hub`) — 8 Kategori Penuh**:
   - **`APPROVALS`**: Antrean persetujuan dokumen `PR`, `PO`, `Quotation`, `Delivery`, `SPK`, dan `Cuti HR` menggunakan *Bottom Sheet Inspector* & verifikasi **6-Digit Daily Auth PIN**.
   - **`PROJECTS`**: Monitor proyek aktif, status SPK/NTP, dan tenggat waktu produksi.
   - **`INVENTORY`**: Pencarian stok gudang (*SKU Lookup*), bahan baku, dan barang jadi.
   - **`PROCUREMENT`**: Monitor antrean *Purchase Request (PR)* dan *Purchase Order (PO)*.
   - **`QUOTATIONS`**: Monitor *sales pipeline* dan penawaran harga pelanggan.
   - **`DELIVERIES`**: Monitor surat jalan (*Delivery Order*) dan pengiriman keluar.
   - **`CONTACTS`**: Direktori pelanggan (*Customers*) dan pemasok (*Vendors*) dengan tombol *1-Tap Call (`tel:`)* & *Email (`mailto:`)*.
   - **`FINANCE`**: Ringkasan pendapatan (*Revenue*), HPP/pengeluaran (*COGS/Expenses*), dan estimasi margin bersih yang tersinkronisasi dengan *General Ledger*.

---

## 2. Spesifikasi Lengkap Style & Standar UI Web ERP (Design System Contract)

Bagian ini adalah **acuan tunggal (*Single Source of Truth*)** yang menyalin secara presisi seluruh aturan CSS dan komponen dari Web ERP (`src/index.css`, `src/components/mobile/MobileAppShell.tsx`, `src/components/mobile/hub/*`, dan `src/components/ui/*`). Baik aplikasi dibangun menggunakan **Capacitor/React**, **React Native**, **Flutter**, maupun **Kotlin/Swift Native**, wajib menerapkan token dan geometri di bawah ini secara persis.

### 2.1 Filosofi Visual & Aturan Proporsi 60-30-10
1. **Warm Stone Industrial Minimalist (Default Light Mode)**:
   - Web ERP Paving Joss menggunakan pendekatan **Warm Stone Neutral** (bukan *cool blue-gray* generik dan bukan *pure white* yang menyilaukan mata).
   - **60% Canvas Background**: `#FAFAF9` (`stone-50`) sebagai latar belakang kanvas utama agar mata nyaman saat digunakan di lantai pabrik maupun ruang kantor.
   - **30% Surface Container**: `#FFFFFF` (`bg-white`) dengan garis tepi sangat halus `1px solid #E7E5E4` (`border-stone-200/80`) dan bayangan mikro `0 1px 2px 0 rgba(0, 0, 0, 0.02)` (`shadow-2xs`).
   - **10% High-Contrast Anchor & Semantic Accents**:
     - **Signature Dark Hero Card**: `#1C1917` (`bg-stone-900 text-white`) khusus untuk **1 kartu fokus utama di bagian paling atas layar** (Executive Greeting Card, Active WOT Card, atau Live Attendance Clock Card).
     - **Primary Action / Authorize**: `#059669` (`bg-emerald-600 text-white`) atau `#1C1917` (`bg-stone-900 text-white`).
     - **Brand Identity**: Monogram resmi **PJ** (`pwa/assets/logo.png`) dengan aksen Crimson (`#B02524`) dan Gold (`#FFD700` / `#F59E0B`).
2. **Clean Look & Tidak Over-Informatif**:
   - Satu kartu daftar (*list item card*) maksimal menampilkan **4 titik data**: (1) Kode/Badge Dokumen, (2) Judul Utama, (3) Sub-teks Pelanggan/Pemohon, dan (4) Nilai/Status di sisi kanan.
   - Seluruh detail panjang (baris item, catatan revisi, riwayat otorisasi, form input PIN) **wajib disembunyikan di dalam Bottom Sheet Inspector** (`MobileInspectorSheet.tsx`) yang baru muncul ketika kartu diketuk.

---

### 2.2 Token Warna Resmi: Light Mode (Default) & Dark Mode (Stealth Gunmetal)

Salin nilai variabel warna berikut ke dalam konfigurasi tema aplikasi mobile (`tailwind.config.js`, `index.css`, `colors.xml` Android, atau `Assets.xcassets` iOS):

#### A. Tabel Token Warna Utama (ERP Warm Stone Palette)
| Peran Elemen UI | CSS Variable / Token | Hex (Light Mode - Default) | Hex (Dark Mode `.erp-dark`) | Kelas Tailwind Standar ERP |
| :--- | :--- | :--- | :--- | :--- |
| **App Canvas (Latar Layar)** | `--color-stone-50` | `#FAFAF9` | `#0D0F12` | `bg-stone-50` |
| **Sub-Panel / Track Tab / Pill** | `--color-stone-100` | `#F5F5F4` | `#181C22` | `bg-stone-100` |
| **Primary Card / Modal / Sheet** | `bg-white` | `#FFFFFF` | `#13161B` | `bg-white` |
| **Card Hairline Border** | `--color-stone-200` | `#E7E5E4` | `#242934` | `border-stone-200/80` |
| **Input & Control Border** | `--color-stone-300` | `#D6D3D1` | `#454D5E` | `border-stone-300` |
| **Signature Hero Card & Dark CTA** | `--color-stone-900` | `#1C1917` | `#242934` *(Tidak pernah di-invert jadi putih)* | `bg-stone-900 text-white` |
| **Primary Text (Judul & Angka)** | `--color-stone-900` | `#1C1917` | `#EAEDF2` | `text-stone-900` |
| **Secondary Text (Sub-judul)** | `--color-stone-700` | `#44403C` | `#C6CDD9` | `text-stone-700` |
| **Muted Text / Label Metadata** | `--color-stone-500` | `#78716C` | `#949EB0` | `text-stone-500` |
| **Placeholder & Chevron Icon** | `--color-stone-400` | `#A8A29E` | `#7C8596` | `text-stone-400` |
| **Official Brand Gold (Key/PIN)** | `--color-paving-yellow` | `#FFD700` | `#FFD700` | `text-[#FFD700]` |
| **Official Letterhead Crimson** | `--color-letterhead-red` | `#B02524` | `#C96572` | `text-[#b02524]` |

#### B. Tabel Token Warna Semantik Status (Badges, Buttons & Alerts)
| Status Operasional | Background (Light) | Border (Light) | Text / Icon (Light) | Kelas Tailwind Standar ERP |
| :--- | :--- | :--- | :--- | :--- |
| **Success / Approved / Running / Good** | `#ECFDF5` (`emerald-50`) | `#A7F3D0` (`emerald-200/80`) | `#047857` (`emerald-700`) | `bg-emerald-50 text-emerald-700 border-emerald-200/80` |
| **Primary Action Button (Approve/Save)** | `#059669` (`emerald-600`) | `#059669` (`emerald-600`) | `#FFFFFF` (`white`) | `bg-emerald-600 hover:bg-emerald-700 text-white` |
| **Warning / Pending / Paused / Revise** | `#FFFBEB` (`amber-50`) | `#FDE68A` (`amber-200/80`) | `#92400E` (`amber-800`) | `bg-amber-50 text-amber-800 border-amber-200/80` |
| **Danger / Breakdown / Rejected / Scrap** | `#FFF1F2` (`rose-50`) | `#FECDD3` (`rose-200/80`) | `#BE123C` (`rose-700`) | `bg-rose-50 text-rose-700 border-rose-200/80` |
| **Info / Shipped / In-Transit** | `#F0F9FF` (`sky-50`) | `#BAE6FD` (`sky-200/80`) | `#0369A1` (`sky-700`) | `bg-sky-50 text-sky-700 border-sky-200/80` |
| **Neutral / Draft / Closed** | `#F5F5F4` (`stone-100`) | `#E7E5E4` (`stone-200/90`) | `#44403C` (`stone-700`) | `bg-stone-100 text-stone-700 border-stone-200/90` |

#### C. Sub-Tema Khusus Modul HRIS / ESS (`.hris-theme`)
Ketika pengguna membuka tab **HR Portal / ESS (`/ess`)**, Web ERP memiliki nuansa *Clean Alabaster* yang sedikit lebih sejuk namun tetap satu keluarga desain:
- `--color-stone-50`: `#F7F7F9` (Alabaster Canvas)
- `--color-stone-200`: `#E2E3EA` (Specular Hairline Border)
- `--color-stone-900`: `#121318` (Crisp Slate-Charcoal Text)
- Kartu menggunakan `box-shadow: 0 12px 32px -10px rgba(18, 19, 24, 0.06), 0 2px 6px -1px rgba(18, 19, 24, 0.03)`.

---

### 2.3 Sistem Tipografi, Skala Huruf Mobile & Disiplin `tabular-nums`

Web ERP menetapkan ukuran font dasar (`root html font-size`) sebesar **`14px` pada layar mobile (`max-width: 639px`)** dan **`15px` pada layar desktop** agar kepadatan informasi (*density*) terlihat rapi, proporsional, dan tidak kebesaran di layar ponsel.

#### A. Pasangan Font Resmi (`@theme` di `src/index.css`)
```css
--font-sans: "Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
```

#### B. Hirarki Ukuran Huruf Mobile (Proporsional 390 × 844 px)
| Elemen Teks | Kelas Tailwind ERP | Ukuran Aktual (Mobile) | Font Family & Weight | Aturan Tambahan |
| :--- | :--- | :--- | :--- | :--- |
| **Judul Top App Bar** | `text-sm font-bold text-stone-900 leading-tight` | `12.25px – 13px` | `Plus Jakarta Sans` (700) | `truncate` (maksimal 1 baris) |
| **Sub-label Role Top Bar** | `text-[10px] font-mono font-semibold text-stone-500` | `10px` | `JetBrains Mono` (600) | Format: `ROLE · LEVEL` (contoh: `PRODUCTION · STAFF`) |
| **Judul Hero Card (`h1`)** | `text-base font-bold tracking-tight text-white` | `14px – 15px` | `Plus Jakarta Sans` (700) | Maksimal 1 baris (`truncate`) |
| **Angka KPI Utama (2×2 Grid)** | `text-base font-bold font-mono tabular-nums text-stone-900` | `14px – 15px` | `JetBrains Mono` (700) | Wajib `tabular-nums` |
| **Judul Seksi (`h2`)** | `text-xs font-bold text-stone-900 tracking-tight` | `11px – 12px` | `Plus Jakarta Sans` (700) | Didampingi tombol `View All` (`text-xs font-bold`) |
| **Judul Item Kartu** | `text-xs font-bold text-stone-900 truncate` | `11px – 12px` | `Plus Jakarta Sans` (700) | Maksimal 1 baris |
| **Sub-teks / Metadata Kartu** | `text-[11px] text-stone-500` | `11px` | `Plus Jakarta Sans` (500) | Dipisahkan dengan titik tengah `·` |
| **Badge / Kode Dokumen** | `text-[10px] font-mono font-bold uppercase tracking-wider` | `10px` | `JetBrains Mono` (700) | Contoh: `PR`, `PO`, `QTN`, `DN`, `#WO-2310` |
| **Label Bottom Navigation** | `text-[10px] tracking-tight leading-none` | `10px` | `Plus Jakarta Sans` (500/700) | Aktif: `font-bold text-stone-900`, Inaktif: `text-stone-400` |

#### C. Hukum Wajib `font-mono tabular-nums`
Setiap elemen berikut **DILARANG** dirender menggunakan font proporsional biasa dan **WAJIB** memakai `font-mono tabular-nums`:
1. Nomor Dokumen & Tiket: `PR #104`, `PO-2026-009`, `QTN-042`, `#WO-2026-01`, `NTP-088`.
2. Nilai Mata Uang: `Rp 485.000.000` (gunakan helper `formatIDR()`).
3. Kuantitas & Stok: `372 / 500 pcs`, `1.250 Kg`, `14 Items`.
4. Waktu & Jam Live: `08:15:20`, `2026-11-13`.
5. 6-Digit Daily Authorization PIN: `A9F42C` (`tracking-[0.25em]`).

---

### 2.4 Geometri Viewport Ponsel (390 × 844 px), Radius, Spacing & Hairline Border

Agar tampilan aplikasi mobile **proporsional dan pas dengan ukuran layar ponsel** (tidak terlalu besar/raksasa), ikuti aturan dimensi fisik berikut:

1. **Batas Rasio Chrome Navigasi ($\le 15\%$ Tinggi Layar)**:
   - **Top App Bar**: Tinggi tetap `56px` (`h-14`), padding horizontal `14px` (`px-3.5`).
   - **Bottom Navigation Bar**: Tinggi tetap `64px` (`h-16`), padding horizontal `4px` (`px-1`).
   - Total ruang yang dipakai navigasi atas + bawah adalah `120px` ($\approx 14.2\%$ dari layar `844px`), menyisakan **85.8% layar murni untuk konten operasional**.
2. **Container Viewport Konten (`<main>`)**:
   - Lebar maksimum: `max-w-lg` (`512px`) di ponsel dan `md:max-w-2xl` di tablet.
   - Padding konten: `px-3 pt-3 pb-24` (`12px` kiri/kanan/atas, `96px` bawah agar konten paling bawah tidak tertutup Bottom Navigation Bar).
   - Jarak vertikal antar seksi utama: `space-y-4` (`16px`).
   - Jarak antar kartu di dalam grid 2×2: `gap-2.5` (`10px`).
3. **Aturan Radius Sudut Mobile (`@media (max-width: 639px)`)**:
   - Di dalam `src/index.css` baris 343–348, terdapat aturan khusus mobile:
     ```css
     @media (max-width: 639px) {
       /* Scale down oversized rounded corners on mobile */
       .rounded-\[2\.5rem\], .rounded-\[2rem\], .rounded-3xl {
         border-radius: 1rem !important; /* 16px */
       }
     }
     ```
   - Artinya, pada layar smartphone:
     - **Kartu Utama, Hero Card & Container Seksi**: `border-radius: 16px` (`1rem` / `rounded-2xl`).
     - **Tombol, Input & Kotak Ikon (`w-9 h-9`)**: `border-radius: 12px` (`0.75rem` / `rounded-xl`).
     - **Badge Kecil (`PR`, `PO`, `QTN`)**: `border-radius: 6px–8px` (`rounded` atau `rounded-lg`).
     - **Bottom Sheet Modal**: Sudut atas `border-top-left-radius: 24px; border-top-right-radius: 24px` (`rounded-t-3xl`) dengan *drag handle* di tengah atas (`w-10 h-1.5 bg-stone-300 rounded-full mx-auto`).

---

### 2.5 Spesifikasi Anatomi Komponen Standar UI ERP (Component Recipes)

Berikut adalah resep kelas dan struktur DOM yang wajib diikuti saat membuat komponen di aplikasi mobile:

#### 1. Top App Bar (`MobileAppShell.tsx`)
- **Container**: `sticky top-0 z-40 h-14 bg-white/95 backdrop-blur-md border-b border-stone-200/80 px-3.5 flex items-center justify-between gap-2 shrink-0`
- **Kotak Logo Resmi (`/public/logo.png` / `pwa/assets/logo.png`)**:
  - Container: `w-9 h-9 rounded-xl bg-white border border-stone-200/80 flex items-center justify-center shrink-0 shadow-2xs`
  - Image: `<img src="/logo.png" className="w-5 h-5 object-contain" />`
- **Tombol Back (Saat berada di sub-halaman)**:
  - `w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-700 shrink-0` dengan ikon `ArrowLeft` (`w-4 h-4`).
- **Tombol Aksi Kanan (System Info / PIN & Lonceng Notifikasi)**:
  - Tombol PIN: `h-9 px-2.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 border border-stone-200/80 text-stone-700 text-[11px] font-bold inline-flex items-center gap-1.5`
  - Tombol Bell: `relative w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-700`
  - Badge Unread: `absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-stone-900 text-white text-[9px] font-mono font-bold flex items-center justify-center`

#### 2. Signature Dark Hero Card (`MobileHomeDashboard.tsx`)
Digunakan **hanya 1 kali per layar** di bagian paling atas sebagai jangkar fokus utama:
- **Container**: `bg-stone-900 text-white rounded-2xl p-4 shadow-md relative overflow-hidden`
- **Baris Role Metadata**: `flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400`
- **Judul Sapaan / Mesin**: `text-base font-bold tracking-tight text-white truncate`
- **Sub-deskripsi**: `text-xs text-stone-300 truncate`
- **Tombol Refresh Ikonik (Kanan Atas)**: `w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white shrink-0`
- **Footer Hero Card**: `mt-3.5 pt-3 border-t border-white/15 flex items-center justify-between gap-2`
  - Tombol Primer Putih: `min-h-[36px] px-3.5 rounded-xl bg-white hover:bg-stone-100 text-stone-900 text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs`
  - Tombol Sekunder Translucent: `min-h-[36px] px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold inline-flex items-center gap-1.5` (dengan ikon berwarna `#FFD700`).

#### 3. Kartu KPI Grid 2×2 (`MobileHomeDashboard.tsx`)
- **Grid Wrapper**: `grid grid-cols-2 gap-2.5`
- **Item Kartu**: `bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs text-left flex flex-col justify-between transition-all active:scale-[0.98] min-h-[104px]`
  - Varian Tone:
    - Rose (Alert/Breakdown): `border-rose-200/90 bg-rose-50/20`
    - Amber (Pending Approval): `border-amber-200/90 bg-amber-50/20`
    - Emerald (Good/Target): `border-emerald-200/80`
- **Header Kartu KPI**: Kotak ikon `w-8 h-8 rounded-xl bg-stone-50 border border-stone-200/60 flex items-center justify-center` di kiri + `ChevronRight` (`w-4 h-4 text-stone-300`) di kanan.
- **Isi Kartu KPI**:
  - Label: `text-[11px] font-semibold text-stone-500 truncate`
  - Nilai: `text-base font-bold font-mono tabular-nums text-stone-900 tracking-tight mt-0.5 truncate`
  - Sub-teks: `text-[10px] text-stone-400 mt-0.5 truncate`

#### 4. Interactive Touch List Card & Divider List (`Pending Approvals` / `Active Projects`)
- **Container Seksi**: `bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs space-y-3` (gunakan `border-amber-200/90` khusus untuk antrean *Pending Approvals*).
- **Daftar Item (`divide-y divide-stone-100`)**:
  - Setiap baris adalah `<button>` dengan kelas: `w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left group cursor-pointer`
  - Sisi Kiri (`min-w-0 flex-1`):
    - Baris 1 (Metadata): `<span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-mono font-bold text-[10px]">PR</span>` + `<span className="font-mono font-bold text-stone-800">PR #104</span>` + `·` + `<span className="truncate">Nama Proyek</span>`
    - Baris 2 (Judul): `text-xs font-bold text-stone-900 truncate mt-0.5`
  - Sisi Kanan (`text-right shrink-0 flex items-center gap-2`):
    - Angka/Nilai: `text-xs font-mono font-bold tabular-nums text-stone-900`
    - Sub-status: `text-[10px] text-amber-600 font-semibold` (contoh: `Authorize PO`)
    - Ikon panah: `<ChevronRight className="w-4 h-4 text-stone-300" />`

#### 5. Bottom Sheet Inspector & Kotak Verifikasi 6-Digit Daily PIN (`MobileInspectorSheet.tsx`)
- **Backdrop**: `fixed inset-0 bg-stone-900/40 backdrop-blur-xs`
- **Sheet Container**: `relative z-10 w-full max-w-lg bg-white rounded-t-3xl shadow-2xl border-t border-stone-200 max-h-[88vh] overflow-y-auto p-5 pb-8 space-y-4`
- **Animasi Spring**: `damping: 28, stiffness: 300` (slide dari `y: "100%"` ke `y: 0`).
- **Kotak Key-Value Detail Dokumen**:
  - Container: `bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 space-y-2 text-xs`
  - Setiap baris: `flex justify-between` dengan label `text-stone-500` di kiri dan nilai `font-bold text-stone-900` (atau `font-mono font-bold`) di kanan.
- **Kotak Input 6-Digit Daily Authorization PIN**:
  - Container: `bg-stone-50 border border-stone-200 rounded-2xl p-3.5 space-y-2.5`
  - Field Input PIN:
    ```tsx
    <input
      type="text"
      maxLength={6}
      autoCapitalize="characters"
      placeholder="ENTER 6-CHAR DAILY PIN"
      className="no-base-style w-full min-h-[42px] px-3.5 bg-white border border-stone-300 rounded-xl text-center font-mono text-sm font-black tracking-[0.25em] text-stone-900 placeholder:tracking-normal placeholder:font-sans placeholder:font-medium placeholder:text-stone-400 focus:border-stone-700 outline-none uppercase"
    />
    ```
  - Tombol Eksekusi Bawah (Grid 2 Kolom `grid grid-cols-2 gap-2.5`):
    - Approve: `min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5`
    - Request Revision: `min-h-[44px] rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-center gap-1.5`

#### 6. Standar Input Form Elegan (`.input-elegant` di `src/index.css`)
Semua `<input>`, `<textarea>`, dan `<select>` di aplikasi mobile wajib mengikuti spesifikasi dasar ini:
- Tinggi minimum: `36px` (`min-height: 2.25rem`) untuk filter/pencarian, atau `42px` (`min-h-[42px]`) untuk input form di dalam Bottom Sheet.
- Padding: `6px 12px` (`0.375rem 0.75rem`).
- Background & Border: `background-color: #FFFFFF; border: 1px solid #E7E5E4; border-radius: 12px (0.75rem)`.
- Ukuran Font: `12px` (`0.75rem`), warna teks `#1C1917`.
- State Fokus (`:focus`): `border-color: #78716C; box-shadow: 0 0 0 3px rgba(28, 25, 23, 0.06)`.

---

### 2.6 Blueprint Tata Letak Layar per Modul (ASCII Wireframe & Class Contract)

Sebagai pengganti gambar statis, gunakan cetak biru (*wireframe blueprint*) di bawah ini untuk memastikan tata letak setiap layar 100% identik dengan Web ERP:

#### Layar 1: Shop Floor 2-Arah (`/shopfloor`)
```text
+-------------------------------------------------------------------+
| [PJ Logo]  Shop Floor 2-Way               [Key: PIN]  [Bell: 3]   | <- Top Bar: h-14 bg-white/95 border-b border-stone-200/80
|            PRODUCTION · OPERATOR                                  |
+-------------------------------------------------------------------+
|  +-------------------------------------------------------------+  |
|  | [RUNNING · MSN-01]          HYDRAULIC PRESS #1     [Refresh]|  | <- Hero Card: bg-stone-900 text-white rounded-2xl p-4
|  | #WO-2026-042 · Paving Block Hexagonal 8cm                   |  |
|  | Progress: [=================>       ] 372 / 500 pcs (74.4%) |  | <- Angka: font-mono tabular-nums
|  | [ || Pause WOT ]             [ ✓ Complete & Input Output ]  |  | <- CTA: min-h-[38px] rounded-xl font-bold
|  +-------------------------------------------------------------+  |
|                                                                   |
|  QUICK FLOOR ACTIONS (grid-cols-3 gap-2)                          |
|  +-------------------+ +-------------------+ +-----------------+  |
|  | [Box Icon]        | | [Alert Icon]      | | [Repeat Icon]   |  | <- Card: bg-white border-stone-200/80 rounded-2xl p-3
|  | Request Material  | | Report Breakdown  | | Shift Handover  |  |
|  +-------------------+ +-------------------+ +-----------------+  |
|                                                                   |
|  +-------------------------------------------------------------+  |
|  | 2-WAY SUPERVISOR <-> OPERATOR FLOOR NOTES          Live Sync|  | <- Container: bg-white border-stone-200/90 rounded-2xl p-4
|  |-------------------------------------------------------------|  |
|  | SUPV. HENDRA · 08:30 (font-mono)                            |  |
|  | "Pastikan tekanan cetakan stabil di 180 bar untuk batch 2." |  | <- Bubble Supervisor: bg-stone-100 text-stone-900 rounded-2xl
|  |                                                             |  |
|  |                                      ANDA (OPERATOR) · 08:34|  |
|  |               "Siap Pak, tekanan stabil 180 bar, 0 scrap."  |  | <- Bubble Operator: bg-stone-900 text-white rounded-2xl
|  |-------------------------------------------------------------|  |
|  | [ Ketik balasan ke Supervisor...              ] [ Kirim -> ]|  | <- Input: input-elegant + Button bg-stone-900
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
|   [Factory]         [MessageSquare]      [UserCheck]     [User]   | <- Bottom Nav: h-16 bg-white/95 border-t border-stone-200/90
|   Shop Floor           Messages           HR Portal     Profile   |
+-------------------------------------------------------------------+
```

#### Layar 2: HR Portal / ESS (`/ess`)
```text
+-------------------------------------------------------------------+
| [PJ Logo]  HR Portal (ESS)                [Key: PIN]  [Bell: 1]   | <- Top Bar: h-14 bg-white/95
|            PRODUCTION · STAFF                                     |
+-------------------------------------------------------------------+
|  +-------------------------------------------------------------+  |
|  | SHIFT PAGI (08:00 - 17:00)               GPS: PABRIK SENTUL |  | <- Hero Card: bg-stone-900 text-white rounded-2xl p-4
|  | 08:14:52 WIB                             Status: HADIR      |  | <- Jam Live: text-xl font-mono font-black tabular-nums
|  | Masuk: 07:54 WIB · Pulang: --:--                            |  |
|  | [ -> Clock-In Masuk ]               [ [x] Clock-Out Pulang ]|  | <- Clock-In: bg-emerald-600 | Clock-Out: bg-white/15
|  +-------------------------------------------------------------+  |
|                                                                   |
|  KEY HR METRICS (grid-cols-2 gap-2.5)                             |
|  +-----------------------------+ +-----------------------------+  |
|  | [Calendar]                > | | [Award]                   > |  | <- KPI Card: bg-white border-stone-200/80 rounded-2xl p-3.5
|  | Remaining Leave             | | KPI Performance Score       |  |
|  | 9 Days                      | | 94.5 / 100                  |  | <- Nilai: font-mono tabular-nums text-base font-bold
|  | Annual Quota: 12 Days       | | Grade A (Excellent)         |  |
|  +-----------------------------+ +-----------------------------+  |
|                                                                   |
|  +-------------------------------------------------------------+  |
|  | SLIP GAJI & PENGAJUAN CUTI                                  |  | <- Container: bg-white border-stone-200/90 rounded-2xl p-4
|  | [ + Ajukan Cuti / Izin ]       [ Lihat Slip Gaji (PDF) ]    |  | <- Membuka Bottom Sheet Modal In-App
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
```

#### Layar 3: Messages & In-App Document Preview (`/forum`)
```text
+-------------------------------------------------------------------+
| [<-]       #PRJ-2026-088 · Produksi Paving [Key: PIN] [Bell: 0]   | <- Top Bar: h-14 bg-white/95
|            4 Partisipan Aktif                                     |
+-------------------------------------------------------------------+
|  [ Filter Kanal: Semua | Proyek | Departemen | Direct ]           | <- Segmented Pill Track: bg-stone-100 p-1 rounded-xl
|                                                                   |
|  ENG. RAKA · 09:10                                                |
|  +-----------------------------------------------+                |
|  | Berikut revisi SOP & Gambar Kerja cetakan:    |                | <- Chat Bubble: bg-white border border-stone-200/80 rounded-2xl
|  | +-------------------------------------------+ |                |
|  | | [PDF Icon] SOP-BOP-HEX8CM-V2.pdf          | |                | <- Attachment Card: bg-stone-50 border-stone-200 rounded-xl
|  | |            245 KB · Ketuk untuk Pratinjau | |                |    (WAJIB membuka In-App Preview Modal saat diketuk!)
|  | +-------------------------------------------+ |                |
|  +-----------------------------------------------+                |
|                                                                   |
|  +-------------------------------------------------------------+  |
|  | [Paperclip] [ Tulis pesan atau lampirkan kode... ] [Send ->]|  | <- Composer Bar: sticky bottom-16 bg-white border-t
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
```

#### Layar 4: Back-Office Executive Hub (`MobileMonitorHub.tsx`)
```text
+-------------------------------------------------------------------+
| [PJ Logo]  Paving Joss Mobile             [Key: PIN]  [Bell: 4]   | <- Top Bar: h-14 bg-white/95
|            FINANCE · MANAGER                                      |
+-------------------------------------------------------------------+
|  +-------------------------------------------------------------+  |
|  | FINANCE · MANAGER                                  [Refresh]|  | <- Hero Card: bg-stone-900 text-white rounded-2xl p-4
|  | Hi, Budi Santoso                                            |  |
|  | Cashflow, AR/AP & Procurement Authorization                 |  |
|  | [ Zap: Open Finance Hub ]             [ Monitor: System Info]|  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|  CATEGORY PILLS (Horizontal Scroll - scrollbar-hide)              |
|  [APPROVALS (4)] [PROJECTS] [INVENTORY] [PROCUREMENT] [FINANCE]   | <- Active Pill: bg-stone-900 text-white rounded-xl
|                                                                   |    Inactive Pill: bg-white border-stone-200 text-stone-600
|  +-------------------------------------------------------------+  |
|  | [Shield] Pending Approvals                      View All (4)|  | <- Container: bg-white border-amber-200/90 rounded-2xl p-4
|  |-------------------------------------------------------------|  |
|  | [PO] PO-2026-019 · PT Semen Nusantara      Rp 128.500.000 > |  | <- Ketuk baris -> Membuka MobileInspectorSheet + Input PIN
|  |      Procurement Purchase Order              Authorize PO   |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
```

---

### 2.7 Daftar Pantangan Visual (Anti-Pattern Rules)

Untuk menjaga agar tampilan aplikasi mobile **100% selaras dengan Web ERP**, pengembang Android & iOS **DILARANG KERAS** melakukan hal-hal berikut:
1. **Dilarang Menggunakan Tema Gelap Kebiruan/Neon sebagai Default**: Default tema wajib **Warm Stone Light Theme (`#FAFAF9` & `#FFFFFF`)**. Jika mengaktifkan Dark Mode, wajib menggunakan token **Stealth Gunmetal (`#0D0F12` & `#13161B`)**, bukan hitam pekat `#000000` atau biru tua `#0F172A`.
2. **Dilarang Memakai Garis Tepi Samping Tebal (`border-l-4`)**: Kartu di Web ERP menggunakan border keliling 1px merata (`border border-stone-200/80`). Jangan menambahkan garis aksen tebal di sisi kiri kartu.
3. **Dilarang Membuat Ukuran Font & Padding Raksasa**: Jangan menggunakan `text-2xl` / `text-3xl` atau `p-8` di layar mobile. Gunakan proporsi `text-xs` (`11px–12px`), `text-sm` (`13px`), dan `text-base` (`14px–15px`) dengan padding kartu `p-3.5` (`14px`) atau `p-4` (`16px`).
4. **Dilarang Menampilkan Lebih dari 1 Kartu Gelap (`bg-stone-900`) per Layar**: Hanya *Hero Card* paling atas yang boleh memakai `bg-stone-900`. Seluruh kartu di bawahnya wajib `bg-white`.
5. **Dilarang Menampilkan Tabel Scroll Horizontal (`<table>` lebar)**: Di layar ponsel, semua tabel Web ERP wajib ditransformasi menjadi *Interactive Touch Card List* (`divide-y divide-stone-100`) dengan *Bottom Sheet Inspector*.
6. **Dilarang Mengganti Logo Resmi**: Selalu gunakan file `pwa/assets/logo.png` (identik dengan `/public/logo.png` di Web ERP).

---

## 3. Arsitektur Integrasi Database PostgreSQL & Sinkronisasi Data 2-Arah

Aplikasi mobile **TIDAK** menggunakan database terpisah yang terisolasi, melainkan membaca dan menulis ke **Database Utama ERP Paving Joss yang berbasis PostgreSQL**:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                   ARSITEKTUR DATA MOBILE <-> POSTGRESQL ERP                │
└────────────────────────────────────────────────────────────────────────────┘
  [ Aplikasi Android & iOS ]
              │
              │ 1. REST API (/api/mobile/*, /api/hr/*, /api/chat/*)
              │    + Header: Authorization: Bearer <JWT>
              │    + Header: X-Client-Platform: mobile-app
              │    + Header: X-Idempotency-Key: <UUID>
              │ 2. WebSocket Real-Time (Socket.IO: production:updated,
              │    chat:message, workflow:updated)
              ▼
  [ Express Server & Mobile Gateway (src/routes/mobile.ts) ]
              │
              ├──► Engine Transaksional Cepat & CDC Trigger (src/db/database.ts)
              │
              └──► PostgreSQL Engine & Cloud Bridge (src/db/postgresClient.ts
                   & src/db/postgresBridge.ts & src/db/pgMigrator.ts)
                     ├─ Koneksi Pool Langsung: pg.Pool via DATABASE_URL /
                     │  SUPABASE_DB_URL (PostgreSQL Connection Pooler :6543)
                     ├─ Replikasi Real-Time & Delta Pull: public.erp_sync_records
                     │  (JSONB Document + Relational Checksum Index)
                     └─ 68 Tabel Terbagi Utuh (users, work_order_tickets,
                        production_manpower, floor_requests, hr_attendances,
                        hr_leaves, hr_payslips, chat_threads, chat_messages,
                        purchase_requests, purchase_orders, quotations, projects)
```

### File Referensi PostgreSQL di `pwa/reference-backend/db/`:
- `postgresClient.ts` : Konfigurasi `pg.Pool` langsung (`DATABASE_URL` / `SUPABASE_DB_URL`), eksekusi query parameter `pgQuery()`, dan auto-DDL.
- `postgresBridge.ts` : Jembatan sinkronisasi dua arah antara transaksi lokal dan PostgreSQL (`public.erp_sync_records`), CDC watermark, serta kebijakan keamanan RLS `service_role`.
- `pgMigrator.ts` & `migrator.ts` : Orkestrator migrasi penuh dan per-tabel (`syncAllTablesToPostgres()`, `syncSingleTableToPostgres()`, verifikasi checksum MD5/SHA).
- `schema.ts` & `migrations/01_core.ts` s/d `06_hris.ts` : Definisi skema tabel relasional inti ERP, Sales, Inventory, Production, Finance, dan HRIS.

---

## 4. Kontrak API, Endpoint & Payload Pertukaran Data (Mobile $\longleftrightarrow$ Web ERP)

### A. Header Standar Wajib di Setiap Request Mobile
```http
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
X-Client-Platform: mobile-app
X-Mobile-OS: android   # atau ios
X-Idempotency-Key: MOB-<timestamp>-<random>   # Wajib untuk POST/PUT/PATCH
```

### B. Daftar Endpoint Utama & Struktur Data

#### 1. Autentikasi, Bootstrap & Status PostgreSQL
| Method & Endpoint | Fungsi | Payload Request | Response Utama |
| :--- | :--- | :--- | :--- |
| `POST /api/mobile/auth/login` | Login Operator & Back-Office | `{ "username": "...", "password": "...", "platform": "Android" }` | `{ token, user, app_scope: "OPERATOR_MOBILE" \| "BACKOFFICE_MOBILE", allowed_modules, manpower, assigned_machine }` |
| `GET /api/mobile/bootstrap` | Handshake sesi & identitas DB | - | `{ user, app_scope, database_identity: { unified_with_web_erp: true, supabase_table: "public.erp_sync_records", live_table_counts } }` |
| `GET /api/mobile/db-status` | Verifikasi koneksi PostgreSQL | - | `{ same_database_guaranteed: true, engine_summary, postgres_engine, supabase_sync }` |
| `POST /api/mobile/postgres/sync` | Memicu sinkronisasi penuh ke PostgreSQL | `{ "source": "mobile-app" }` | `{ success: true, sync_result: { batchId, totalTables, totalRowsSynced } }` |

#### 2. Modul 2-Way Shop Floor (Supervisor $\longleftrightarrow$ Operator)
| Method & Endpoint | Fungsi | Payload Request | Efek Database & Socket.IO |
| :--- | :--- | :--- | :--- |
| `GET /api/mobile/shopfloor/workstation` | Memuat mesin aktif, WOT, BOP, Floor Notes 2-Arah, Floor Requests, & NDP | Query opsional: `?project_id=PRJ-...` | Membaca `production_manpower`, `items`, `work_order_tickets`, `bill_of_processes`, `chat_threads`, `floor_requests`, `notice_to_down_processes` |
| `POST /api/mobile/shopfloor/thread-reply` | Mengirim/membalas catatan 2-arah antara Operator & Supervisor | `{ "project_id": "...", "wot_id": "...", "content": "Tekanan press stabil 180 bar" }` | Insert ke `chat_messages` + replikasi PostgreSQL + broadcast Socket.IO `chat:message` & `production:updated` |
| `POST /api/mobile/shopfloor/quick-action` | Eksekusi WOT, Minta Material/Tooling, Lapor NDP, atau Shift Handover | `{ "action_type": "WOT_STATUS" \| "FLOOR_REQUEST" \| "REPORT_NDP" \| "SHIFT_HANDOVER", ... }` | Update `work_order_tickets` / insert `floor_requests` / `notice_to_down_processes` / `hr_handovers` + replikasi PostgreSQL + broadcast `production:updated` |

#### 3. Modul ESS (HR Portal — Absensi, Cuti, Payslip, KPI, Lembur)
| Method & Endpoint | Fungsi | Payload Request | Response / Efek Database |
| :--- | :--- | :--- | :--- |
| `GET /api/mobile/ess-summary` | Ringkasan ESS lengkap karyawan | - | `{ profile, attendance: { today, recent }, leave: { annual_quota, remaining_days, requests }, compensation: { salary_master, payslips }, kpi, overtime_schedules }` |
| `POST /api/hr/attendance/clock` | Clock-In / Clock-Out Absensi GPS | `{ "action": "CLOCK_IN" \| "CLOCK_OUT", "location_name": "Pabrik Sentul", "notes": "..." }` | Mencatat jam hadir ke `hr_attendances` dan mereplikasi ke PostgreSQL |
| `POST /api/hr/leaves` | Pengajuan Cuti / Izin | `{ "leave_type": "Annual Paid Leave", "start_date": "2026-11-20", "end_date": "2026-11-21", "reason": "..." }` | Insert ke tabel `hr_leaves` dengan status `PENDING` |

#### 4. Modul Message, Forum & In-App Document Preview
| Method & Endpoint | Fungsi | Payload Request | Response / Efek Database |
| :--- | :--- | :--- | :--- |
| `GET /api/chat/threads` | Daftar kanal diskusi & grup proyek | - | Array `chat_threads` beserta partisipan dan pesan terakhir |
| `GET /api/chat/threads/:id/messages` | Riwayat pesan & lampiran dokumen | - | Array `chat_messages` (termasuk metadata `file_url`, `file_name`, `file_type`) |
| `POST /api/chat/messages` | Kirim pesan teks atau lampiran | `{ "thread_id": "...", "content": "...", "file_url": "..." }` | Insert ke `chat_messages` + emit Socket.IO `chat:message` |

#### 5. Modul Back-Office MobileMonitorHub & Approval PIN
| Method & Endpoint | Fungsi | Payload Request | Response / Efek Database |
| :--- | :--- | :--- | :--- |
| `GET /api/mobile/backoffice/hub` | Mengambil seluruh 8 kategori `MobileMonitorHub` dalam 1 panggilan | - | `{ summary, projects, quotations, purchaseRequests, purchaseOrders, inventory, deliveries, customers, vendors, hrLeaves, postgres_bridge }` |
| `POST /api/mobile/backoffice/authorize` | Otorisasi (`APPROVE` / `REVISE` / `REJECT`) dokumen dengan PIN 6-Digit Harian | `{ "doc_type": "PR" \| "PO" \| "QUOTATION" \| "DELIVERY" \| "HR_LEAVE" \| "PROJECT_SPK", "doc_id": "...", "action": "APPROVE", "pin": "123456", "notes": "..." }` | Memvalidasi `getDailyAuthKey(username)`, mengupdate status tabel terkait di PostgreSQL/SQLite, mencatat `audit_logs`, dan menyiarkan Socket.IO `workflow:updated` |

---

## 5. Batasan & Aturan Ketat Pembuatan Aplikasi (FE & BE Constraints)

1. **Pemisahan Mutlak Akun `OPERATOR` vs `BACK-OFFICE`**:
   - Akun dengan `role === "OPERATOR"` hanya boleh login melalui aplikasi mobile (menggunakan header `X-Client-Platform: mobile-app`) dan ditolak jika mencoba login ke Web ERP desktop.
   - Staf kantor (`SALES`, `FINANCE`, `HR`, `ENGINEERING`, `PRODUCTION` Supervisor/Manager) mendapatkan `app_scope === "BACKOFFICE_MOBILE"` dan tidak boleh dimasukkan ke dalam tabel operator mesin fisik (`production_manpower`).
2. **Larangan Membuka Dokumen di Luar Aplikasi pada Modul Message**:
   - Setiap lampiran dokumen teknis (SOP, BOP, SPK, Quotation, PDF) yang diklik di dalam tab **Messages** wajib ditampilkan menggunakan **In-App Preview Modal / Bottom Sheet** agar operator atau supervisor tidak keluar dari konteks percakapan.
3. **Larangan Tabel Horizontal di Layar Mobile (`Zero Horizontal Scroll Table`)**:
   - Seluruh data ERP pada layar mobile (baik daftar WOT, antrean PR/PO, stok gudang, maupun slip gaji) wajib dirender sebagai **Interactive Touch Cards** (`rounded-2xl`, tinggi sentuh minimum `44px–48px`) dengan *Bottom Sheet Inspector* saat diketuk.
4. **Dukungan Antrean Offline (`Offline-First Mutation Queue`)**:
   - Area pabrik rawan mengalami *blank-spot* sinyal. Semua mutasi (`POST/PUT/PATCH`) yang gagal karena jaringan terputus wajib masuk ke antrean penyimpanan lokal (`enqueueOfflineMutation`) dan dikirim ulang secara otomatis (`flushOfflineQueue`) beserta `X-Idempotency-Key` ketika koneksi pulih.

---

## 6. Peta Referensi File di Dalam Direktori `pwa/`

Seluruh file sumber dari proyek ERP utama telah disalin dan dikelompokkan berdasarkan fungsinya di dalam `pwa/`:

- **`pwa/assets/`**:
  - `logo.png` & `dm_logo.png` (Logo monogram resmi Paving Joss dari `/public`).
- **`pwa/reference-backend/`**:
  - `db/` : `postgresClient.ts`, `postgresBridge.ts`, `pgMigrator.ts`, `migrator.ts`, `database.ts`, `schema.ts`, `firebaseSync.ts`, `firestoreAdapter.ts`, serta seluruh skema `migrations/01_core.ts` s/d `06_hris.ts`.
  - `routes/` : `mobile.ts` (Gateway utama), `auth.ts`, `users.ts`, `chat.ts`, `forum.ts`, `documents.ts`, `hr.ts`, `attendance.ts`, `payroll.ts`, `production.ts`, `projects.ts`, `purchasing.ts`, `sales.ts`, `inventory.ts`, `finance.ts`, `workflow.ts`, `migration.ts`, `datacenter.ts`, `integrity.ts`, beserta seluruh sub-rute `production/`, `projects/`, `purchasing/`, `sales/`, `hr/`.
  - `middleware/` & `utils/` : `auth.ts`, `idempotency.ts`, `validate.ts`, `audit.ts`, `qrCrypto.ts`, `supabase.ts`.
- **`pwa/reference-frontend/`**:
  - `design-system/` : `index.css` (Token warna Warm Stone & tipografi ERP) serta seluruh komponen dasar `ui/` (`Card.tsx`, `Button.tsx`, `Badge.tsx`, `Modal.tsx`, `Tabs.tsx`, `StatCard.tsx`, dll.).
  - `auth-and-rbac/` : `AuthContext.tsx`, `MonitoringContext.tsx`, `NotificationContext.tsx`, `ThemeContext.tsx`, `rbac.ts`, `pbac.ts`, `api.ts`, `offlineSyncStore.ts`.
  - `shopfloor-2way/` : `ShopFloorProjectDetail.tsx`, `ShopFloorExecution.tsx`, `ShopFloor.tsx`, `FloorTerminal.tsx`, `shopFloorTypes.ts`.
  - `ess/` : `SelfService.tsx`, `HrPortal.tsx`, `AttendanceReminder.tsx`.
  - `message/` : `Forum.tsx` beserta komponen `ForumChatHeader.tsx`, `ForumMessageStream.tsx`, `ForumComposer.tsx`, `ForumSidebar.tsx`, `ForumModals.tsx`.
  - `backoffice-monitor/` : `MobileAppShell.tsx`, `MobileMonitorHub.tsx`, `DesktopModeNotice.tsx`, `monitorTypes.ts`, `SupabaseSyncPanel.tsx`, serta `hub/MobileHomeDashboard.tsx`, `hub/MobileRoleActionHub.tsx`, `hub/MobileInspectorSheet.tsx`.
- **`pwa/mobile-starter-kit/`**:
  - Aplikasi mandiri siap *build* untuk Android & iOS (`package.json`, `capacitor.config.ts`, `index.html`, `vite.config.ts`, `tsconfig.json`, `public/logo.png`, `src/main.tsx`, `src/index.css`, `src/services/mobileApiClient.ts`, dan `src/App.tsx`).

---

## 7. Panduan Langkah Demi Langkah Build Android & iOS

Untuk memindahkan paket ini ke repositori proyek aplikasi mobile baru:

```bash
# 1. Salin starter kit ke folder repositori baru di luar proyek Web ERP
mkdir paving-joss-mobile && cp -r pwa/mobile-starter-kit/* paving-joss-mobile/
cd paving-joss-mobile

# 2. Instal seluruh dependensi (React, Capacitor, Socket.IO, Supabase Client, Tailwind)
npm install

# 3. Atur URL Server Web ERP & PostgreSQL Gateway pada file .env
echo "VITE_ERP_API_URL=https://erp.pavingjoss.com" > .env

# 4. Build aset web dan sinkronkan ke proyek native Android & iOS
npm run build
npx cap add android
npx cap add ios
npx cap sync

# 5. Buka di Android Studio (untuk build APK/AAB) atau Xcode (untuk build iOS/IPA)
npx cap open android
npx cap open ios
```
