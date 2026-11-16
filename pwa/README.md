# Paving Joss ERP Mobile — Product Requirements Document (PRD v3.0)
## Arsitektur UI/UX-First · Modular Minimalist Card · Empty-First Build

Direktori `pwa/` adalah **paket referensi terisolasi** untuk membangun aplikasi mobile native **iOS (Swift / SwiftUI)** dan **Android (Kotlin / Jetpack Compose)**. Seluruh kode di dalam `pwa/` **tidak terhubung dan tidak memengaruhi proyek Web ERP utama**.

Sesuai arah pengembangan terbaru, fase awal berfokus penuh pada **kesempurnaan UI/UX bergaya kartu modular minimalis dalam kondisi build kosong (*zero-data shell*)**. Seluruh referensi backend, database PostgreSQL, dan data dummy telah dihilangkan dari paket ini dan dijadwalkan menjadi **Fase Terakhir** setelah antarmuka mobile disetujui sepenuhnya.

---

## 1. Prinsip Desain & Identitas Visual

1. **Modular Minimalist Card**:
   - Kanvas dasar menggunakan warna hangat `#FAFAF9` dengan kartu permukaan `#FFFFFF` (`border 1px #E7E5E4`, sudut membulat `16pt/dp`).
   - Setiap kartu hanya menampilkan struktur jelas dan maksimal 2–3 elemen informasi utama agar bersih, elegan, dan tidak overinformatif.
2. **Build Awal Kosong Netral (*Zero-Data Empty Shell*)**:
   - Dilarang menyertakan data fiktif (nama karyawan contoh, angka saldo/gaji palsu, atau contoh pesan chat tiruan).
   - Nilai pada kartu saat build awal menampilkan simbol netral **`—`** dengan keterangan singkat yang jujur (*Belum tercatat*, *Belum ada data*, *Belum ada percakapan*).
3. **Identitas Logo Resmi Web ERP**:
   - Aplikasi mobile wajib menggunakan logo geometris **PJ** yang sama persis dengan Web ERP:
     - Mode terang: `ui-references/assets/logo.png` (dan `01-foundation-ui-and-auth/brand-assets/logo.png`)
     - Mode gelap: `ui-references/assets/dm_logo.png` (dan `01-foundation-ui-and-auth/brand-assets/dm_logo.png`)

---

## 2. Alur Layar & Urutan Navigasi Wajib

1. **Halaman Login (Gerbang Awal)**:
   - Kartu putih minimalis di tengah layar (`radius 24pt/dp`, border tipis `#E7E5E4`).
   - Menampilkan logo resmi Web ERP di bagian atas kartu, judul *Masuk ke Akun*, input **Username** dan **Password** (dengan tombol lihat/sembunyikan kata sandi), serta tombol primer **Masuk** (`#1C1917`).
   - Pada Fase 1 (UI/UX-Only), menekan tombol **Masuk** langsung mengarahkan ke tab default **Dashboard**.
2. **Urutan Tab Navigasi Bawah (*Kiri ke Kanan*)**:
   - **Tab 0 (Default & Paling Kiri): `Dashboard`** *(pengganti nama HR Portal)*
     - Kartu `Presensi Hari Ini` (`— · Belum tercatat` + tombol `Catat Kehadiran`), grid 2 kolom `Kuota Cuti` & `Slip Gaji` (`—`), serta kartu `Aktivitas Terbaru`.
   - **Tab 1: `Messages`**
     - Kolom pencarian `Cari percakapan...` dan kartu kosong netral `Belum ada percakapan`.
   - **Tab 2: `Shop Floor`**
     - Kartu `Workstation Aktif` (`—`), grid 2 kolom `Target` & `Hasil` (`—`), serta kartu `Antrian Produksi` dalam kondisi kosong netral.
   - **Tab 3 (Paling Kanan): `Profile/Hub`**
     - Kartu `Identitas Pengguna` netral (`— · Belum terhubung ke akun ERP`), daftar pengaturan dasar, serta tombol **Keluar** (`#B02524`) untuk kembali ke halaman Login.

---

## 3. Peta Struktur Direktori `pwa/`

- **`01-foundation-ui-and-auth/`**
  - `brand-assets/`: Salinan resmi `logo.png` dan `dm_logo.png` dari Web ERP.
  - `styles/index.css` & `ui-primitives/`: Token desain dan komponen dasar React/Tailwind sebagai acuan visual Web ERP.
  - `mobile-shell/LoginScreen.tsx` & `MobileAppShell.tsx`: Referensi layout *zero-data* untuk Login dan *App Shell* 4 tab (`Dashboard | Messages | Shop Floor | Profile/Hub`).
- **`06-native-starter-specs/`**
  - `ios-swift/PavingJossNativeCore.swift` & `android-kotlin/PavingJossNativeCore.kt`: Token warna, dimensi modular, enum rute `Login` & 4 tab (`Dashboard` default paling kiri), serta konstanta *empty state* netral (tanpa klien API/database).
- **`ui-references/`**
  - `assets/`: Logo resmi Web ERP (`logo.png`, `dm_logo.png`).
  - `mockups/`: 5 gambar mockup layar bersih (`00_login_minimalist_card_ui.jpg` hingga `04_profile_hub_empty_modular_ui.jpg`).
  - `guidelines/UI_DESIGN_STANDARDS_DO_AND_DONT.md`: Standar kepadatan visual, aturan anti-overinformatif, dan tata letak kartu modular.
  - `native-components/`: Komponen UI siap pakai untuk **SwiftUI** (`PavingJossCleanUI.swift`) dan **Jetpack Compose** (`PavingJossCleanUI.kt`).
  - `interactive-preview/index.html`: Pratinjau interaktif HTML statis untuk menguji alur Login dan perpindahan seluruh 4 tab di browser.

---

## 4. Peta Jalan Pengembangan Bertahap

1. **Fase 1 (Saat Ini): Fondasi UI/UX & Build Kosong Bersih**
   - Implementasi halaman **Login** dan *App Shell* 4 tab dengan **Dashboard** sebagai default paling kiri.
   - Seluruh komponen kartu tampil dengan gaya **modular minimalist** dan *empty state* netral tanpa data tiruan, tanpa kode backend, dan tanpa database lokal/remote.
2. **Fase 2: Penyempurnaan Interaksi UI & Responsivitas**
   - Validasi animasi transisi antar-halaman, ergonomi target sentuh (`44–48pt/dp`), keterbacaan pada berbagai ukuran layar ponsel, serta adaptasi mode gelap (`dm_logo.png`).
3. **Fase Terakhir (Final Phase): Integrasi Backend & Data Web ERP**
   - Menghubungkan sesi login autentikasi, endpoint data karyawan/Dashboard, percakapan Messages, aktivitas Shop Floor, serta database **PostgreSQL** milik Web ERP setelah seluruh aspek UI/UX Fase 1–2 disetujui penuh.
