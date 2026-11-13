export interface PublicStatItem {
  value: string;
  label: string;
}

export interface PublicExpertItem {
  id: string;
  initial: string;
  name: string;
  handle: string;
  role: string;
  bio: string;
}

export interface PublicPortfolioItem {
  id: string;
  project_name: string;
  client_name: string;
  location: string;
  supply_volume: string;
  product_used: string;
  year: string;
  image_url: string;
  testimonial_quote: string;
  testimonial_author: string;
}

export interface PublicCmsConfig {
  // Visibility & Top Announcement Marquee
  announcement_enabled: boolean;
  announcement_text: string;
  announcement_ascii_style: "industrial" | "blueprint" | "festive";
  announcement_speed: "slow" | "normal" | "fast";
  announcement_cta_label: string;
  announcement_cta_link: string;
  show_stats: boolean;
  show_about: boolean;
  show_experts: boolean;
  show_capabilities: boolean;
  show_portfolio: boolean;
  show_cta_banner: boolean;

  // Annual Event & Ornament Scene Theme
  event_enabled: boolean;
  event_name: string;
  event_start_date: string;
  event_end_date: string;
  event_ornament_url: string;
  event_ornament_height: number;
  event_ornament_fit: "cover" | "contain" | "repeat-x";
  event_ornament_pos_x?: number;
  event_ornament_pos_y?: number;
  event_scene_auto_theme: boolean;
  event_primary_color: string;
  event_secondary_color: string;
  event_surface_tint: string;
  event_badge_text_color: string;

  // Hero Section
  hero_badge: string;
  hero_title_line1: string;
  hero_title_highlight: string;
  hero_subtitle: string;
  hero_primary_cta: string;
  hero_secondary_cta: string;
  stats: PublicStatItem[];

  // About & Experts Section
  about_title: string;
  about_description: string;
  experts_section_title: string;
  experts_section_subtitle: string;
  experts: PublicExpertItem[];

  // Capabilities Gallery Section
  capabilities_badge: string;
  capabilities_title: string;
  capabilities_title_highlight: string;
  capabilities_subtitle: string;

  // B2B Project Portfolio & Client Testimonials
  portfolio_section_badge: string;
  portfolio_section_title: string;
  portfolio_section_subtitle: string;
  portfolio_items: PublicPortfolioItem[];

  // Contact, Address, WhatsApp, CTA & Footer
  company_name: string;
  address_headline: string;
  address_full: string;
  maps_url: string;
  phone_display: string;
  whatsapp_number: string;
  email: string;
  cta_banner_title: string;
  cta_banner_subtitle: string;
  cta_banner_button: string;
  footer_copyright: string;
}

export interface ShopBundleItem {
  id: string;
  name: string;
  target_use: string;
  items_summary: string;
  area_coverage: string;
  bundle_price: number;
  saving_badge: string;
  default_qty: number;
}

export interface ShopFleetItem {
  id: string;
  name: string;
  capacity: string;
  road_access: string;
  notes: string;
}

export interface ShopQualityItem {
  id: string;
  title: string;
  description: string;
}

export interface ShopFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface ShopCmsConfig {
  // Top Announcement & Header
  announcement_enabled: boolean;
  announcement_badge: string;
  announcement_text: string;
  header_title: string;
  header_subtitle: string;
  trust_badge_1: string;
  trust_badge_2: string;

  // Campaign Promo Banner
  promo_banner_enabled: boolean;
  promo_badge: string;
  promo_title: string;
  promo_subtitle: string;
  promo_cta_text: string;
  promo_theme: "crimson" | "dark" | "emerald";

  // Project Bundling & Featured Merchandising
  show_bundles: boolean;
  bundles_section_title: string;
  bundles_section_subtitle: string;
  bundles: ShopBundleItem[];

  // Delivery Fleet Guide, Quality Guarantees & FAQ
  show_info_sections: boolean;
  fleet_section_title: string;
  fleet_section_subtitle: string;
  fleets: ShopFleetItem[];
  quality_guarantees: ShopQualityItem[];
  faqs: ShopFaqItem[];
}

export interface AnnualEventPreset {
  id: string;
  label: string;
  event_name: string;
  description: string;
  primary_color: string;
  secondary_color: string;
  surface_tint: string;
  badge_text_color: string;
  ascii_style: "industrial" | "blueprint" | "festive";
  ornament_svg_data_url: string;
}

function buildOrnamentSvgDataUrl(params: {
  bgStart: string;
  bgEnd: string;
  accent: string;
  gold: string;
  title: string;
  subtitle: string;
  patternType: "islamic" | "independence" | "newyear" | "anniversary";
}): string {
  const { bgStart, bgEnd, accent, gold, title, subtitle, patternType } = params;

  const patternMarkup =
    patternType === "islamic"
      ? `<g stroke="${gold}" stroke-opacity="0.32" stroke-width="1.5" fill="none">
          <polygon points="90,15 110,35 90,55 70,35" />
          <polygon points="90,65 110,85 90,105 70,85" />
          <polygon points="180,25 205,60 180,95 155,60" />
          <circle cx="280" cy="60" r="34" />
          <circle cx="280" cy="60" r="22" stroke-dasharray="4 4" />
          <polygon points="1640,25 1665,60 1640,95 1615,60" />
          <circle cx="1740" cy="60" r="34" />
          <circle cx="1740" cy="60" r="22" stroke-dasharray="4 4" />
          <polygon points="1830,15 1850,35 1830,55 1810,35" />
          <polygon points="1830,65 1850,85 1830,105 1810,85" />
        </g>`
      : patternType === "independence"
        ? `<g fill="${gold}" fill-opacity="0.28">
            <polygon points="60,0 130,0 90,120 20,120" fill="#ffffff" fill-opacity="0.18" />
            <polygon points="150,0 190,0 150,120 110,120" fill="${gold}" fill-opacity="0.28" />
            <polygon points="1730,0 1770,0 1810,120 1770,120" fill="${gold}" fill-opacity="0.28" />
            <polygon points="1790,0 1860,0 1900,120 1830,120" fill="#ffffff" fill-opacity="0.18" />
            <circle cx="260" cy="60" r="28" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" fill="none" />
            <circle cx="1660" cy="60" r="28" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" fill="none" />
          </g>`
        : patternType === "newyear"
          ? `<g stroke="${gold}" stroke-opacity="0.38" stroke-width="1.5" fill="none">
              <line x1="120" y1="20" x2="120" y2="100" />
              <line x1="80" y1="60" x2="160" y2="60" />
              <line x1="92" y1="32" x2="148" y2="88" />
              <line x1="148" y1="32" x2="92" y2="88" />
              <circle cx="250" cy="60" r="26" />
              <circle cx="1670" cy="60" r="26" />
              <line x1="1800" y1="20" x2="1800" y2="100" />
              <line x1="1760" y1="60" x2="1840" y2="60" />
              <line x1="1772" y1="32" x2="1828" y2="88" />
              <line x1="1828" y1="32" x2="1772" y2="88" />
            </g>`
          : `<g stroke="${gold}" stroke-opacity="0.35" stroke-width="2" fill="none">
              <rect x="70" y="22" width="76" height="76" rx="12" />
              <rect x="170" y="34" width="52" height="52" rx="8" />
              <rect x="1698" y="34" width="52" height="52" rx="8" />
              <rect x="1774" y="22" width="76" height="76" rx="12" />
            </g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 120" width="1920" height="120">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${bgStart}" />
        <stop offset="50%" stop-color="${accent}" />
        <stop offset="100%" stop-color="${bgEnd}" />
      </linearGradient>
    </defs>
    <rect width="1920" height="120" fill="url(#bg)" />
    <line x1="0" y1="4" x2="1920" y2="4" stroke="${gold}" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="12 6" />
    <line x1="0" y1="116" x2="1920" y2="116" stroke="${gold}" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="12 6" />
    ${patternMarkup}
    <text x="960" y="54" text-anchor="middle" fill="#ffffff" font-family="Plus Jakarta Sans, sans-serif" font-weight="800" font-size="26" letter-spacing="2">${title}</text>
    <text x="960" y="86" text-anchor="middle" fill="${gold}" font-family="Plus Jakarta Sans, monospace" font-weight="700" font-size="15" letter-spacing="3">${subtitle}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const ANNUAL_EVENT_PRESETS: AnnualEventPreset[] = [
  {
    id: "ramadhan_eid",
    label: "Ramadhan & Eid Al-Fitr Theme",
    event_name: "Semarak Suci Ramadhan & Idul Fitri",
    description: "Emerald green & warm gold architectural ornament scene",
    primary_color: "#047857",
    secondary_color: "#b45309",
    surface_tint: "#ecfdf5",
    badge_text_color: "#065f46",
    ascii_style: "festive",
    ornament_svg_data_url: buildOrnamentSvgDataUrl({
      bgStart: "#064e3b",
      accent: "#047857",
      bgEnd: "#065f46",
      gold: "#fde68a",
      title: "✦ MARHABAN YA RAMADHAN & SELAMAT HARI RAYA IDUL FITRI ✦",
      subtitle: "[ PAVING JOSS · CV. BATU EMAS GROUP · OPERASIONAL & PENGIRIMAN TERJADWAL ]",
      patternType: "islamic",
    }),
  },
  {
    id: "hut_ri",
    label: "Indonesia Independence Day (17 Aug)",
    event_name: "Dirgahayu Kemerdekaan Republik Indonesia",
    description: "Patriotic sovereign crimson & gold heritage scene",
    primary_color: "#be123c",
    secondary_color: "#d97706",
    surface_tint: "#fff1f2",
    badge_text_color: "#9f1239",
    ascii_style: "festive",
    ornament_svg_data_url: buildOrnamentSvgDataUrl({
      bgStart: "#881337",
      accent: "#be123c",
      bgEnd: "#9f1239",
      gold: "#fef08a",
      title: "★ DIRGAHAYU KEMERDEKAAN REPUBLIK INDONESIA · 17 AGUSTUS ★",
      subtitle: "// MEMBANGUN INFRASTRUKTUR NUSANTARA BERSTANDAR SNI //",
      patternType: "independence",
    }),
  },
  {
    id: "new_year",
    label: "Year-End & New Year Infrastructure",
    event_name: "Apresiasi Akhir Tahun & Tahun Baru",
    description: "Royal navy & amber gold precision industrial scene",
    primary_color: "#1d4ed8",
    secondary_color: "#0284c7",
    surface_tint: "#eff6ff",
    badge_text_color: "#1e40af",
    ascii_style: "blueprint",
    ornament_svg_data_url: buildOrnamentSvgDataUrl({
      bgStart: "#0f172a",
      accent: "#1d4ed8",
      bgEnd: "#1e3a8a",
      gold: "#bae6fd",
      title: "✦ SELAMAT TAHUN BARU & APRESIASI MITRA PROYEK KONSTRUKSI ✦",
      subtitle: "[::] KUOTA KONTRAK INFRASTRUKTUR AWAL TAHUN TELAH DIBUKA [::]",
      patternType: "newyear",
    }),
  },
  {
    id: "company_anniversary",
    label: "CV. Batu Emas Anniversary",
    event_name: "HUT CV. Batu Emas Group — Paving Joss",
    description: "Golden bronze & warm terracotta milestone scene",
    primary_color: "#b45309",
    secondary_color: "#92400e",
    surface_tint: "#fffbeb",
    badge_text_color: "#78350f",
    ascii_style: "industrial",
    ornament_svg_data_url: buildOrnamentSvgDataUrl({
      bgStart: "#451a03",
      accent: "#b45309",
      bgEnd: "#78350f",
      gold: "#fde68a",
      title: "★ ANNIVERSARY CV. BATU EMAS GROUP · DEDIKASI MUTU BETON SNI ★",
      subtitle: "───► TERIMA KASIH ATAS KEPERCAYAAN RIBUAN MITRA KONTRAKTOR & PROYEK ◄───",
      patternType: "anniversary",
    }),
  },
];

export const DEFAULT_PUBLIC_CMS: PublicCmsConfig = {
  announcement_enabled: true,
  announcement_text:
    "Layanan Suplai Proyek & Kontrak B2B: Kapasitas Cetak 10.000 m²/Hari · Pengiriman Armada Mandiri Se-Jawa Timur · Standar Mutu Beton K-300 s/d K-500 Teruji Lab SNI",
  announcement_ascii_style: "industrial",
  announcement_speed: "normal",
  announcement_cta_label: "Konsultasi Sales Proyek",
  announcement_cta_link: "https://wa.me/6281111113993",
  show_stats: true,
  show_about: true,
  show_experts: true,
  show_capabilities: true,
  show_portfolio: true,
  show_cta_banner: true,

  // Annual Event & Ornament Scene Theme Defaults
  event_enabled: false,
  event_name: "Semarak Suci Ramadhan & Idul Fitri",
  event_start_date: "",
  event_end_date: "",
  event_ornament_url: "",
  event_ornament_height: 84,
  event_ornament_fit: "cover",
  event_ornament_pos_x: 50,
  event_ornament_pos_y: 50,
  event_scene_auto_theme: true,
  event_primary_color: "#047857",
  event_secondary_color: "#b45309",
  event_surface_tint: "#ecfdf5",
  event_badge_text_color: "#065f46",

  hero_badge: "Manufaktur Paving Blok & Material",
  hero_title_line1: "Spesialis",
  hero_title_highlight: "Jangka Panjang.",
  hero_subtitle:
    "Kami bukan sekadar pabrik paving. CV Batu Emas Group memadukan teknologi cetak presisi dan mutu K300 untuk infrastruktur yang bertahan lintas generasi.",
  hero_primary_cta: "Pesan Sekarang",
  hero_secondary_cta: "Lihat Katalog",
  stats: [
    { value: "K-300 s.d. K-500", label: "Mutu Beton SNI" },
    { value: "10.000 m²", label: "Kapasitas / Hari" },
    { value: "Mutu SNI", label: "Standar Pabrikasi" },
  ],

  about_title: "Tentang Kami",
  about_description:
    "Berlokasi strategis di Dusun Petahunan, Gambiran, Banyuwangi, CV. Batu Emas Group telah menjadi tulang punggung penyediaan material konstruksi untuk proyek skala kecil hingga besar di wilayah Jawa Timur dan sekitarnya.",
  experts_section_title: "Keahlian & Kepercayaan",
  experts_section_subtitle:
    "Kualitas material berawal dari tangan-tangan ahli yang berdedikasi. Kami menghadirkan spesialis terbaik yang menjamin kontrol mutu dan konsistensi di setiap tahap produk yang kami ciptakan untuk Anda.",
  experts: [
    {
      id: "EXP-1",
      initial: "L",
      name: "Bachtiar Ludy",
      handle: "@Ludy",
      role: "Spesialis Produk & Kontrol Mutu",
      bio: "Saya adalah penjaga standar mutu sejati yang memastikan tidak ada kompromi pada kualitas akhir produk. Mata telanjang saya memiliki ketajaman analitis yang tak tergantikan dalam mengeleminasi mikrocacat yang tidak terlihat. Fokus obsesif saya terhadap konsistensi mutu standar SNI & K300 menjadikan kualitas material kami sebagai pilihan paling terpercaya untuk para pengembang serta arsitek berstandar tinggi.",
    },
    {
      id: "EXP-2",
      initial: "E",
      name: "Eghy Al Vandi",
      handle: "@Eghy",
      role: "Spesialis Mesin & Rekayasa Fabrikasi",
      bio: "Dengan keahlian mendalam dalam konfigurasi dan kalibrasi sistem manufaktur berteknologi tinggi, saya memberikan garansi zero-defect pada proses awal rekayasa fabrikasi kami. Integritas teknis yang saya miliki memastikan bahwa setiap balok beton dan paving dicetak dengan presisi mesin terakurat, mendefinisikan ulang reliabilitas infrastruktur jangka panjang yang bisa selalu Anda andalkan dalam setiap pesanan berat.",
    },
  ],

  capabilities_badge: "Galeri Fasilitas & Portofolio",
  capabilities_title: "Kapabilitas",
  capabilities_title_highlight: "Manufaktur.",
  capabilities_subtitle:
    "Dokumentasi teknologi cetak hidrolik presisi, mesin fabrikasi baja, dan armada pengiriman mandiri CV Batu Emas Group yang selaras dengan layanan made-to-order kami.",

  portfolio_section_badge: "Rekam Jejak Infrastruktur & B2B",
  portfolio_section_title: "Portofolio Proyek & Produk Terpublikasi",
  portfolio_section_subtitle:
    "Daftar proyek manufaktur yang telah diselesaikan beserta riwayat suplai material dari sistem ERP dan Toko Pabrik.",
  portfolio_items: [],

  company_name: "Paving Joss - CV. Batu Emas Group",
  address_headline: "Berpusat di Banyuwangi",
  address_full: "Dusun Petahunan, Gambiran, Jawa Timur 68486",
  maps_url:
    "https://www.google.com/maps/place/PAVING+JOSS/@-8.4492075,114.1783708,1559m/data=!3m2!1e3!4b1!4m6!3m5!1s0x2dd3ff56bde07a6b:0xe5fd54602e96e050!8m2!3d-8.4492128!4d114.1832417!16s%2Fg%2F11h2kbpp_r",
  phone_display: "0811-1111-3993",
  whatsapp_number: "6281111113993",
  email: "pavingjoss@gmail.com",
  cta_banner_title: "Siap Membangun Bersama Kami?",
  cta_banner_subtitle:
    "Konsultasikan kebutuhan material proyek Anda, dan dapatkan penawaran terbaik langsung dari pabrik.",
  cta_banner_button: "Hubungi via WhatsApp",
  footer_copyright: "Paving Joss - CV. Batu Emas Group",
};

export const DEFAULT_SHOP_CMS: ShopCmsConfig = {
  announcement_enabled: true,
  announcement_badge: "INFO PABRIK",
  announcement_text:
    "Harga Resmi Pabrik · Dukungan Dokumen Uji Lab SNI & Penjadwalan Pengiriman Proyek Bertahap",
  header_title: "Katalog & Toko Resmi",
  header_subtitle: "Material beton presisi dan fabrikasi langsung dari pabrik.",
  trust_badge_1: "Standar SNI Teruji",
  trust_badge_2: "Armada Mandiri",

  promo_banner_enabled: true,
  promo_badge: "PROGRAM KONTRAK & VOLUME PROYEK",
  promo_title: "Suplai Paving Block, Kanstin & U-Ditch Langsung dari Pabrik",
  promo_subtitle:
    "Dapatkan harga khusus kontrak proyek untuk pemesanan di atas 500 m² dengan jaminan ketersediaan kuota mesin cetak hidrolik dan pengiriman terjadwal.",
  promo_cta_text: "Ajukan Penawaran Proyek (RFQ)",
  promo_theme: "crimson",

  show_bundles: true,
  bundles_section_title: "Paket Bundling Proyek Pilihan",
  bundles_section_subtitle:
    "Rekomendasi kombinasi paket material siap pakai untuk jalan lingkungan perumahan, area parkir ruko, hingga kawasan logistik alat berat.",
  bundles: [
    {
      id: "BND-01",
      name: "Paket Jalan Lingkungan Perumahan",
      target_use: "Perumahan, Cluster & Jalan Desa",
      items_summary: "Paving Bata 6cm K-300 (100 m²) + Kanstin Taman (50 Pcs)",
      area_coverage: "Estimasi Luas 100 m²",
      bundle_price: 11250000,
      saving_badge: "Hemat 8%",
      default_qty: 100,
    },
    {
      id: "BND-02",
      name: "Paket Area Parkir Ruko & Komersial",
      target_use: "Area Parkir, Halaman Kantor & Komersial",
      items_summary:
        "Paving Segienam 8cm K-350 (250 m²) + Kanstin Trotoar PU (100 Pcs)",
      area_coverage: "Estimasi Luas 250 m²",
      bundle_price: 34500000,
      saving_badge: "Hemat 10%",
      default_qty: 250,
    },
    {
      id: "BND-03",
      name: "Paket Kawasan Industri & Alat Berat",
      target_use: "Gudang Logistik, Pelabuhan & Akses Kontainer",
      items_summary:
        "Paving Cacing/Uni 8cm K-400 (500 m²) + U-Ditch 30x30 (40 Batang)",
      area_coverage: "Estimasi Luas 500 m²",
      bundle_price: 82000000,
      saving_badge: "Prioritas SPK",
      default_qty: 500,
    },
  ],

  show_info_sections: true,
  fleet_section_title: "Panduan Kapasitas Armada & Pengiriman Pabrik",
  fleet_section_subtitle:
    "Acuan kapasitas muatan per ritase pengiriman langsung dari pabrik CV Batu Emas Group menuju titik bongkar proyek Anda.",
  fleets: [
    {
      id: "FLT-01",
      name: "Armada Pickup / L300",
      capacity: "15 – 20 m² (±1,5 Ton)",
      road_access: "Lebar Jalan Min. 3 Meter",
      notes: "Cocok untuk renovasi halaman rumah & akses gang sempit.",
    },
    {
      id: "FLT-02",
      name: "Truk Colt Diesel Engkel (CDE)",
      capacity: "35 – 45 m² (±4 Ton)",
      road_access: "Lebar Jalan Min. 4 Meter",
      notes: "Ideal untuk jalan lingkungan cluster perumahan & kavling.",
    },
    {
      id: "FLT-03",
      name: "Truk Colt Diesel Double (CDD)",
      capacity: "65 – 80 m² (±7,5 Ton)",
      road_access: "Lebar Jalan Min. 5 Meter",
      notes: "Armada standar pengiriman proyek menengah & jalan desa.",
    },
    {
      id: "FLT-04",
      name: "Truk Fuso / Tronton Proyek",
      capacity: "120 – 220 m² (12 – 22 Ton)",
      road_access: "Jalan Raya Utama / Kawasan Industri",
      notes: "Efisiensi ongkir terbaik untuk suplai kontrak B2B volume besar.",
    },
  ],
  quality_guarantees: [
    {
      id: "QLT-01",
      title: "Sertifikasi Uji Tekan Laboratorium SNI",
      description:
        "Setiap batch produksi melewati pengujian kuat tekan berkala (K-300 s/d K-500) dengan toleransi dimensi cetak hidrolik presisi.",
    },
    {
      id: "QLT-02",
      title: "Jaminan Penggantian Rusak Pengiriman",
      description:
        "Garansi penggantian unit apabila terdapat material pecah melebihi batas toleransi wajar saat proses pengiriman armada pabrik.",
    },
    {
      id: "QLT-03",
      title: "Dokumen Pajak & Kontrak B2B Lengkap",
      description:
        "Mendukung penerbitan Faktur Pajak PPN (DPP Nilai Lain), Invoice DP/Termin, Berita Acara Serah Terima (BAST), dan Surat Jalan resmi.",
    },
  ],
  faqs: [
    {
      id: "FAQ-01",
      question: "Berapa batas minimum pemesanan (MOQ) di Toko Pabrik?",
      answer:
        "Untuk produk Ready Stock dapat dipesan mulai dari 15 m² (1 ritase Pickup), sedangkan produk Make-to-Order (MTO) mengikuti MOQ produksi yang tertera pada masing-masing katalog produk.",
    },
    {
      id: "FAQ-02",
      question: "Bagaimana prosedur pemesanan volume proyek (B2B) atau spesifikasi khusus?",
      answer:
        "Anda dapat menekan tombol 'Ajukan RFQ Proyek' atau memilih Paket Bundling Proyek. Tim Sales Engineer kami akan menyusun Quotation resmi beserta jadwal cetak SPK pabrik.",
    },
    {
      id: "FAQ-03",
      question: "Apakah harga di katalog sudah termasuk ongkos kirim dan bongkar muat?",
      answer:
        "Harga katalog adalah harga Franco Pabrik (Ex-Factory). Estimasi ongkos kirim dihitung transparan berdasarkan jarak kecamatan/kabupaten dan jenis armada truk pada saat checkout atau penawaran resmi.",
    },
    {
      id: "FAQ-04",
      question: "Apakah tersedia sampel fisik dan sertifikat hasil uji laboratorium?",
      answer:
        "Ya, kami menyediakan sampel fisik paving block/kanstin serta salinan dokumen hasil uji kuat tekan laboratorium untuk keperluan approval konsultan pengawas maupun owner proyek.",
    },
  ],
};

export function mergePublicCms(raw?: Partial<PublicCmsConfig> | null): PublicCmsConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_PUBLIC_CMS;
  return {
    ...DEFAULT_PUBLIC_CMS,
    ...raw,
    stats:
      Array.isArray(raw.stats) && raw.stats.length > 0
        ? raw.stats
        : DEFAULT_PUBLIC_CMS.stats,
    experts:
      Array.isArray(raw.experts) && raw.experts.length > 0
        ? raw.experts
        : DEFAULT_PUBLIC_CMS.experts,
    portfolio_items:
      Array.isArray(raw.portfolio_items)
        ? raw.portfolio_items.filter(
            (item) => item && !["PRJ-01", "PRJ-02", "PRJ-03"].includes(String(item.id)),
          )
        : [],
    event_ornament_pos_x:
      typeof raw.event_ornament_pos_x === "number" && !isNaN(raw.event_ornament_pos_x)
        ? Math.max(0, Math.min(100, Math.round(raw.event_ornament_pos_x)))
        : 50,
    event_ornament_pos_y:
      typeof raw.event_ornament_pos_y === "number" && !isNaN(raw.event_ornament_pos_y)
        ? Math.max(0, Math.min(100, Math.round(raw.event_ornament_pos_y)))
        : 50,
  };
}

export function mergeShopCms(raw?: Partial<ShopCmsConfig> | null): ShopCmsConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_SHOP_CMS;
  return {
    ...DEFAULT_SHOP_CMS,
    ...raw,
    bundles:
      Array.isArray(raw.bundles)
        ? raw.bundles
        : DEFAULT_SHOP_CMS.bundles,
    fleets:
      Array.isArray(raw.fleets) && raw.fleets.length > 0
        ? raw.fleets
        : DEFAULT_SHOP_CMS.fleets,
    quality_guarantees:
      Array.isArray(raw.quality_guarantees) && raw.quality_guarantees.length > 0
        ? raw.quality_guarantees
        : DEFAULT_SHOP_CMS.quality_guarantees,
    faqs:
      Array.isArray(raw.faqs)
        ? raw.faqs
        : DEFAULT_SHOP_CMS.faqs,
  };
}

/**
 * Evaluates whether the Annual Event ornament banner and dynamic scene palette
 * should be active based on the master toggle, ornament URL presence, and optional date window.
 */
export function isAnnualEventActive(cms?: Partial<PublicCmsConfig> | null): boolean {
  if (!cms || !cms.event_enabled) return false;
  if (!cms.event_ornament_url || !cms.event_ornament_url.trim()) return false;

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (cms.event_start_date && cms.event_start_date.trim() !== "") {
    if (todayIso < cms.event_start_date.trim()) return false;
  }
  if (cms.event_end_date && cms.event_end_date.trim() !== "") {
    if (todayIso > cms.event_end_date.trim()) return false;
  }
  return true;
}

/**
 * Formats announcement text into ASCII-decorated ticker segments
 */
export function formatAsciiAnnouncementSegments(
  rawText: string,
  _style?: string,
): { text: string; separator: string }[] {
  const parts = (rawText || "")
    .split(/\s*(?:·|\||\/\/|✦|★)\s*/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const items = parts.length > 0 ? parts : [rawText || ""];

  return items.map((text) => ({
    text,
    separator: "|",
  }));
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = (hex || "").trim().replace(/^#/, "");
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const normH = ((h % 360) + 360) % 360 / 360;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const cs = clamp01(s);
  const cl = clamp01(l);

  if (cs === 0) {
    const gray = Math.round(cl * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = cl < 0.5 ? cl * (1 + cs) : cl + cs - cl * cs;
  const p = 2 * cl - q;

  return {
    r: Math.round(hue2rgb(p, q, normH + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, normH) * 255),
    b: Math.round(hue2rgb(p, q, normH - 1 / 3) * 255),
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/**
 * Harmonizes any raw or extracted scene color palette using HSL clamping
 * so that:
 * 1. Monochrome / grayscale inputs (S <= 12%) remain authentically monochrome
 *    (charcoal/graphite primary #27272a, deep obsidian secondary #18181b,
 *    soft silver-stone surface tint #f4f4f5, crisp graphite badge text #262626)
 *    instead of artificially boosting saturation or falling back to green.
 * 2. Muted inputs (12% < S < 36%) preserve their subtle architectural saturation.
 * 3. Vibrant chromatic inputs (S >= 36%) meet WCAG AA (>= 4.5:1 contrast with white text)
 *    and avoid neon/oversaturated tones (S: 38%..70%, L: 22%..35%).
 */
export function harmonizeScenePalette(input: {
  primary?: string;
  secondary?: string;
  surfaceTint?: string;
  badgeText?: string;
}): {
  primary: string;
  secondary: string;
  surfaceTint: string;
  badgeText: string;
} {
  const fallbackRgb = { r: 39, g: 39, b: 42 }; // #27272a (Neutral Monochrome Charcoal)
  const rawPrimaryRgb = hexToRgb(input.primary || "") || fallbackRgb;
  const rawPrimaryHsl = rgbToHsl(rawPrimaryRgb.r, rawPrimaryRgb.g, rawPrimaryRgb.b);

  const hue = rawPrimaryHsl.h;
  const rawS = rawPrimaryHsl.s;
  const rawL = rawPrimaryHsl.l;

  // Case 1: Monochrome / Grayscale / Near-Neutral palette (e.g. B&W illustration, charcoal, silver)
  if (rawS <= 0.12) {
    const monoS = Math.min(0.04, rawS);
    const monoPrimaryL = Math.max(0.16, Math.min(0.25, rawL > 0.05 && rawL < 0.85 ? rawL * 0.45 + 0.1 : 0.18));
    const monoSecL = Math.max(0.09, monoPrimaryL - 0.06);
    const monoSurfaceL = 0.955; // #f4f4f5 soft monochrome mist
    const monoBadgeL = 0.15;

    return {
      primary: hslToHex(hue, monoS, monoPrimaryL),
      secondary: hslToHex(hue, monoS, monoSecL),
      surfaceTint: hslToHex(hue, Math.min(0.02, monoS), monoSurfaceL),
      badgeText: hslToHex(hue, monoS, monoBadgeL),
    };
  }

  // Case 2 & 3: Muted (0.12 < S < 0.36) or Chromatic (S >= 0.36) palette
  const isHighLuminanceHue = hue >= 42 && hue <= 175;
  const maxPrimaryL = isHighLuminanceHue ? 0.29 : 0.35;
  const minPrimaryL = isHighLuminanceHue ? 0.22 : 0.25;

  const primaryS =
    rawS < 0.36
      ? Math.max(0.14, Math.min(0.35, rawS))
      : Math.max(0.38, Math.min(0.7, rawS));
  const primaryL = Math.max(minPrimaryL, Math.min(maxPrimaryL, rawL || 0.28));

  // Harmonize secondary: keep it monochromatic / tightly analogous to primary so gradients never look messy
  let secH = (hue + 6) % 360;
  let secS = Math.min(0.74, primaryS + 0.04);
  let secL = Math.max(0.16, primaryL - 0.07);

  if (input.secondary) {
    const rawSecRgb = hexToRgb(input.secondary);
    if (rawSecRgb) {
      const rawSecHsl = rgbToHsl(rawSecRgb.r, rawSecRgb.g, rawSecRgb.b);
      const hueDiff = Math.min(
        Math.abs(rawSecHsl.h - hue),
        360 - Math.abs(rawSecHsl.h - hue),
      );
      if (hueDiff <= 24 && rawSecHsl.s >= 0.14) {
        secH = rawSecHsl.h;
        secS = Math.max(0.14, Math.min(0.74, rawSecHsl.s));
        secL = Math.max(0.16, Math.min(primaryL - 0.04, rawSecHsl.l));
      }
    }
  }

  // Architectural whisper-soft surface tint
  const surfaceS = Math.max(0.08, Math.min(0.3, primaryS * 0.42));
  const surfaceL = 0.964;

  // High-contrast badge & micro-label text
  const badgeS = Math.max(0.18, Math.min(0.76, primaryS + 0.06));
  const badgeL = 0.2;

  return {
    primary: hslToHex(hue, primaryS, primaryL),
    secondary: hslToHex(secH, secS, secL),
    surfaceTint: hslToHex(hue, surfaceS, surfaceL),
    badgeText: hslToHex(hue, badgeS, badgeL),
  };
}

/**
 * Extracts a cohesive, WCAG-AA harmonized 4-color Scene Palette and natural pixel dimensions
 * from an uploaded ornament image using an offscreen HTML5 Canvas.
 * Accurately detects monochrome / black-and-white / grayscale banners and returns a sleek
 * charcoal & silver-stone monochrome palette instead of falling back to green.
 */
export async function extractScenePaletteFromImage(imageSrc: string): Promise<{
  primary: string;
  secondary: string;
  surfaceTint: string;
  badgeText: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const width = img.naturalWidth || img.width || 1920;
      const height = img.naturalHeight || img.height || 240;

      try {
        const canvas = document.createElement("canvas");
        const sampleW = 160;
        const sampleH = 40;
        canvas.width = sampleW;
        canvas.height = sampleH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Canvas 2D context unavailable");
        }
        ctx.drawImage(img, 0, 0, sampleW, sampleH);
        const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

        // Bucket colors by 15-degree hue bins for chromatic pixels, while tracking monochrome ratio
        const buckets: Record<
          number,
          { count: number; rSum: number; gSum: number; bSum: number; satSum: number }
        > = {};

        let totalOpaquePixels = 0;
        let chromaticPixels = 0;
        let monoCount = 0;
        let monoRSum = 0;
        let monoGSum = 0;
        let monoBSum = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue;

          totalOpaquePixels += 1;
          const { h, s, l } = rgbToHsl(r, g, b);

          // Track mid-to-dark structural pixels for monochrome tone calculation
          if (l >= 0.08 && l <= 0.72) {
            monoCount += 1;
            monoRSum += r;
            monoGSum += g;
            monoBSum += b;
          }

          // Skip near-white, near-black, or low-saturation pixels when building chromatic hue bins
          if (l < 0.12 || l > 0.86 || s < 0.18) continue;

          chromaticPixels += 1;
          const bin = Math.floor(h / 15);
          if (!buckets[bin]) {
            buckets[bin] = { count: 0, rSum: 0, gSum: 0, bSum: 0, satSum: 0 };
          }
          buckets[bin].count += 1;
          buckets[bin].rSum += r;
          buckets[bin].gSum += g;
          buckets[bin].bSum += b;
          buckets[bin].satSum += s;
        }

        const chromaticRatio = chromaticPixels / Math.max(1, totalOpaquePixels);

        const sortedBins = Object.entries(buckets)
          .map(([bin, val]) => ({
            bin: Number(bin),
            ...val,
            score: val.count * (1 + val.satSum / Math.max(1, val.count)),
          }))
          .sort((a, b) => b.score - a.score);

        let rawPrimaryHex = "#27272a"; // Default monochrome charcoal

        // Only treat image as chromatic if at least 8% of opaque pixels have real color saturation;
        // otherwise it is a monochrome / B&W / grayscale image (ignoring minor compression noise).
        if (chromaticRatio >= 0.08 && sortedBins.length > 0) {
          const top = sortedBins[0];
          rawPrimaryHex = rgbToHex(
            Math.round(top.rSum / top.count),
            Math.round(top.gSum / top.count),
            Math.round(top.bSum / top.count),
          );
        } else if (monoCount > 0) {
          const avgR = Math.round(monoRSum / monoCount);
          const avgG = Math.round(monoGSum / monoCount);
          const avgB = Math.round(monoBSum / monoCount);
          const avgHsl = rgbToHsl(avgR, avgG, avgB);
          // Clamp saturation to <= 0.03 so compression artifacts never tint a monochrome image green/purple
          rawPrimaryHex = hslToHex(avgHsl.h, Math.min(0.03, avgHsl.s), 0.18);
        }

        const harmonized = harmonizeScenePalette({ primary: rawPrimaryHex });

        resolve({
          ...harmonized,
          width,
          height,
        });
      } catch {
        const fallback = harmonizeScenePalette({ primary: "#27272a" });
        resolve({
          ...fallback,
          width,
          height,
        });
      }
    };
    img.onerror = () => reject(new Error("Failed to load image for color extraction"));
    img.src = imageSrc;
  });
}
