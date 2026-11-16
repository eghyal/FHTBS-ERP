# Panduan Standar Desain UI Mobile Native (iOS SwiftUI & Android Jetpack Compose)
## Filosofi "Clean Industrial Precision & Progressive Disclosure" (Anti-Overinformatif)

Dokumen ini adalah pedoman wajib bagi tim developer **iOS (Swift / SwiftUI)** dan **Android (Kotlin / Jetpack Compose)** dalam mengimplementasikan antarmuka **Paving Joss ERP Mobile**. Tujuan utamanya adalah memastikan aplikasi mobile tampil **elegan, bersih, modern, dan tidak overinformatif**—selaras penuh dengan bahasa desain Web ERP.

---

## 1. Mengapa Aplikasi ERP Mobile Tidak Boleh Overinformatif?

Kesalahan paling umum saat memindahkan ERP desktop ke layar ponsel (`375px–430px`) adalah memaksakan seluruh kolom tabel desktop (8–12 atribut sekaligus) ke dalam satu baris kartu kecil. Akibatnya:
- Teks terpotong (`...`) di mana-mana atau membungkus hingga 6–7 baris per item.
- Terlalu banyak badge warna-warni dalam satu kartu sehingga pengguna gagal mengenali mana status yang benar-benar darurat.
- Tombol *Approve*, *Reject*, *Revise*, *Detail*, dan *Share* dijejalkan di setiap kartu daftar, menyebabkan risiko salah ketuk (*fat-finger error*) di lingkungan pabrik.

### Solusi Utama: Pola **Progressive Disclosure 2-Tahap**
1. **Tahap 1 — Permukaan Daftar Utama (*Scannable in < 2 Seconds*)**:
   - Setiap kartu daftar **hanya boleh memuat maksimal 4 titik data** (*3-Point Card Anatomy*):
     1. **Baris Atas (Metadata)**: Kode dokumen/tiket dalam huruf monospace (`11sp`) di kiri + **maksimal 1 lencana status** di kanan.
     2. **Baris Tengah (Identitas Utama)**: Judul utama tebal (`14sp Bold`, maksimal 1 baris) + 1 subjudul konteks (`12sp`, warna `stone-500`).
     3. **Baris Bawah (Nilai / Indikator)**: 1 nilai metrik utama dalam huruf monospace `tabular-nums` (mis. `Rp 48.500.000`, `3 Hari`, atau `840 / 1.200 Pcs`) di kiri + ikon `ChevronRight` (`>`) atau maksimal 1–2 tombol terfokus di kanan.
2. **Tahap 2 — *Bottom Inspector Sheet* (*Slide-Up Detail & PIN Authorization*)**:
   - Rincian item barang, rincian pajak DPP/PPN/PPh, potongan BPJS/PPh21, riwayat audit, catatan revisi, serta kotak input **6-Digit Daily Authorization PIN** hanya ditampilkan ketika pengguna mengetuk kartu untuk membuka **Bottom Inspector Sheet** (`80%–85%` tinggi layar).

---

## 2. Tabel Komparasi *Do vs Don't* per Komponen

| Komponen UI | ❌ JANGAN LAKUKAN (*Don't — Overinformative & Cluttered*) | ✅ LAKUKAN (*Do — Clean, Elegant & Modern*) |
| :--- | :--- | :--- |
| **Top App Bar & Sticky Bars** | Membuat header bertumpuk (baris judul + baris status server + baris pencarian + baris sub-tab tetap) yang memakan `>30%` layar. | Gunakan **Compact Top App Bar `56pt/dp`** + **Bottom Tab Bar `64pt/dp`**. Total elemen *sticky* **wajib $\le 15\%$ tinggi layar**, menyisakan $\ge 85\%$ untuk konten. |
| **Grid Ringkasan KPI** | Menampilkan 3–4 kolom kartu kecil berjejalan dengan grafik mini, persentase desimal panjang, dan teks penjelasan 3 baris. | Gunakan **Grid `2x2` (2 kolom)** dengan tinggi seragam (`min-h 96pt/dp`), 1 label pendek uppercase (`10sp`), dan 1 angka besar `tabular-nums` (`20sp–24sp Bold`). |
| **Kartu Daftar Dokumen / Cuti / WOT** | Menampilkan 9 field sekaligus (ID, Pembuat, Tanggal Buat, Tanggal Update, Departemen, Pajak, Diskon, Catatan, 3 Badge, 4 Tombol). | Terapkan **3-Point Card Anatomy**: Baris 1 (`Kode Monospace` + `1 Status Badge`), Baris 2 (`Judul 1 Baris` + `Nama Mitra/Subjudul`), Baris 3 (`Nominal/Kuantitas` + `Chevron >`). |
| **Tabel Data (Absensi, PR/PO, Stok)** | Menampilkan tabel horizontal (`HorizontalScrollView`) dengan 8 kolom yang mengharuskan pengguna menggeser kiri-kanan di ponsel. | **Zero Horizontal-Scroll Table Rule**: Ubah seluruh baris tabel menjadi tumpukan vertikal kartu bersih (*Vertical Stack Cards*) dengan jarak antar-kartu `10pt/dp–12pt/dp`. |
| **Lencana Status (*Status Badges*)** | Menumpuk 3–4 pill badge warna-warni (`[URGENT] [PO] [PROJECT-A] [PENDING]`) di satu sudut kartu. | Tampilkan **maksimal 1 badge status semantik** per kartu (`rounded-lg` / `8dp`, font `10sp Mono Bold`). Konteks tipe dokumen cukup ditulis sebagai teks monospace tenang (`PO/2026/018 · PT Sinar Beton`). |
| **Kartu Dokumen ERP di Dalam Chat** | Menampilkan seluruh tabel rincian 15 barang PO langsung di dalam gelembung chat sehingga ruang percakapan tertutup penuh. | Tampilkan **Compact ERP Share Card** berisi Nomor Dokumen, Nama Vendor/Klien, Status, Total Rupiah (`tabular-nums`), dan 2 tombol bersih: **`Preview`** (buka modal penuh) & **`Authorize`** (buka sheet PIN). |
| **Otorisasi Dokumen (PIN 6-Digit)** | Menampilkan input PIN di setiap kartu pada daftar halaman utama atau menggunakan `window.alert` / dialog kuno. | Tempatkan kotak **6-Digit Daily Authorization PIN** secara eksklusif di bagian bawah **Bottom Inspector Sheet** dengan fitur *View Today's PIN* & *One-Tap Fill*. |
| **Penggunaan Warna Merah** | Menggunakan warna merah terang untuk tombol aksi utama, header aplikasi, atau dekorasi latar belakang. | Gunakan **Stone-900 (`#1C1917`)** untuk seluruh tombol aksi utama (*Primary CTA*). Warna merah (`#B02524` / `#EF4444`) **hanya** untuk Kop Surat resmi dan aksi destruktif/darurat (*Reject / NDP Down*). |

---

## 3. Spesifikasi Dimensi, Spacing & Ergonomi Sentuh (*Spatial Math*)

| Parameter Tata Letak | Nilai Standar (iOS `pt` / Android `dp`) | Catatan Implementasi Native |
| :--- | :--- | :--- |
| **Padding Horizontal Layar** | `14pt/dp` – `16pt/dp` | Memberikan ruang tepi yang konsisten tanpa membuang lebar layar `375px`. |
| **Jarak Vertikal Antar-Bagian** | `16pt/dp` (`space-y-4`) | Memisahkan Hero Card, Grid KPI `2x2`, dan Daftar Kartu secara jelas. |
| **Jarak Antar-Kartu Daftar** | `10pt/dp` (`space-y-2.5`) | Cukup rapat untuk dipindai cepat, cukup renggang agar tidak menyatu. |
| **Padding Internal Kartu** | `14pt/dp` – `16pt/dp` (`p-3.5` / `p-4`) | Menjamin ruang napas (*whitespace*) minimal 25% di dalam permukaan kartu. |
| **Radius Sudut Kartu & Sheet** | Kartu: `16pt/dp` (`rounded-2xl`)<br>Hero / Bottom Sheet: `24pt/dp` (`rounded-3xl`)<br>Tombol / Input: `12pt/dp` (`rounded-xl`) | Mematuhi **Zero-Pill Discipline** untuk tombol aksi dan input formulir. |
| **Ketebalan Garis Tepi (*Border*)** | `1pt/dp` Solid | Tema ERP Stone: `#E7E5E4` (`stone-200`)<br>Tema HRIS Alabaster: `#E2E3EA` |
| **Ukuran Target Sentuh Minimum** | Tombol Ikon / Baris: `44 x 44pt/dp`<br>Tombol CTA Utama: Tinggi `48pt/dp` | Mencegah salah sentuh saat digunakan satu tangan oleh operator di lapangan. |

---

## 4. Perbandingan Visual: Tampilan Overinformatif (❌ Salah) vs Tampilan Clean ERP (✅ Benar)

```
❌ SALAH (OVERINFORMATIF, PADAT & BERANTAKAN):
┌─────────────────────────────────────────────────────────┐
│ [PO] [URGENT] [PROJECT-A1] [WAITING_APPROVAL] [IDR]     │
│ Nomor: PO/2026/04/018 | Tgl: 2026-11-15 08:14:22 WIB    │
│ Dibuat oleh: staf.purchasing@pavingjoss.co.id (Staff)   │
│ Vendor: PT Sinar Beton Perkasa Indonesia (NPWP: 01.2..) │
│ Item: 1. Semen Curah (50 Ton), 2. Pasir Silika (30 Ton) │
│ DPP: Rp 43.693.693 | PPN 11%: Rp 4.806.307 | PPh: Rp... │
│ Total: Rp 48.500.000,00 | Status Gudang: BELUM GRN      │
│ [Input PIN: ______] [Approve] [Revise] [Reject] [PDF]   │
└─────────────────────────────────────────────────────────┘

✅ BENAR (CLEAN, ELEGAN & PROGRESSIVE DISCLOSURE):
┌─────────────────────────────────────────────────────────┐
│ PO/2026/018 · Proyek A1                       [PENDING] │
│ PT Sinar Beton Perkasa                                  │
│ 2 Item Material · Semen Curah & Pasir Silika            │
│                                                         │
│ Rp 48.500.000                            Ketuk Detail > │
└─────────────────────────────────────────────────────────┘
  └─► Saat diketuk, barulah membuka Bottom Inspector Sheet
      yang menampilkan rincian item, pajak DPP/PPN, dan
      kotak otorisasi 6-Digit Daily PIN yang rapi.
```

---

## 5. Daftar Artefak di Dalam Direktori `pwa/ui-references/`

1. **`mockups/`**:
   - `01_hr_portal_ess_clean_ui.jpg`: Mockup visual layar **HR Portal & ESS** dengan tema *Airy Frosted Glass Alabaster* (`#F7F7F9`), jam live Jakarta `tabular-nums`, tombol tunggal Clock-Out, grid `2x2` kuota cuti, dan kartu riwayat 3-lapis.
   - `02_messages_erp_auth_card_ui.jpg`: Mockup visual layar **Messages** dengan tema *Warm Monochrome Stone* (`#FAFAF9`), kartu dokumen PO interaktif di dalam chat, dan *Bottom Sheet* **6-Digit Daily Authorization PIN**.
   - `03_shopfloor_2way_workstation_ui.jpg`: Mockup visual layar **Shop Floor 2-Way Workstation** untuk operator produksi (kartu mesin aktif `#1C1917`, grid `2x2` Target vs Good Output, dan kartu Work Order Ticket bersih).
   - `04_backoffice_exec_action_hub_ui.jpg`: Mockup visual layar **Back-Office Executive Action Hub** (kartu sapaan role, grid `2x2` KPI bisnis, pill kategori, dan daftar persetujuan 3-lapis).
2. **`native-components/ios-swiftui/PavingJossCleanUI.swift`**:
   - Kode komponen **SwiftUI** siap pakai untuk `PavingJossTopBar`, `PavingJossBottomBar`, `CleanMetricGrid2x2`, `CleanThreePointCard`, `EssAttendanceHeroCard`, `ChatErpDocumentCard`, dan `ProgressiveInspectorSheet`.
3. **`native-components/android-compose/PavingJossCleanUI.kt`**:
   - Kode komponen **Jetpack Compose** siap pakai yang mengimplementasikan seluruh komponen di atas dengan presisi `dp`/`sp` dan `tabular-nums` (`tnum`).
4. **`interactive-preview/index.html`**:
   - Simulator interaktif mandiri yang dapat langsung dibuka di browser untuk menguji perpindahan 4 layar utama, saklar perbandingan **Mode Clean (✅ Standar ERP) vs Mode Overinformatif (❌ Contoh Salah)**, serta interaksi *Bottom Inspector Sheet* dengan PIN Harian 6-digit.
