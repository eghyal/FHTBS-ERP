# Rencana Perbaikan Studio Dokumen: Alignment Canvas Center Line, Pembersihan Bold Asterisks, & Auto-Height Container Resize

Rencana implementasi ini mengatasi 3 masalah spesifik yang dilaporkan pengguna pada **Document Workshop Studio (CanvaStudioEditor)**.

---

## Keputusan Pengguna & Hasil Klarifikasi

> [!IMPORTANT]
> Hasil keputusan yang telah dikonfirmasi pengguna:

1. **Garis Pandu Center Canvas**: Tampilkan garis bantu tegak lurus tegas (*Center Line*) ketika titik tengah blok (*Center X / Center Y*) tepat presisi sejajar dengan titik tengah kertas/kanvas.
2. **Pembersihan Simbol Bold Asterisks (`**`)**: Hapus semua karakter `**` dari isi teks/paragraf. Bolding dilakukan sepenuhnya melalui properti CSS `isBold` / `font-bold` tanpa menyisipkan karakter `**` ke dalam string teks.
3. **Perbaikan Resize Container Terpotong**: Mengubah perilaku `InlineTextarea` dan area teks di dalam blok agar fleksibel mengisi `100%` tinggi container yang di-resize tanpa terpotong (*no vertical text clipping*).

---

## 1. Rincian Perbaikan

### A. Alignment Guide Lines (Center Canvas Snap)
- **Logika Snap**: Saat pengguna menyeret (*drag*) blok dengan kursor atau tombol *Geser*:
  - **Sumbu Horizontal (X)**: Hitung `candidateCenterX = naturalLeft + newX + blockW / 2`. Jika selisihnya `Math.abs(candidateCenterX - sheetCenterX) <= 8px`, kunci `newX` tepat di tengah kanvas (`sheetCenterX`) dan tampilkan **Garis Pandu Merah/Biru Vertikal** melintasi tinggi kertas dari atas ke bawah.
  - **Sumbu Vertikal (Y)**: Hitung `candidateCenterY = naturalTop + newY + blockH / 2`. Jika selisihnya `Math.abs(candidateCenterY - sheetCenterY) <= 8px`, kunci `newY` tepat di tengah kanvas (`sheetCenterY`) dan tampilkan **Garis Pandu Merah/Biru Horizontal** melintasi lebar kertas dari kiri ke kanan.
- **Tampilan Visual**: Garis tegas `bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]` dengan badge label `Rata Tengah Kertas (X: 400px)` & `Rata Tengah Kertas (Y: 565px)`.

### B. Bolding Tanpa Karakter Asterisks (`**`)
- **Pembersihan Otomatis (Sanitization)**: Tambahkan fungsi pembersih `stripBoldAsterisks(text)` pada state loader & handler edit untuk menghapus simbol `**` yang terlanjur tersimpan di konten.
- **Fix Floating Toolbar**: Pada `FloatingTextToolbar`, ubah tombol **Bold** agar tidak lagi memanggil `onWrapText("**", "**")`, melainkan secara langsung mengubah status `isBold` pada `DocBlock`.
- **Styling Input**: `InlineInput` dan `InlineTextarea` akan merender `fontWeight: block.isBold ? 700 : undefined` / class `font-bold` sehingga teks tampak tebal secara visual tanpa ada karakter asterisks.

### C. Perbaikan Text Container Resize (No Text Clipping)
- **Penyesuaian InlineTextarea**: Set `h-full min-h-full flex-1` pada `InlineTextarea` ketika `block.height` diatur oleh pengguna.
- **Auto Auto-Height Adjust**: Mencegah properti `overflow: hidden` atau `rows={1}` memotong baris teks di bagian bawah container. Teks akan mengisi ruang container secara proporsional.

---

## 2. Diagram Arsitektur Interaksi

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CanvaStudioEditor Canvas                           │
│                                                                             │
│  Sheet Center X (400px)                    Sheet Center Y (565px)           │
│         │                                         │                         │
│  ───────┼─────────────────────────────────────────┼─────── Guide Lines     │
│         │  ┌───────────────────────────────────┐  │                         │
│         │  │ Block Wrapper (Resized Container) │  │                         │
│         └──┼───► Clean Bold Text (No **)       │──┼───                      │
│            │     InlineTextarea (100% Height)  │                            │
│            └───────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Langkah-Langkah Implementasi

1. **Sanitasi String & Pembersihan Asterisks (`CanvaStudioEditor.tsx`)**:
   - Buat helper `cleanBoldMarkdown(str: string): string` yang menghapus karakter `**` pada awal/akhir teks.
   - Perbarui state loader dan event handler `onWrapText` agar tidak menyisipkan `**`.

2. **Perbaikan Snap Center Guide Line (`CanvaStudioEditor.tsx`)**:
   - Perbaiki perhitungan `sheetCenterX` dan `sheetCenterY` pada `handleMouseMove` saat dragging.
   - Tampilkan garis pandu vertikal dan horizontal dengan warna kontras kontemporer (`rose-500` / `blue-500`) dan badge koordinat.

3. **Perbaikan Container Height pada InlineTextarea (`CanvaStudioEditor.tsx`)**:
   - Sesuaikan `InlineTextarea` agar mengambil tinggi container `h-full flex-1` jika `block.height` atau `minHeight` diatur.
   - Hapus pembatas overflow yang memotong bagian bawah teks.

4. **Verifikasi & Pengujian Build**:
   - Jalankan `compile_applet` dan `lint_applet` untuk memastikan tidak ada eror syntax/TypeScript.
