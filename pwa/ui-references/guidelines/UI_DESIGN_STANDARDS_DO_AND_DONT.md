# Panduan Standar Desain UI Mobile Native (iOS SwiftUI & Android Jetpack Compose)
## Filosofi "Modular Minimalist Card & Empty-First Shell" (UI/UX-First Blueprint)

Dokumen ini menjadi pedoman wajib bagi pengembang **iOS (Swift / SwiftUI)** dan **Android (Kotlin / Jetpack Compose)** dalam membangun fondasi antarmuka **Paving Joss ERP Mobile**. Fokus utama tahap awal ini adalah **kesempurnaan tata letak, keterbacaan, dan estetika kartu modular minimalis dalam kondisi build kosong (*zero-data shell*)** sebelum memasuki tahap integrasi backend pada fase terakhir.

---

## 1. Prinsip Utama Desain UI/UX Mobile

1. **Modular Minimalist Card**:
   - Seluruh informasi dikelompokkan ke dalam kartu putih bersih (`#FFFFFF`) di atas kanvas hangat `#FAFAF9` dengan sudut membulat `16pt/dp` (`24pt/dp` untuk kartu Login), batas tipis `1pt/dp` (`#E7E5E4`), dan *padding* lapang (`16pt/dp`).
   - Hindari kartu bertumpuk di dalam kartu (*cards within cards*) atau garis aksen tebal warna-warni.
2. **Empty-First Neutral State (Build Awal Kosong)**:
   - Aplikasi harus terbuild **tanpa data fiktif, tanpa nama karyawan palsu, tanpa nominal rupiah tiruan, dan tanpa riwayat percakapan contoh**.
   - Setiap slot kartu menampilkan **label struktur** (mis. `PRESENSI HARI INI`, `KUOTA CUTI`, `SLIP GAJI`, `WORKSTATION AKTIF`) disertai nilai netral **`—`** dan keterangan sopan (`Belum tercatat`, `Belum ada data`, `Belum ada percakapan`).
3. **Identitas Logo Resmi Web ERP**:
   - Gunakan aset logo grafis geometris **PJ** resmi milik Web ERP (`assets/logo.png` untuk mode terang, `assets/dm_logo.png` untuk mode gelap).
   - Dilarang mengganti logo dengan teks biasa atau kotak inisial buatan sendiri.
4. **Alur Masuk & Navigasi Default (`Dashboard` Paling Kiri)**:
   - Layar pertama saat aplikasi dibuka adalah **Halaman Login** (kartu putih minimalis di tengah, logo Web ERP, input `Username` & `Password`, tombol `Masuk`).
   - Setelah mengetuk `Masuk`, aplikasi langsung mendarat pada tab **`Dashboard`** (sebelumnya *HR Portal*) di posisi **paling kiri (indeks 0)**.
   - Urutan tetap 4 tab navigasi bawah (kiri ke kanan): **`Dashboard` | `Messages` | `Shop Floor` | `Profile/Hub`**.

---

## 2. Tabel Komparasi *Do vs Don't* per Komponen

| Komponen UI | ❌ JANGAN LAKUKAN (*Don't*) | ✅ LAKUKAN (*Do*) |
| :--- | :--- | :--- |
| **Halaman Login** | Memasang banner promosi penuh gambar, tombol SSO tiruan, atau akun demo hardcoded di bawah tombol masuk. | Gunakan **kartu putih minimalis terpusat**, logo resmi Web ERP (`logo.png`), input `Username` & `Password`, dan tombol tunggal **`Masuk`** (`#1C1917`). |
| **Navigasi Bawah (*Bottom Bar*)** | Menaruh `HR Portal` di paling kanan atau menyisipkan badge angka palsu pada ikon tab. | Susun tepat 4 tab kiri ke kanan: **`Dashboard`** (default paling kiri), **`Messages`**, **`Shop Floor`**, **`Profile/Hub`**. |
| **Top App Bar (`56pt/dp`)** | Memenuhi header dengan tombol *System Info*, lonceng notifikasi dengan angka palsu, atau status server. | Tampilkan **logo Web ERP (`28pt/dp`) + judul layar aktif** di sisi kiri secara bersih dan konsisten. |
| **Isi Kartu Saat Build Awal** | Mengisi nama fiktif (`"Budi Santoso"`), angka gaji (`"Rp 5.400.000"`), atau chat contoh agar tampak penuh. | Tampilkan **label struktur + tanda netral `—`** dan status kosong yang jujur (`Belum ada data`, `Belum ada percakapan`). |
| **Kepadatan Kartu** | Menjejalkan 8–10 baris field, 4 pill warna-warni, atau tabel geser horizontal di ponsel. | Pertahankan **maksimal 2–3 baris fokus per kartu modular** dengan jarak antar-kartu `12pt/dp`. |
| **Warna Tombol & Aksen** | Menggunakan warna neon atau merah terang untuk tombol aksi utama dan header. | Gunakan **`#1C1917` (*Deep Stone*)** untuk tombol aksi primer; warna merah `#B02524` hanya untuk aksi keluar (*Keluar*) atau elemen destruktif. |

---

## 3. Spesifikasi Dimensi & Token Tata Letak (*Spatial Math*)

| Parameter Tata Letak | Nilai Standar (iOS `pt` / Android `dp`) | Catatan Implementasi |
| :--- | :--- | :--- |
| **Kanvas Latar Belakang** | `#FAFAF9` | Netral hangat agar kartu `#FFFFFF` terlihat kontras dan bersih. |
| **Permukaan & Border Kartu** | `#FFFFFF` · Border `1pt/dp` `#E7E5E4` | Gunakan *border hairline* atau bayangan sangat tipis (khusus kartu Login). |
| **Padding Horizontal Layar** | `16pt/dp` | Konsisten di seluruh 4 layar tab utama. |
| **Jarak Antar-Kartu Modular** | `12pt/dp` | Menciptakan ritme visual yang lapang dan rapi. |
| **Padding Internal Kartu** | `16pt/dp` (`Login`: `28pt/dp`) | Menjaga ruang napas (*whitespace*) tetap terasa lega. |
| **Radius Sudut** | Kartu: `16pt/dp` · Kartu Login: `24pt/dp` · Input/Tombol: `12pt/dp` | Konsistensi bentuk *rounded-rectangle* modern. |
| **Ukuran Target Sentuh** | Tombol Primer & Input: Tinggi `48pt/dp` · Tab Navigasi: Tinggi `64pt/dp` | Nyaman dioperasikan satu tangan oleh karyawan maupun operator. |

---

## 4. Daftar Artefak Referensi di Dalam `pwa/ui-references/`

1. **`assets/`**:
   - `logo.png` & `dm_logo.png`: Aset logo resmi **PJ geometris** yang disalin langsung dari Web ERP.
2. **`mockups/`**:
   - `00_login_minimalist_card_ui.jpg`: Layar **Login** kartu putih minimalis di tengah dengan logo Web ERP, `Username`, `Password`, dan tombol `Masuk`.
   - `01_dashboard_default_empty_ui.jpg`: Layar **Dashboard** (tab default paling kiri) berisi kartu modular kosong netral (`Presensi Hari Ini`, `Kuota Cuti`, `Slip Gaji`, `Aktivitas Terbaru`).
   - `02_messages_empty_modular_ui.jpg`: Layar **Messages** berisi kolom pencarian bersih dan *empty-state card* `Belum ada percakapan`.
   - `03_shopfloor_empty_modular_ui.jpg`: Layar **Shop Floor** berisi kartu modular `Workstation Aktif`, `Target / Hasil`, dan `Antrian Produksi` dalam status kosong netral.
   - `04_profile_hub_empty_modular_ui.jpg`: Layar **Profile / Hub** berisi kartu identitas kosong netral, daftar menu dasar, dan tombol `Keluar`.
3. **`native-components/`**:
   - `ios-swiftui/PavingJossCleanUI.swift`: Implementasi komponen SwiftUI siap pakai untuk seluruh 5 layar (tanpa kode API atau data dummy).
   - `android-compose/PavingJossCleanUI.kt`: Implementasi komponen Jetpack Compose siap pakai untuk seluruh 5 layar (tanpa kode API atau data dummy).
4. **`interactive-preview/index.html`**:
   - Simulator pratinjau interaktif di browser untuk menguji alur **Login → Dashboard (Default) → Messages → Shop Floor → Profile/Hub → Keluar**, lengkap dengan logo asli Web ERP.
