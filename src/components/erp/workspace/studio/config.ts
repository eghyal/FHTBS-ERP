import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  FileText,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Palette,
  Highlighter,
  CaseSensitive,
  Plus,
  Minus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Building2,
  MapPin,
  CheckCircle2,
  PenTool,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ShieldCheck,
  Send,
  Save,
  X,
  Sparkles,
  Layers,
  Eye,
  AlertTriangle,
  Table as TableIcon,
  ListOrdered,
  Type,
  UserCheck,
  Grid3X3,
  GripVertical,
  Move,
  RotateCcw,
  Undo2,
  Redo2,
  Printer,
  Keyboard,
  PanelLeft,
  SlidersHorizontal,
  Search,
  Lock,
  Check,
  Info,
  Upload,
  Download,
  Calculator,
  Landmark,
  CheckSquare,
  SeparatorHorizontal,
  FileCheck2,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { generatePDF } from "@/lib/pdfGenerator";
import {
  DocBlock,
  DocBlockType,
  BlockCategory,
  LayoutPreset,
  TargetDepartment,
  AuthorizationRole,
} from "@/types/workspace";
import { ERP_DEPARTMENT_OPTIONS } from "@/constants/rbac";
import {
  evaluateTableFormula,
  parseDocxPackageToBlocks,
  generateDocxBinaryBuffer,
  generateDeterministicPdfBuffer,
  normalizeHorizontalAlign,
  normalizeVerticalAlign,
  normalizeBlockAlignment,
} from "@/services/docxEngine";

export interface PaperFormatOption {
  value: LayoutPreset;
  label: string;
  shortLabel: string;
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  paddingClass: string;
}

export const PAPER_FORMAT_OPTIONS: PaperFormatOption[] = [
  {
    value: "A4_PORTRAIT",
    label: "A4 Portrait (210 × 297 mm)",
    shortLabel: "A4 Portrait",
    widthMm: 210,
    heightMm: 297,
    widthPx: 800,
    heightPx: 1130,
    paddingClass: "p-12",
  },
  {
    value: "A4_LANDSCAPE",
    label: "A4 Landscape (297 × 210 mm)",
    shortLabel: "A4 Landscape",
    widthMm: 297,
    heightMm: 210,
    widthPx: 1130,
    heightPx: 800,
    paddingClass: "p-12",
  },
  {
    value: "F4_PORTRAIT",
    label: "F4 / Folio Portrait (215 × 330 mm)",
    shortLabel: "F4 Portrait",
    widthMm: 215,
    heightMm: 330,
    widthPx: 812,
    heightPx: 1247,
    paddingClass: "p-12",
  },
  {
    value: "F4_LANDSCAPE",
    label: "F4 / Folio Landscape (330 × 215 mm)",
    shortLabel: "F4 Landscape",
    widthMm: 330,
    heightMm: 215,
    widthPx: 1247,
    heightPx: 812,
    paddingClass: "p-12",
  },
  {
    value: "US_LETTER_PORTRAIT",
    label: "US Letter Portrait (216 × 279 mm)",
    shortLabel: "US Letter Portrait",
    widthMm: 216,
    heightMm: 279,
    widthPx: 816,
    heightPx: 1056,
    paddingClass: "p-12",
  },
  {
    value: "US_LETTER_LANDSCAPE",
    label: "US Letter Landscape (279 × 216 mm)",
    shortLabel: "US Letter Landscape",
    widthMm: 279,
    heightMm: 216,
    widthPx: 1056,
    heightPx: 816,
    paddingClass: "p-12",
  },
  {
    value: "US_LEGAL_PORTRAIT",
    label: "US Legal Portrait (216 × 356 mm)",
    shortLabel: "US Legal Portrait",
    widthMm: 216,
    heightMm: 356,
    widthPx: 816,
    heightPx: 1344,
    paddingClass: "p-12",
  },
  {
    value: "US_LEGAL_LANDSCAPE",
    label: "US Legal Landscape (356 × 216 mm)",
    shortLabel: "US Legal Landscape",
    widthMm: 356,
    heightMm: 216,
    widthPx: 1344,
    heightPx: 816,
    paddingClass: "p-12",
  },
  {
    value: "A3_PORTRAIT",
    label: "A3 Technical Portrait (297 × 420 mm)",
    shortLabel: "A3 Portrait",
    widthMm: 297,
    heightMm: 420,
    widthPx: 1123,
    heightPx: 1587,
    paddingClass: "p-14",
  },
  {
    value: "A3_LANDSCAPE",
    label: "A3 Technical Landscape (420 × 297 mm)",
    shortLabel: "A3 Landscape",
    widthMm: 420,
    heightMm: 297,
    widthPx: 1587,
    heightPx: 1123,
    paddingClass: "p-14",
  },
  {
    value: "A5_PORTRAIT",
    label: "A5 Compact Voucher (148 × 210 mm)",
    shortLabel: "A5 Portrait",
    widthMm: 148,
    heightMm: 210,
    widthPx: 560,
    heightPx: 794,
    paddingClass: "p-8",
  },
  {
    value: "A5_LANDSCAPE",
    label: "A5 Compact Landscape (210 × 148 mm)",
    shortLabel: "A5 Landscape",
    widthMm: 210,
    heightMm: 148,
    widthPx: 794,
    heightPx: 560,
    paddingClass: "p-8",
  },
  {
    value: "B5_PORTRAIT",
    label: "B5 ISO Standard (176 × 250 mm)",
    shortLabel: "B5 Portrait",
    widthMm: 176,
    heightMm: 250,
    widthPx: 665,
    heightPx: 945,
    paddingClass: "p-10",
  },
  {
    value: "THERMAL_80MM",
    label: "Thermal Receipt Slip (80 × 200 mm)",
    shortLabel: "Thermal 80mm",
    widthMm: 80,
    heightMm: 200,
    widthPx: 320,
    heightPx: 756,
    paddingClass: "p-5",
  },
  {
    value: "EXECUTIVE_MEMO",
    label: "Executive Memo (198 × 251 mm)",
    shortLabel: "Executive Memo",
    widthMm: 198,
    heightMm: 251,
    widthPx: 750,
    heightPx: 950,
    paddingClass: "p-10",
  },
  {
    value: "CUSTOM",
    label: "Custom Paper Size (mm)",
    shortLabel: "Custom (mm)",
    widthMm: 210,
    heightMm: 297,
    widthPx: 800,
    heightPx: 1130,
    paddingClass: "p-10",
  },
];

export function getPaperDimensions(
  preset: LayoutPreset = "A4_PORTRAIT",
  customWidthMm?: number | null,
  customHeightMm?: number | null
): {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  paddingClass: string;
  shortLabel: string;
  orientation: "portrait" | "landscape";
} {
  if (preset === "CUSTOM") {
    const wMm = Math.max(60, Math.min(600, Number(customWidthMm) || 210));
    const hMm = Math.max(80, Math.min(840, Number(customHeightMm) || 297));
    const wPx = Math.round(wMm * 3.78);
    const hPx = Math.round(hMm * 3.78);
    return {
      widthMm: wMm,
      heightMm: hMm,
      widthPx: wPx,
      heightPx: hPx,
      paddingClass: wMm < 120 ? "p-5" : wMm < 180 ? "p-8" : "p-12",
      shortLabel: `Custom (${wMm}×${hMm}mm)`,
      orientation: wMm > hMm ? "landscape" : "portrait",
    };
  }
  const found =
    PAPER_FORMAT_OPTIONS.find((p) => p.value === preset) || PAPER_FORMAT_OPTIONS[0];
  return {
    widthMm: found.widthMm,
    heightMm: found.heightMm,
    widthPx: found.widthPx,
    heightPx: found.heightPx,
    paddingClass: found.paddingClass,
    shortLabel: found.shortLabel,
    orientation: found.widthMm > found.heightMm ? "landscape" : "portrait",
  };
}

export type SignatureApprovalTier = "SUPERVISOR" | "MANAGER" | "FC";

export function resolveCanonicalRoleForDeptAndTier(
  dept: string,
  tier: SignatureApprovalTier | string = "MANAGER"
): string {
  const d = (dept || "HR").toUpperCase();
  const t = (tier || "MANAGER").toUpperCase();
  if (d === "FC" || t === "FC") return "FC";
  const prefix = d === "QC" ? "QA_QC" : d;
  if (t === "SUPERVISOR" || t.endsWith("_SUPERVISOR")) {
    return `${prefix}_SUPERVISOR`;
  }
  return `${prefix}_MANAGER`;
}

export function extractTierFromRole(role?: string | null, dept?: string | null): SignatureApprovalTier {
  const r = (role || "").toUpperCase();
  const d = (dept || "").toUpperCase();
  if (d === "FC" || r === "FC") return "FC";
  if (r.includes("SUPERVISOR")) return "SUPERVISOR";
  return "MANAGER";
}

export function getSignatoryTitleForDeptAndTier(
  dept: string,
  tier: SignatureApprovalTier | string = "MANAGER"
): string {
  const d = (dept || "HR").toUpperCase();
  const t = extractTierFromRole(tier, d);
  if (d === "FC" || t === "FC") return "FC";
  const deptNames: Record<string, string> = {
    HR: "Human Resources",
    PURCHASING: "Purchasing",
    FINANCE: "Finance & Accounting",
    PRODUCTION: "Production",
    WAREHOUSE: "Warehouse & Logistics",
    ENGINEERING: "Engineering",
    SALES: "Sales & Commercial",
    PPIC: "PPIC",
    QA_QC: "QA / QC",
    QC: "QA / QC",
  };
  const base = deptNames[d] || d;
  return t === "SUPERVISOR" ? `${base} Supervisor` : `${base} Manager`;
}

export interface CanvaStudioEditorProps {
  documentId: string | null;
  initialDocumentCode?: string | null;
  initialTitle: string;
  initialDocType: string;
  initialDepartment: string;
  initialAuthRole: string;
  initialAuthDepartment?: string;
  initialAuthName?: string;
  initialBlocks: DocBlock[];
  initialLayoutPreset: LayoutPreset;
  initialCustomWidthMm?: number | null;
  initialCustomHeightMm?: number | null;
  initialStatus?: string;
  versions?: any[];
  events?: any[];
  onClone?: () => void;
  onSave: (
    docData: {
      title: string;
      document_type: string;
      department: string;
      content: DocBlock[];
      layout_preset: LayoutPreset;
      custom_width_mm?: number | null;
      custom_height_mm?: number | null;
      authorization_role: string;
      authorization_department: string;
      authorization_user_name: string;
      submitForApproval: boolean;
    },
    opts?: { closeAfter?: boolean }
  ) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
  isId?: boolean;
}

// Department Routing Configuration
export const DEPARTMENT_ROUTING_CONFIG: Record<
  string,
  {
    role: AuthorizationRole;
    deptNameId: string;
    deptNameEn: string;
    signatoryTitleId: string;
    signatoryTitleEn: string;
    badgeColor: string;
    descriptionId: string;
    descriptionEn: string;
  }
> = {
  PPIC: {
    role: "PPIC_MANAGER",
    deptNameId: "PPIC & Planning",
    deptNameEn: "PPIC & Planning",
    signatoryTitleId: "PPIC Manager",
    signatoryTitleEn: "PPIC Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "This document routes to PPIC Department for scheduling verification.",
    descriptionEn: "This document routes to PPIC Department for scheduling verification.",
  },
  QA_QC: {
    role: "QA_QC_MANAGER",
    deptNameId: "QA / QC",
    deptNameEn: "QA / QC",
    signatoryTitleId: "QA / QC Manager",
    signatoryTitleEn: "QA / QC Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "This document routes to QA/QC Department for quality verification.",
    descriptionEn: "This document routes to QA/QC Department for quality verification.",
  },
  QC: {
    role: "QA_QC_MANAGER",
    deptNameId: "QA / QC",
    deptNameEn: "QA / QC",
    signatoryTitleId: "QA / QC Manager",
    signatoryTitleEn: "QA / QC Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "This document routes to QA/QC Department for quality verification.",
    descriptionEn: "This document routes to QA/QC Department for quality verification.",
  },
  FC: {
    role: "FC",
    deptNameId: "FC",
    deptNameEn: "FC",
    signatoryTitleId: "FC",
    signatoryTitleEn: "FC",
    badgeColor: "bg-stone-900 border-stone-800 text-white font-bold",
    descriptionId: "This document routes directly to FC for authorization.",
    descriptionEn: "This document routes directly to FC for authorization.",
  },
  HR: {
    role: "HR_MANAGER",
    deptNameId: "Human Resource (HR)",
    deptNameEn: "Human Resource (HR)",
    signatoryTitleId: "Human Resources Manager",
    signatoryTitleEn: "Human Resources Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "This document routes to Human Resources (HR) for authorization.",
    descriptionEn: "This document routes to Human Resources (HR) for authorization.",
  },
  ENGINEERING: {
    role: "ENGINEERING_MANAGER",
    deptNameId: "Engineering",
    deptNameEn: "Engineering",
    signatoryTitleId: "Engineering Manager",
    signatoryTitleEn: "Engineering Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "This document routes to Engineering Department for technical verification.",
    descriptionEn: "This document routes to Engineering Department for technical verification.",
  },
  PURCHASING: {
    role: "PURCHASING_MANAGER",
    deptNameId: "Purchasing",
    deptNameEn: "Purchasing",
    signatoryTitleId: "Purchasing Manager",
    signatoryTitleEn: "Purchasing Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "This document routes to Purchasing Department for verification and authorization.",
    descriptionEn: "This document routes to Purchasing Department for verification and authorization.",
  },
  WAREHOUSE: {
    role: "WAREHOUSE_SUPERVISOR",
    deptNameId: "Warehouse",
    deptNameEn: "Warehouse",
    signatoryTitleId: "Warehouse Supervisor",
    signatoryTitleEn: "Warehouse Supervisor",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "This document routes to Warehouse Department for physical stock validation.",
    descriptionEn: "This document routes to Warehouse Department for physical stock validation.",
  },
  PRODUCTION: {
    role: "PRODUCTION_MANAGER",
    deptNameId: "Production",
    deptNameEn: "Production",
    signatoryTitleId: "Production Manager",
    signatoryTitleEn: "Production Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "This document routes to Production Department for plant operations.",
    descriptionEn: "This document routes to Production Department for plant operations.",
  },
  SALES: {
    role: "SALES_MANAGER",
    deptNameId: "Sales",
    deptNameEn: "Sales",
    signatoryTitleId: "Sales & Commercial Manager",
    signatoryTitleEn: "Sales & Commercial Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "This document routes to Sales Department for commercial commitment.",
    descriptionEn: "This document routes to Sales Department for commercial commitment.",
  },
  FINANCE: {
    role: "FINANCE_MANAGER",
    deptNameId: "Finance & Accounting",
    deptNameEn: "Finance & Accounting",
    signatoryTitleId: "Finance & Accounting Manager",
    signatoryTitleEn: "Finance & Accounting Manager",
    badgeColor: "bg-teal-50 border-teal-200 text-teal-800 font-bold",
    descriptionId: "This document routes to Finance & Accounting Department for authorization.",
    descriptionEn: "This document routes to Finance & Accounting Department for authorization.",
  },
  GENERAL: {
    role: "HR_MANAGER",
    deptNameId: "Human Resource (HR)",
    deptNameEn: "Human Resource (HR)",
    signatoryTitleId: "Human Resources Manager",
    signatoryTitleEn: "Human Resources Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Default fallback routing to Human Resources (HR).",
    descriptionEn: "Default fallback routing to Human Resources (HR).",
  },
};

// Standard Official Kop Surat CV. BATU EMAS GROUP (Permanent & Locked - Matching Exported Quotations)
export const OFFICIAL_KOP_SURAT_BLOCK: DocBlock = {
  id: "blk-official-letterhead",
  type: "OFFICIAL_LETTERHEAD",
  category: "ADDRESS_TEMPLATE",
  title: "CV. BATU EMAS GROUP",
  subtitle: "PRIMARY MANUFACTURER & SUPPLIER OF PAVING BLOCKS, CONCRETE BLOCKS & PRECAST CONCRETE",
  isLocked: true,
  addressData: {
    companyName: "CV. BATU EMAS GROUP",
    division: "Main Plant & Banyuwangi Office",
    streetAddress: "Dusun Petahunan, Jajag, Gambiran, Banyuwangi Regency, East Java 68486",
    cityStateZip: "Banyuwangi 68486, Indonesia",
    phone: "0811-1111-3993",
    email: "pavingjoss@gmail.com",
  },
  style: "OFFICIAL",
  alignment: "CENTER",
};

/* ============================================================
 * BLOCK LIBRARY CATALOG (Canva-style, data-driven & searchable)
 * ==========================================================*/

export interface LibraryItem {
  key: string;
  type: DocBlockType;
  category: BlockCategory;
  dept?: TargetDepartment;
  icon: React.ComponentType<{ className?: string }>;
  labelId: string;
  labelEn: string;
  descId: string;
  descEn: string;
  accent: string; // icon chip classes
  keywords: string;
  locked?: boolean;
}

export const LIBRARY_ITEMS: LibraryItem[] = [
  // 1. Konten / Isi (BODY_TEXT)
  {
    key: "HEADER",
    type: "HEADER",
    category: "BODY_TEXT",
    icon: Type,
    labelId: "Judul Resmi Dokumen",
    labelEn: "Official Document Heading",
    descId: "Judul kapital tegas dengan nomor registrasi dokumen.",
    descEn: "Bold uppercase heading with document reference number.",
    accent: "bg-stone-900 text-white",
    keywords: "judul header title heading nomor surat",
  },
  {
    key: "METADATA_GRID",
    type: "METADATA_GRID",
    category: "BODY_TEXT",
    icon: Layers,
    labelId: "Grid Nomor & Referensi",
    labelEn: "Reference Metadata Grid",
    descId: "Kotak 4 kolom nomor dokumen, tanggal, sifat, dan departemen.",
    descEn: "4-column reference box for document number, date, and priority.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "metadata grid info key value parameter nomor tanggal",
  },
  {
    key: "TEXT",
    type: "TEXT",
    category: "BODY_TEXT",
    icon: AlignLeft,
    labelId: "Paragraf Narasi Resmi",
    labelEn: "Narrative Paragraph",
    descId: "Blok paragraf surat dinas / memo dengan perataan penuh.",
    descEn: "Standard narrative paragraph block with rich formatting.",
    accent: "bg-stone-100 text-stone-700",
    keywords: "teks paragraf isi narasi text paragraph body",
  },
  {
    key: "TABLE",
    type: "TABLE",
    category: "BODY_TEXT",
    icon: TableIcon,
    labelId: "Tabel Spesifikasi & Item",
    labelEn: "Specification & Item Table",
    descId: "Tabel matriks item material, spesifikasi, satuan, dan kuantitas.",
    descEn: "Matrix table for items, specifications, units, and quantities.",
    accent: "bg-stone-900 text-white",
    keywords: "tabel spesifikasi item material matriks table grid rows",
  },
  {
    key: "BUDGET_TABLE",
    type: "TABLE",
    category: "BODY_TEXT",
    icon: Calculator,
    labelId: "Tabel RAB & Kalkulasi Otomatis",
    labelEn: "Budget & Auto-Sum Table",
    descId: "Tabel anggaran lengkap dengan rumus otomatis =SUM(ABOVE).",
    descEn: "Financial budget table with pre-configured =SUM(ABOVE) formula.",
    accent: "bg-emerald-100 text-emerald-800",
    keywords: "tabel rab anggaran biaya harga sum kalkulasi otomatis budget",
  },
  {
    key: "IMAGE",
    type: "IMAGE",
    category: "BODY_TEXT",
    icon: ImageIcon,
    labelId: "Foto & Dokumentasi Visual",
    labelEn: "Photo & Visual Documentation",
    descId: "Unggah foto dokumentasi lapangan, produk, atau bukti fisik dengan bebas resize & caption.",
    descEn: "Upload field documentation, product, or evidence photo with free resize, alignment & caption.",
    accent: "bg-indigo-100 text-indigo-800",
    keywords: "foto photo gambar image dokumentasi visual kamera lampiran",
  },
  {
    key: "LIST_POINTS",
    type: "LIST_POINTS",
    category: "BODY_TEXT",
    icon: ListOrdered,
    labelId: "Poin Instruksi & Kebijakan",
    labelEn: "Numbered Policy Points",
    descId: "Daftar bernomor untuk butir-butir instruksi kerja atau SOP.",
    descEn: "Numbered list for official instructions and SOP points.",
    accent: "bg-stone-100 text-stone-700",
    keywords: "list poin nomor butir ketentuan bullet numbered",
  },
  {
    key: "CHECKLIST_BLOCK",
    type: "LIST_POINTS",
    category: "BODY_TEXT",
    icon: CheckSquare,
    labelId: "QC / Handover Inspection Checklist",
    labelEn: "QC / Handover Inspection Checklist",
    descId: "Verification checklist for quality control and handover certificate.",
    descEn: "Verification checklist for quality control and handover certificate.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "checklist qc inspection handover verification",
  },
  {
    key: "TERMS_BLOCK",
    type: "LIST_POINTS",
    category: "BODY_TEXT",
    icon: FileCheck2,
    labelId: "Klausul Syarat & Ketentuan",
    labelEn: "Commercial Terms & Clauses",
    descId: "Template pasal syarat pembayaran, pengiriman, dan garansi mutu.",
    descEn: "Standard clauses for payment terms, delivery, and warranty.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "syarat ketentuan klausul kontrak pasal termin garansi",
  },
  {
    key: "CALLOUT",
    type: "CALLOUT",
    category: "BODY_TEXT",
    icon: AlertTriangle,
    labelId: "Kotak Perhatian / Peringatan",
    labelEn: "Important Callout Box",
    descId: "Kotak sorotan khusus untuk instruksi krusial atau kepatuhan.",
    descEn: "Highlighted callout box for critical compliance notices.",
    accent: "bg-amber-100 text-amber-800",
    keywords: "callout catatan penting warning perhatian highlight",
  },
  {
    key: "DIVIDER",
    type: "DIVIDER",
    category: "BODY_TEXT",
    icon: SeparatorHorizontal,
    labelId: "Garis Pemisah Seksi",
    labelEn: "Section Divider Line",
    descId: "Garis pembatas horisontal tegas antar bagian dokumen.",
    descEn: "Solid horizontal divider rule between document sections.",
    accent: "bg-stone-100 text-stone-700",
    keywords: "garis pemisah divider line hr",
  },
  {
    key: "PAGE_BREAK",
    type: "PAGE_BREAK",
    category: "BODY_TEXT",
    icon: SeparatorHorizontal,
    labelId: "Pindah Halaman (Page Break)",
    labelEn: "Explicit Page Break",
    descId: "Memulai halaman cetak baru secara eksplisit mulai dari titik ini.",
    descEn: "Forces subsequent blocks to start on a new printed page.",
    accent: "bg-stone-900 text-white",
    keywords: "page break halaman baru pindah halaman",
  },

  // 2. Kop & Alamat (ADDRESS_TEMPLATE)
  {
    key: "OFFICIAL_LETTERHEAD",
    type: "OFFICIAL_LETTERHEAD",
    category: "ADDRESS_TEMPLATE",
    icon: ShieldCheck,
    labelId: "Kop Surat Resmi",
    labelEn: "Official Letterhead",
    descId: "Kop terstandarisasi CV. Batu Emas Group (terpasang permanen & terkunci).",
    descEn: "Standardized CV. Batu Emas Group letterhead (permanently locked).",
    accent: "bg-amber-100 text-amber-700",
    keywords: "kop surat letterhead kepala logo resmi",
    locked: true,
  },
  {
    key: "SENDER_ADDRESS",
    type: "SENDER_ADDRESS",
    category: "ADDRESS_TEMPLATE",
    icon: MapPin,
    labelId: "Identitas Pengirim (From)",
    labelEn: "Sender Identity (From)",
    descId: "Identitas divisi internal pengirim, kontak ekstensi, dan PIC.",
    descEn: "Internal sender division block with PIC contact.",
    accent: "bg-stone-100 text-stone-700",
    keywords: "alamat pengirim from sender address divisi",
  },
  {
    key: "RECIPIENT_ADDRESS",
    type: "RECIPIENT_ADDRESS",
    category: "ADDRESS_TEMPLATE",
    icon: Building2,
    labelId: "Tujuan Rekanan / Klien (To)",
    labelEn: "Partner / Client Address (To)",
    descId: "Format tujuan surat resmi kepada vendor, supplier, atau pelanggan.",
    descEn: "Formal recipient block for vendors, suppliers, and clients.",
    accent: "bg-stone-900 text-white",
    keywords: "alamat tujuan penerima to vendor rekanan recipient",
  },
  {
    key: "PROJECT_SITE_ADDRESS",
    type: "PROJECT_SITE_ADDRESS",
    category: "ADDRESS_TEMPLATE",
    icon: MapPin,
    labelId: "Lokasi Proyek / Serah Terima",
    labelEn: "Project Delivery Site",
    descId: "Alamat tujuan pengiriman lapangan, akses armada, dan kontak mandor.",
    descEn: "Field delivery site address, fleet access, and foreman contact.",
    accent: "bg-emerald-100 text-emerald-700",
    keywords: "lokasi proyek site lapangan alamat kirim",
  },

  // 3. Kolom Otorisasi (SIGNATURE_COLUMN)
  {
    key: "DUAL_SIGNATURE",
    type: "DUAL_SIGNATURE",
    category: "SIGNATURE_COLUMN",
    icon: UserCheck,
    labelId: "Tanda Tangan 2 Kolom (Pembuat & Otorisator)",
    labelEn: "Dual Signature (Creator & Approver)",
    descId: "2 kolom sejajar: Pembuat di kiri & Pejabat Otorisasi + QR di kanan.",
    descEn: "2-column sign-off: Prepared by on left, Authorized + QR on right.",
    accent: "bg-stone-900 text-white",
    keywords: "ttd tanda tangan signature dual dua kolom",
  },
  {
    key: "SIG_PURCHASING",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "PURCHASING",
    icon: PenTool,
    labelId: "Otorisasi Purchasing",
    labelEn: "Purchasing Authorization",
    descId: "Auto-routing ke Manager Pengadaan untuk verifikasi & otorisasi.",
    descEn: "Auto-routes to the Purchasing Manager for authorization.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "ttd tanda tangan signature purchasing pengadaan",
  },
  {
    key: "SIG_FINANCE",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "FINANCE",
    icon: PenTool,
    labelId: "Otorisasi Finance & Accounting",
    labelEn: "Finance Authorization",
    descId: "Auto-routing ke Head of Finance untuk verifikasi anggaran.",
    descEn: "Auto-routes to the Head of Finance for budget verification.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "ttd tanda tangan signature finance keuangan anggaran",
  },
  {
    key: "SIG_PRODUCTION",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "PRODUCTION",
    icon: PenTool,
    labelId: "Otorisasi Produksi",
    labelEn: "Production Authorization",
    descId: "Auto-routing ke Production Manager untuk instruksi lini pabrik.",
    descEn: "Auto-routes to the Production Manager for floor instructions.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "ttd tanda tangan signature produksi pabrik plant",
  },
  {
    key: "SIG_WAREHOUSE",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "WAREHOUSE",
    icon: PenTool,
    labelId: "Otorisasi Gudang & Logistik",
    labelEn: "Warehouse Authorization",
    descId: "Auto-routing ke Supervisor Gudang untuk validasi fisik material.",
    descEn: "Auto-routes to the Warehouse Supervisor for stock validation.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "ttd tanda tangan signature gudang warehouse logistik",
  },
  {
    key: "SIG_HR",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "HR",
    icon: PenTool,
    labelId: "Otorisasi Human Resource (HR)",
    labelEn: "HR Authorization",
    descId: "Auto-routing ke Manager HR untuk kebijakan & personalia.",
    descEn: "Auto-routes to the HR Manager for personnel authorization.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "ttd tanda tangan signature hr human resource personalia sdm",
  },
  {
    key: "SIG_ENGINEERING",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "ENGINEERING",
    icon: PenTool,
    labelId: "Otorisasi Engineering",
    labelEn: "Engineering Authorization",
    descId: "Auto-routing ke Engineering Lead untuk verifikasi spesifikasi teknis.",
    descEn: "Auto-routes to the Engineering Lead for technical verification.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "ttd tanda tangan signature engineering teknik spesifikasi",
  },
  {
    key: "SIG_SALES",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "SALES",
    icon: PenTool,
    labelId: "Otorisasi Sales & Commercial",
    labelEn: "Sales Authorization",
    descId: "Auto-routing ke Sales Manager untuk komitmen komersial & klien.",
    descEn: "Auto-routes to the Sales Manager for commercial sign-off.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "ttd tanda tangan signature sales komersial marketing klien",
  },
  {
    key: "SIG_PPIC",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "PPIC",
    icon: PenTool,
    labelId: "Otorisasi PPIC",
    labelEn: "PPIC Authorization",
    descId: "Auto-routing ke PPIC untuk verifikasi jadwal & MPS/MRP.",
    descEn: "Auto-routes to PPIC for production planning & MRP verification.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "ttd tanda tangan signature ppic planning jadwal mrp",
  },
  {
    key: "SIG_QA_QC",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "QA_QC",
    icon: PenTool,
    labelId: "Otorisasi QA / QC",
    labelEn: "QA / QC Authorization",
    descId: "Auto-routing ke QA/QC untuk inspeksi mutu & disposisi.",
    descEn: "Auto-routes to QA/QC for quality inspection & disposition.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "ttd tanda tangan signature qa qc quality mutu",
  },
  {
    key: "SIG_FC",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "FC",
    icon: PenTool,
    labelId: "Otorisasi FC",
    labelEn: "FC Authorization",
    descId: "Auto-routing ke FC untuk otorisasi penuh.",
    descEn: "Auto-routes directly to FC for authorization.",
    accent: "bg-stone-900 text-white",
    keywords: "ttd tanda tangan signature fc",
  },

  // 4. Footer Dokumen ERP (FOOTER_TEMPLATE)
  {
    key: "FOOTER_ERP_STANDARD",
    type: "FOOTER",
    category: "FOOTER_TEMPLATE",
    icon: ShieldCheck,
    labelId: "Standard ERP System Footer",
    labelEn: "Standard ERP System Footer",
    descId: "Official ERP verification footer matching PO, SO & Handover printouts.",
    descEn: "Official ERP verification footer matching PO, SO & Handover printouts.",
    accent: "bg-stone-900 text-white",
    keywords: "footer erp standard digital verification",
  },
  {
    key: "FOOTER_BANK_PAYMENT",
    type: "FOOTER",
    category: "FOOTER_TEMPLATE",
    icon: Landmark,
    labelId: "Footer Rekening & Pembayaran",
    labelEn: "Bank Account & Payment Footer",
    descId: "Footer instruksi pembayaran resmi & rekening bank perusahaan.",
    descEn: "Official corporate bank account and payment instruction footer.",
    accent: "bg-emerald-100 text-emerald-800",
    keywords: "footer bank rekening pembayaran transfer finance invoice",
  },
  {
    key: "FOOTER_ISO_COMPLIANCE",
    type: "FOOTER",
    category: "FOOTER_TEMPLATE",
    icon: CheckCircle2,
    labelId: "Footer Kendali Mutu ISO 9001",
    labelEn: "ISO 9001 Quality Control Footer",
    descId: "Tabel kotak kendali dokumen ISO 9001:2015, nomor revisi, dan distribusi.",
    descEn: "ISO 9001:2015 document control grid for SOPs and quality records.",
    accent: "bg-stone-100 text-stone-800",
    keywords: "footer iso mutu sop kendali dokumen revisi",
  },
  {
    key: "FOOTER_CONFIDENTIAL",
    type: "FOOTER",
    category: "FOOTER_TEMPLATE",
    icon: Lock,
    labelId: "Footer Rahasia Perusahaan",
    labelEn: "Strict Confidentiality Footer",
    descId: "Klausul kerahasiaan dokumen internal & larangan distribusi luar.",
    descEn: "Internal corporate confidentiality and non-disclosure footer.",
    accent: "bg-amber-100 text-amber-800",
    keywords: "footer rahasia confidential internal legal",
  },
];

export const CATEGORY_META: Record<BlockCategory, { labelId: string; labelEn: string }> = {
  BODY_TEXT: { labelId: "Konten & Isi Dokumen", labelEn: "Document Body & Content" },
  ADDRESS_TEMPLATE: { labelId: "Kop & Blok Alamat", labelEn: "Letterhead & Addresses" },
  SIGNATURE_COLUMN: { labelId: "Kolom Otorisasi & TTD", labelEn: "Authorization & Signatures" },
  FOOTER_TEMPLATE: { labelId: "Template Footer ERP", labelEn: "ERP Footer Templates" },
};

/* ============================================================
 * BLOCK FACTORY — creates a fresh block with sensible defaults
 * ==========================================================*/

let blockSeq = 0;

export function newBlockId() {
  blockSeq += 1;
  return `blk-${Date.now().toString(36)}-${blockSeq}-${Math.random().toString(36).slice(2, 6)}`;
}

export function buildBlock(
  type: DocBlockType,
  isId: boolean,
  department: string,
  customDept?: TargetDepartment,
  itemKey?: string
): DocBlock {
  const id = newBlockId();

  if (type === "SIGNATURE_COLUMN" || type === "DUAL_SIGNATURE" || type === "SIGNATURE_STAMP") {
    const dept: TargetDepartment = customDept || "PURCHASING";
    const config = DEPARTMENT_ROUTING_CONFIG[dept];
    return {
      id,
      type,
      category: "SIGNATURE_COLUMN",
      title: isId
        ? `Kolom Otorisasi & Pengesahan: ${config.deptNameId}`
        : `Authorization Sign-off: ${config.deptNameEn}`,
      subtitle: isId
        ? `Tanda Tangan Resmi ${config.signatoryTitleId}`
        : `Official Signature ${config.signatoryTitleEn}`,
      targetDepartment: dept,
      targetRole: config.role,
      signatoryTitle: isId ? config.signatoryTitleId : config.signatoryTitleEn,
      signatoryName: "",
      notes: isId
        ? "Pengesahan dokumen ini mengikat dan memiliki kepatuhan hukum internal ERP CV. Batu Emas Group."
        : "Authorized signature binds internal CV. Batu Emas Group ERP standard compliance.",
      isTriggerActive: true,
      style: "OFFICIAL",
      alignment: type === "DUAL_SIGNATURE" ? "CENTER" : "RIGHT",
    };
  }

  // Specialized Body Templates by itemKey
  if (itemKey === "BUDGET_TABLE") {
    return {
      id,
      type: "TABLE",
      category: "BODY_TEXT",
      title: "Budget & Cost Estimation Breakdown",
      tableData: {
        headers: ["No", "Description / Material", "Qty & Unit", "Unit Price (IDR)", "Subtotal (IDR)"],
        rows: [
          ["1", "Portland Cement Type I (50 Kg)", "200 Bags", "68,000", "13,600,000"],
          ["2", "Coarse Silica Sand Lumajang", "4 Loads", "1,850,000", "7,400,000"],
          ["3", "Red Oxide Pigment Grade A", "10 Sacks", "450,000", "4,500,000"],
          ["", "ESTIMATED TOTAL BUDGET", "", "", "=SUM(ABOVE)"],
        ],
        columnAlignments: ["center", "left", "center", "right", "right"],
      },
      columnAlignments: ["center", "left", "center", "right", "right"],
      style: "NORMAL",
      alignment: "LEFT",
    };
  }

  if (itemKey === "CHECKLIST_BLOCK") {
    return {
      id,
      type: "LIST_POINTS",
      category: "BODY_TEXT",
      listStyle: "CHECKLIST",
      title: "Quality & Handover Inspection Checklist:",
      listItems: [
        "[PASS] Physical dimensions and thickness match SNI specifications.",
        "[PASS] Compressive strength test meets K-300 / K-400 grade.",
        "[PASS] Surface flatness and edges verified with zero micro-cracks.",
        "[PASS] Delivery quantity matches Delivery Order and Purchase Order.",
      ],
      alignment: "LEFT",
      style: "NORMAL",
    };
  }

  if (itemKey === "TERMS_BLOCK") {
    return {
      id,
      type: "LIST_POINTS",
      category: "BODY_TEXT",
      listStyle: "NUMBERED",
      title: "Commercial Terms & Conditions:",
      listItems: [
        "Listed prices are binding within the stated validity period.",
        "Payment shall be settled via official corporate bank account within 14 calendar days after Handover Certificate.",
        "Any volume or specification changes require an authorized revision document.",
        "Goods signed upon site delivery become the responsibility of the receiving party.",
      ],
      alignment: "LEFT",
      style: "NORMAL",
    };
  }

  // Footer Templates
  if (type === "FOOTER" || type === "FOOTER_BLOCK") {
    if (itemKey === "FOOTER_BANK_PAYMENT") {
      return {
        id,
        type: "FOOTER",
        category: "FOOTER_TEMPLATE",
        footerVariant: "BANK_PAYMENT",
        footerLeftText: "Bank BCA Cab. Banyuwangi • No. Rek: 180-099-8877 • A/N: CV. BATU EMAS GROUP",
        footerRightText: "FINANCE & TREASURY VERIFIED",
        title: "Bank BCA Cab. Banyuwangi • No. Rek: 180-099-8877 • A/N: CV. BATU EMAS GROUP",
        content: "FINANCE & TREASURY VERIFIED",
        alignment: "LEFT",
      };
    }
    if (itemKey === "FOOTER_ISO_COMPLIANCE") {
      return {
        id,
        type: "FOOTER",
        category: "FOOTER_TEMPLATE",
        footerVariant: "ISO_COMPLIANCE",
        footerLeftText: "CONTROLLED DOCUMENT — REV 01",
        footerRightText: "DIST: ALL PLANT DEPARTMENTS",
        title: "CONTROLLED DOCUMENT — REV 01",
        content: "DIST: ALL PLANT DEPARTMENTS",
        alignment: "LEFT",
      };
    }
    if (itemKey === "FOOTER_CONFIDENTIAL") {
      return {
        id,
        type: "FOOTER",
        category: "FOOTER_TEMPLATE",
        footerVariant: "CONFIDENTIAL",
        footerLeftText: "This document is strictly confidential property of CV. Batu Emas Group. Do not distribute without written consent.",
        footerRightText: "INTERNAL USE ONLY",
        title: "This document is strictly confidential property of CV. Batu Emas Group. Do not distribute without written consent.",
        content: "INTERNAL USE ONLY",
        alignment: "LEFT",
      };
    }
    return {
      id,
      type: "FOOTER",
      category: "FOOTER_TEMPLATE",
      footerVariant: "ERP_STANDARD",
      footerLeftText:
        "This document is computationally issued and validated. Valid without physical signature.",
      footerRightText: "OFFICIAL ERP DOCUMENT",
      subtitle: "OFFICIAL WORKSPACE DOCUMENT",
      title:
        "This document is computationally issued and validated. Valid without physical signature.",
      content: "OFFICIAL ERP DOCUMENT",
      alignment: "LEFT",
    };
  }

  if (type === "DIVIDER") {
    return {
      id,
      type: "DIVIDER",
      category: "BODY_TEXT",
      alignment: "CENTER",
    };
  }

  if (type === "PAGE_BREAK") {
    return {
      id,
      type: "PAGE_BREAK",
      category: "BODY_TEXT",
      alignment: "CENTER",
    };
  }

  if (type === "IMAGE") {
    return {
      id,
      type: "IMAGE",
      category: "BODY_TEXT",
      title: isId ? "Dokumentasi Visual / Lampiran Foto" : "Visual Documentation / Photo Attachment",
      content: isId ? "Foto Dokumentasi Lapangan / Pemeriksaan Fisik" : "Field Documentation / Physical Evidence",
      mediaData: {
        mediaType: "IMAGE",
        imageUrl: "",
        caption: isId
          ? "Keterangan Foto: Dokumentasi Lapangan / Bukti Fisik"
          : "Photo Caption: Field Documentation / Physical Evidence",
        widthPx: 440,
      },
      width: 440,
      alignment: "CENTER",
      style: "NORMAL",
    };
  }

  switch (type) {
    case "SENDER_ADDRESS":
      return {
        id,
        type,
        category: "ADDRESS_TEMPLATE",
        title: isId ? "ALAMAT PENGIRIM (FROM)" : "SENDER ADDRESS (FROM)",
        addressData: {
          companyName: "CV. Batu Emas Group",
          division: "Operations & Workshop Engineering Division",
          contactPerson: "Ir. Bambang Wijaya (Plant Manager)",
          streetAddress: "Dusun Petahunan, Jajag, Gambiran, Banyuwangi 68486",
          phone: "Ext. 204 / 0811-1111-3993",
          email: "workshop@pavingjoss.com",
        },
        style: "NORMAL",
        alignment: "LEFT",
      };
    case "RECIPIENT_ADDRESS":
      return {
        id,
        type,
        category: "ADDRESS_TEMPLATE",
        title: isId ? "ALAMAT TUJUAN / REKANAN (TO)" : "RECIPIENT / PARTNER (TO)",
        addressData: {
          companyName: "Attention: PT Mitra Semen Perkasa",
          division: "B2B Sales & Supply Chain Division",
          contactPerson: "Attn: Mr. Haryanto (Sales Representative)",
          streetAddress: "Gresik Industrial Estate Block C-12",
          cityStateZip: "Gresik, East Java",
          phone: "+62 811-9876-5432",
        },
        style: "NORMAL",
        alignment: "LEFT",
      };
    case "PROJECT_SITE_ADDRESS":
      return {
        id,
        type,
        category: "ADDRESS_TEMPLATE",
        title: isId ? "LOKASI PENGIRIMAN PROYEK LAPANGAN" : "PROJECT JOB SITE LOCATION",
        addressData: {
          companyName: "Java Estate Warehouse Project",
          siteLocation: "Lot B-08, Teluk Lamong Port Area",
          contactPerson: "Site Foreman: Mr. Slamet (+62 821-4455-6677)",
          streetAddress: "24-Hour Heavy Truck / Dump Truck Access",
        },
        style: "NORMAL",
        alignment: "LEFT",
      };
    case "HEADER":
      return {
        id,
        type,
        category: "BODY_TEXT",
        title: isId ? "MEMORANDUM RESMI INTERNAL" : "OFFICIAL INTERNAL MEMORANDUM",
        content: isId ? "No: MEMO/OPS/2026/X/001" : "Doc Ref: MEMO/OPS/2026/X/001",
        alignment: "CENTER",
        style: "NORMAL",
      };
    case "TEXT":
      return {
        id,
        type,
        category: "BODY_TEXT",
        content: isId
          ? "Sehubungan dengan evaluasi operasional pabrik, dokumen ini diterbitkan untuk memastikan seluruh prosedur dan alokasi sumber daya memenuhi standar baku mutu yang telah ditetapkan."
          : "In connection with plant operational evaluation, this document is issued to verify that all workflows comply with standard manufacturing protocols.",
        alignment: "LEFT",
        style: "NORMAL",
      };
    case "CALLOUT":
      return {
        id,
        type,
        category: "BODY_TEXT",
        title: isId ? "PERHATIAN KHUSUS & KETENTUAN MUTLAK" : "CRITICAL POLICY NOTICE",
        content: isId
          ? "Seluruh pengadaan dan perubahan alokasi wajib diotorisasi oleh pejabat departemen terkait sebelum tindakan fisik dimulai."
          : "All procurement and resource adjustments must be authorized by designated department heads prior to physical floor execution.",
        style: "WARNING",
        alignment: "LEFT",
      };
    case "LIST_POINTS":
      return {
        id,
        type,
        category: "BODY_TEXT",
        title: isId ? "Poin-Poin Instruksi & Regijakan:" : "Instruction Points & Policy Terms:",
        listItems: isId
          ? [
              "Verifikasi spesifikasi fisik komponen sebelum serah terima.",
              "Catat seluruh nomor seri / batch pada sistem ERP.",
              "Laporkan kendala teknis dalam kurun waktu maksimum 2 jam.",
            ]
          : [
              "Verify physical specifications before handover.",
              "Record all serial numbers and batch tags into ERP.",
              "Report any bottlenecks within a maximum of 2 hours.",
            ],
        alignment: "LEFT",
        style: "NORMAL",
      };
    case "TABLE":
      return {
        id,
        type,
        category: "BODY_TEXT",
        title: isId
          ? "Matriks Komponen Kebutuhan / Spesifikasi"
          : "Material & Component Specification Matrix",
        tableData: {
          headers: isId
            ? ["No", "Nama Komponen / Material", "Spesifikasi / Satuan", "Jumlah", "Keterangan"]
            : ["No", "Component / Material", "Spec / Unit", "Quantity", "Notes"],
          rows: [
            ["1", "Portland Cement Type 1", "50 Kg Bag", "200", "Primary Raw Material"],
            ["2", "Coarse Silica Sand", "Dump Truck (M3)", "12", "SNI Grade Aggregate"],
            ["3", "Red Oxide Pigment", "25 Kg Sack", "8", "Precision Red Paving"],
          ],
          columnAlignments: ["center", "left", "center", "right", "left"],
        },
        columnAlignments: ["center", "left", "center", "right", "left"],
        style: "NORMAL",
        alignment: "LEFT",
      };
    case "METADATA_GRID":
    default:
      return {
        id,
        type: "METADATA_GRID",
        category: "BODY_TEXT",
        title: "Document Reference Metadata",
        metaData: [
          { key: "Issued Date", value: new Date().toLocaleDateString("en-GB") },
          { key: "Urgency", value: "Standard Priority (Normal)" },
          { key: "Authoring Dept", value: department || "General" },
          { key: "Classification", value: "Internal Controlled ERP" },
        ],
        style: "NORMAL",
        alignment: "LEFT",
      };
  }
}


export interface DragGuideState {
  vertical?: { x: number; label: string };
  horizontal?: { y: number; label: string };
}

export interface ResizeState {
  blockId: string;
  handle: "se" | "e" | "s";
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

export interface DragState {
  blockId: string;
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
}

export const HISTORY_LIMIT = 60;
export const LIB_DRAG_MIME = "application/x-fhtbs-block";

export const BLOCK_TYPE_LABELS: Partial<Record<DocBlockType, string>> & Record<string, string> = {
  OFFICIAL_LETTERHEAD: "Letterhead",
  SENDER_ADDRESS: "Sender Address",
  RECIPIENT_ADDRESS: "Recipient Address",
  PROJECT_SITE_ADDRESS: "Project Site",
  CONTACT_CARD: "Contact Card",
  HEADER: "Header",
  TEXT: "Paragraph",
  CALLOUT: "Callout",
  LIST_POINTS: "Point List",
  TABLE: "Table",
  IMAGE: "Photo / Image",
  DIVIDER: "Divider",
  PAGE_BREAK: "Page Break",
  DOCUMENT_META: "Document Settings",
  FOOTER: "ERP Footer",
  FOOTER_BLOCK: "ERP Footer",
  METADATA_GRID: "Metadata",
  SIGNATURE_COLUMN: "Signature Column",
  SIGNATURE_STAMP: "Signature Stamp",
  DUAL_SIGNATURE: "Dual Signature",
};

export async function readAndCompressImageFile(
  file: File,
  maxDimension = 1200
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = () => {
      const rawUrl = String(reader.result || "");
      const img = new window.Image();
      img.onerror = () => resolve({ dataUrl: rawUrl, width: 440, height: 280 });
      img.onload = () => {
        let w = img.naturalWidth || 440;
        let h = img.naturalHeight || 280;
        if (w > maxDimension || h > maxDimension) {
          const ratio = Math.min(maxDimension / w, maxDimension / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        try {
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
            const compressed = canvas.toDataURL(mime, 0.88);
            const displayW = Math.min(620, Math.max(220, w));
            const displayH = Math.round((h / w) * displayW);
            resolve({ dataUrl: compressed, width: displayW, height: displayH });
            return;
          }
        } catch {
          // fallback to raw dataUrl
        }
        const displayW = Math.min(620, Math.max(220, w));
        const displayH = Math.round((h / w) * displayW);
        resolve({ dataUrl: rawUrl, width: displayW, height: displayH });
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

/** Utility to strip literal ** asterisks from text so bold is purely styled via CSS */
export function cleanBoldMarkdown(str: string): string {
  if (!str) return "";
  return str.replace(/\*\*/g, "");
}


