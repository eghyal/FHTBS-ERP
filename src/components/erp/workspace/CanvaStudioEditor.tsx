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
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  DocBlock,
  DocBlockType,
  BlockCategory,
  LayoutPreset,
  TargetDepartment,
  AuthorizationRole,
} from "@/types/workspace";
import { ERP_DEPARTMENT_OPTIONS } from "@/constants/rbac";

interface CanvaStudioEditorProps {
  documentId: string | null;
  initialTitle: string;
  initialDocType: string;
  initialDepartment: string;
  initialAuthRole: string;
  initialAuthDepartment?: string;
  initialAuthName?: string;
  initialBlocks: DocBlock[];
  initialLayoutPreset: LayoutPreset;
  onSave: (
    docData: {
      title: string;
      document_type: string;
      department: string;
      content: DocBlock[];
      layout_preset: LayoutPreset;
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
  TargetDepartment,
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
  FC: {
    role: "FC",
    deptNameId: "Full Control (FC)",
    deptNameEn: "Full Control (FC)",
    signatoryTitleId: "Factory Controller / Super Admin",
    signatoryTitleEn: "Factory Controller / Super Admin",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Dokumen ini diteruskan ke Factory Controller (FC) untuk otorisasi penuh.",
    descriptionEn: "This document routes to Factory Controller (FC) for full authorization.",
  },
  HR: {
    role: "HR",
    deptNameId: "Human Resource (HR)",
    deptNameEn: "Human Resource (HR)",
    signatoryTitleId: "Human Resources Manager",
    signatoryTitleEn: "Human Resources Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Dokumen ini diteruskan ke Departemen Human Resource (HR) untuk otorisasi.",
    descriptionEn: "This document routes to Human Resources (HR) for authorization.",
  },
  ENGINEERING: {
    role: "ENGINEERING",
    deptNameId: "Engineering",
    deptNameEn: "Engineering",
    signatoryTitleId: "Engineering Lead / Specialist",
    signatoryTitleEn: "Engineering Lead / Specialist",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Dokumen ini diteruskan ke Departemen Engineering untuk verifikasi teknis.",
    descriptionEn: "This document routes to Engineering Department for technical verification.",
  },
  PURCHASING: {
    role: "PURCHASING",
    deptNameId: "Purchasing",
    deptNameEn: "Purchasing",
    signatoryTitleId: "Purchasing Manager (Manager Pengadaan)",
    signatoryTitleEn: "Purchasing Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Dokumen ini diteruskan ke Departemen Purchasing untuk verifikasi dan otorisasi.",
    descriptionEn: "This document routes to Purchasing Department for verification and authorization.",
  },
  WAREHOUSE: {
    role: "WAREHOUSE",
    deptNameId: "Warehouse",
    deptNameEn: "Warehouse",
    signatoryTitleId: "Warehouse Supervisor",
    signatoryTitleEn: "Warehouse Supervisor",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Dokumen ini diteruskan ke Departemen Warehouse untuk validasi stok fisik.",
    descriptionEn: "This document routes to Warehouse Department for physical stock validation.",
  },
  PRODUCTION: {
    role: "PRODUCTION",
    deptNameId: "Production",
    deptNameEn: "Production",
    signatoryTitleId: "Production Manager",
    signatoryTitleEn: "Production Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Dokumen ini diteruskan ke Departemen Production untuk operasional pabrik.",
    descriptionEn: "This document routes to Production Department for plant operations.",
  },
  SALES: {
    role: "SALES",
    deptNameId: "Sales",
    deptNameEn: "Sales",
    signatoryTitleId: "Sales & Commercial Manager",
    signatoryTitleEn: "Sales & Commercial Manager",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Dokumen ini diteruskan ke Departemen Sales untuk komersial & komitmen pelanggan.",
    descriptionEn: "This document routes to Sales Department for commercial commitment.",
  },
  FINANCE: {
    role: "SALES",
    deptNameId: "Sales",
    deptNameEn: "Sales",
    signatoryTitleId: "Sales & Finance Head",
    signatoryTitleEn: "Sales & Finance Head",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Dokumen ini diteruskan ke Sales untuk otorisasi.",
    descriptionEn: "This document routes to Sales for authorization.",
  },
  FACTORY_CONTROLLER: {
    role: "FC",
    deptNameId: "Full Control (FC)",
    deptNameEn: "Full Control (FC)",
    signatoryTitleId: "Factory Controller",
    signatoryTitleEn: "Factory Controller",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Dokumen ini diteruskan ke Factory Controller (FC).",
    descriptionEn: "This document routes to Factory Controller (FC).",
  },
  MANAGEMENT: {
    role: "FC",
    deptNameId: "Full Control (FC)",
    deptNameEn: "Full Control (FC)",
    signatoryTitleId: "Plant Head / FC",
    signatoryTitleEn: "Plant Head / FC",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Dokumen ini diteruskan ke Full Control (FC).",
    descriptionEn: "This document routes to Full Control (FC).",
  },
  GENERAL: {
    role: "FC",
    deptNameId: "Full Control (FC)",
    deptNameEn: "Full Control (FC)",
    signatoryTitleId: "General Administrator / FC",
    signatoryTitleEn: "General Administrator / FC",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-900 font-bold",
    descriptionId: "Dokumen ini diteruskan ke Full Control (FC).",
    descriptionEn: "This document routes to Full Control (FC).",
  },
};

// Standard Official Kop Surat CV. BATU EMAS GROUP (Permanent & Locked - Matching Exported Quotations)
export const OFFICIAL_KOP_SURAT_BLOCK: DocBlock = {
  id: "blk-official-letterhead",
  type: "OFFICIAL_LETTERHEAD",
  category: "ADDRESS_TEMPLATE",
  title: "CV. BATU EMAS GROUP",
  subtitle: "PRODUSEN & SUPPLIER UTAMA PAVING BLOCK, BATAKO & BETON PRACETAK",
  isLocked: true,
  addressData: {
    companyName: "CV. BATU EMAS GROUP",
    division: "Pabrik Utama & Kantor Banyuwangi",
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
interface LibraryItem {
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

const LIBRARY_ITEMS: LibraryItem[] = [
  // Body text
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
    key: "TEXT",
    type: "TEXT",
    category: "BODY_TEXT",
    icon: AlignLeft,
    labelId: "Paragraf Teks",
    labelEn: "Paragraph Text",
    descId: "Blok narasi paragraf standar dengan jarak baris proporsional.",
    descEn: "Standard paragraph narrative block with balanced line height.",
    accent: "bg-stone-100 text-stone-700",
    keywords: "teks paragraf isi narasi text paragraph body",
  },
  {
    key: "CALLOUT",
    type: "CALLOUT",
    category: "BODY_TEXT",
    icon: AlertTriangle,
    labelId: "Kotak Catatan Penting",
    labelEn: "Highlight Callout Box",
    descId: "Callout box dengan latar lembut untuk instruksi penting.",
    descEn: "Soft callout box for critical notices.",
    accent: "bg-amber-100 text-amber-700",
    keywords: "callout catatan penting warning perhatian highlight",
  },
  {
    key: "LIST_POINTS",
    type: "LIST_POINTS",
    category: "BODY_TEXT",
    icon: ListOrdered,
    labelId: "Poin Regulasi & Kebijakan",
    labelEn: "Numbered Policy Points",
    descId: "Daftar bernomor untuk butir-butir syarat atau ketentuan resmi.",
    descEn: "Numbered list for official terms and conditions.",
    accent: "bg-stone-100 text-stone-700",
    keywords: "list poin nomor butir ketentuan bullet numbered",
  },
  {
    key: "TABLE",
    type: "TABLE",
    category: "BODY_TEXT",
    icon: TableIcon,
    labelId: "Tabel Spesifikasi",
    labelEn: "Specification Table",
    descId: "Tabel matriks dengan kolom header dan baris yang bisa diedit penuh.",
    descEn: "Fully editable matrix table with headers and rows.",
    accent: "bg-stone-100 text-stone-700",
    keywords: "tabel tabel data matriks table grid rows",
  },
  {
    key: "METADATA_GRID",
    type: "METADATA_GRID",
    category: "BODY_TEXT",
    icon: Layers,
    labelId: "Grid Metadata",
    labelEn: "Metadata Grid",
    descId: "Kotak key-value untuk tanggal, sifat surat, dan klasifikasi.",
    descEn: "Key-value grid for dates, classification and meta info.",
    accent: "bg-stone-100 text-stone-700",
    keywords: "metadata grid info key value parameter",
  },
  // Address templates
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
    labelId: "Alamat Pengirim (From)",
    labelEn: "Sender Address (From)",
    descId: "Identitas divisi internal pengirim, kontak ekstensi, dan penanggung jawab.",
    descEn: "Internal sender identity block with contacts.",
    accent: "bg-stone-100 text-stone-700",
    keywords: "alamat pengirim from sender address divisi",
  },
  {
    key: "RECIPIENT_ADDRESS",
    type: "RECIPIENT_ADDRESS",
    category: "ADDRESS_TEMPLATE",
    icon: Building2,
    labelId: "Alamat Rekanan (To)",
    labelEn: "Recipient Address (To)",
    descId: "Format tujuan surat resmi kepada vendor, supplier, atau customer.",
    descEn: "Formal recipient block for vendors and customers.",
    accent: "bg-blue-100 text-blue-700",
    keywords: "alamat tujuan penerima to vendor rekanan recipient",
  },
  {
    key: "PROJECT_SITE_ADDRESS",
    type: "PROJECT_SITE_ADDRESS",
    category: "ADDRESS_TEMPLATE",
    icon: MapPin,
    labelId: "Lokasi Proyek / Job Site",
    labelEn: "Project Site Location",
    descId: "Alamat serah terima lapangan, akses truk, dan kontak mandor.",
    descEn: "Field delivery address, truck access and foreman contact.",
    accent: "bg-emerald-100 text-emerald-700",
    keywords: "lokasi proyek site lapangan alamat kirim",
  },
  // Signature columns (auto-routing triggers)
  {
    key: "SIG_PURCHASING",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "PURCHASING",
    icon: PenTool,
    labelId: "TTD Purchasing",
    labelEn: "Purchasing Signature",
    descId: "Auto-routing ke Manager Pengadaan untuk verifikasi & otorisasi.",
    descEn: "Auto-routes to the Purchasing Manager for authorization.",
    accent: "bg-blue-100 text-blue-700",
    keywords: "ttd tanda tangan signature purchasing pengadaan",
  },
  {
    key: "SIG_FINANCE",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "FINANCE",
    icon: PenTool,
    labelId: "TTD Finance",
    labelEn: "Finance Signature",
    descId: "Auto-routing ke Head of Finance untuk verifikasi anggaran.",
    descEn: "Auto-routes to the Head of Finance for budget verification.",
    accent: "bg-emerald-100 text-emerald-700",
    keywords: "ttd tanda tangan signature finance keuangan anggaran",
  },
  {
    key: "SIG_PRODUCTION",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "PRODUCTION",
    icon: PenTool,
    labelId: "TTD Produksi",
    labelEn: "Production Signature",
    descId: "Auto-routing ke Production Manager untuk instruksi lini pabrik.",
    descEn: "Auto-routes to the Production Manager for floor instructions.",
    accent: "bg-amber-100 text-amber-700",
    keywords: "ttd tanda tangan signature produksi pabrik plant",
  },
  {
    key: "SIG_FC",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "FACTORY_CONTROLLER",
    icon: PenTool,
    labelId: "TTD Factory Controller",
    labelEn: "Factory Controller Signature",
    descId: "Auto-routing ke Factory Controller untuk audit kepatuhan.",
    descEn: "Auto-routes to the Factory Controller for compliance audit.",
    accent: "bg-purple-100 text-purple-700",
    keywords: "ttd tanda tangan signature fc factory controller audit",
  },
  {
    key: "SIG_MANAGEMENT",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "MANAGEMENT",
    icon: PenTool,
    labelId: "TTD Direksi / GM",
    labelEn: "Executive / GM Signature",
    descId: "Otorisasi tertinggi Direksi / General Manager.",
    descEn: "Top-level authorization by Executive / General Manager.",
    accent: "bg-indigo-100 text-indigo-700",
    keywords: "ttd tanda tangan signature direksi gm manajemen",
  },
  {
    key: "SIG_WAREHOUSE",
    type: "SIGNATURE_COLUMN",
    category: "SIGNATURE_COLUMN",
    dept: "WAREHOUSE",
    icon: PenTool,
    labelId: "TTD Gudang",
    labelEn: "Warehouse Signature",
    descId: "Auto-routing ke Supervisor Gudang untuk validasi material.",
    descEn: "Auto-routes to the Warehouse Supervisor for validation.",
    accent: "bg-cyan-100 text-cyan-700",
    keywords: "ttd tanda tangan signature gudang warehouse logistik",
  },
  {
    key: "DUAL_SIGNATURE",
    type: "DUAL_SIGNATURE",
    category: "SIGNATURE_COLUMN",
    dept: "PURCHASING",
    icon: UserCheck,
    labelId: "Dual Signature",
    labelEn: "Dual Signature",
    descId: "2 kolom: tanda tangan pembuat di kiri & otorisator di kanan.",
    descEn: "Two columns: creator signature left, authorizer right.",
    accent: "bg-stone-100 text-stone-700",
    keywords: "ttd tanda tangan signature dual dua kolom",
  },
];

const CATEGORY_META: Record<BlockCategory, { labelId: string; labelEn: string }> = {
  BODY_TEXT: { labelId: "Teks & Struktur", labelEn: "Text & Structure" },
  ADDRESS_TEMPLATE: { labelId: "Alamat & Kop", labelEn: "Address & Letterhead" },
  SIGNATURE_COLUMN: { labelId: "Kolom Tanda Tangan", labelEn: "Signature Columns" },
};

/* ============================================================
 * BLOCK FACTORY — creates a fresh block with sensible defaults
 * ==========================================================*/
let blockSeq = 0;
function newBlockId() {
  blockSeq += 1;
  return `blk-${Date.now().toString(36)}-${blockSeq}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildBlock(
  type: DocBlockType,
  isId: boolean,
  department: string,
  customDept?: TargetDepartment
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
        ? "Pengesahan dokumen ini mengikat dan memiliki kepatuhan hukum internal ERP Paving Joss."
        : "Authorized signature binds internal Paving Joss ERP standard compliance.",
      isTriggerActive: true,
      style: "OFFICIAL",
      alignment: "CENTER",
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
          division: "Divisi Operasional & Rekayasa Workshop",
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
        title: isId ? "ALAMAT TUJUAN / REKANAN (TO)" : "RECIPIENT / REKANAN (TO)",
        addressData: {
          companyName: "Kepada Yth: PT Mitra Semen Perkasa",
          division: "Divisi Sales & Supply Chain B2B",
          contactPerson: "Up: Bpk. Haryanto (Sales Representative)",
          streetAddress: "Kawasan Industri Gresik Blok C-12",
          cityStateZip: "Gresik, Jawa Timur",
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
          companyName: "Proyek Pergudangan Java Estate",
          siteLocation: "Kavling B-08, Area Pelabuhan Teluk Lamong",
          contactPerson: "Mandor Lapangan: Pak Slamet (+62 821-4455-6677)",
          streetAddress: "Akses Truk Tronton / Dump Truck 24 Jam",
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
        title: isId ? "Poin-Poin Instruksi & Regulasi:" : "Instruction Points & Policy Terms:",
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
            ["1", "Semen Portland Tipe 1", "Sak 50 Kg", "200", "Bahan Baku Utama"],
            ["2", "Pasir Silika Kasar", "Dump Truck (M3)", "12", "Gradasi Sesuai SNI"],
            ["3", "Pigmen Pewarna Merah", "Sak 25 Kg", "8", "Paving Merah Presisi"],
          ],
        },
        style: "NORMAL",
        alignment: "LEFT",
      };
    case "METADATA_GRID":
    default:
      return {
        id,
        type: "METADATA_GRID",
        category: "BODY_TEXT",
        title: isId ? "Informasi Singkat Dokumen" : "Document Quick Metadata",
        metaData: [
          { key: isId ? "Tanggal Terbit" : "Issued Date", value: new Date().toLocaleDateString("id-ID") },
          { key: isId ? "Tingkat Urgensi" : "Urgency", value: "Prioritas Standar (Normal)" },
          { key: isId ? "Departemen Pembuat" : "Authoring Dept", value: department || "General" },
          { key: isId ? "Kerahasiaan" : "Confidentiality", value: "Internal Paving Joss Only" },
        ],
        style: "NORMAL",
        alignment: "LEFT",
      };
  }
}

/* ============================================================
 * SMALL INLINE-EDIT PRIMITIVES
 * ==========================================================*/
interface InlineTextProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  editable: boolean;
  multiline?: boolean;
  onEnter?: () => void;
  style?: React.CSSProperties;
  onFocus?: () => void;
}

/** Utility to strip literal ** asterisks from text so bold is purely styled via CSS */
function cleanBoldMarkdown(str: string): string {
  if (!str) return "";
  return str.replace(/\*\*/g, "");
}

/** Single-line inline input that blends into the document canvas. */
function InlineInput({ value, onChange, className, placeholder, editable, onEnter, style, onFocus }: InlineTextProps) {
  const cleanVal = cleanBoldMarkdown(value || "");

  if (!editable) {
    return <span style={style} className={className}>{cleanVal || <span className="opacity-40">{placeholder}</span>}</span>;
  }
  return (
    <input
      type="text"
      value={cleanVal}
      placeholder={placeholder}
      onChange={(e) => onChange(cleanBoldMarkdown(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
        e.stopPropagation();
      }}
      onFocus={() => {
        if (onFocus) onFocus();
      }}
      onMouseDown={(e) => {
        if (onFocus) onFocus();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      style={style}
      className={cn(
        "bg-transparent outline-none w-full rounded-sm transition-colors",
        "hover:bg-blue-50/60 focus:bg-blue-50/80 focus:ring-1 focus:ring-blue-400/50",
        className
      )}
    />
  );
}

/** Auto-growing textarea for paragraph blocks that expands to container height without text clipping. */
function InlineTextarea({ value, onChange, className, placeholder, editable, style, onFocus }: InlineTextProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const cleanVal = cleanBoldMarkdown(value || "");

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      const parentH = el.parentElement?.clientHeight || 0;
      el.style.height = `${Math.max(el.scrollHeight + 2, parentH)}px`;
    }
  }, [cleanVal, editable]);

  if (!editable) {
    return (
      <div style={style} className={cn("whitespace-pre-line w-full h-full min-h-full", className)}>
        {cleanVal || <span className="opacity-40">{placeholder}</span>}
      </div>
    );
  }
  return (
    <textarea
      ref={ref}
      value={cleanVal}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => onChange(cleanBoldMarkdown(e.target.value))}
      onKeyDown={(e) => e.stopPropagation()}
      onFocus={() => {
        if (onFocus) onFocus();
      }}
      onMouseDown={(e) => {
        if (onFocus) onFocus();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      style={style}
      className={cn(
        "bg-transparent outline-none w-full min-h-full resize-none rounded-sm transition-colors",
        "hover:bg-blue-50/60 focus:bg-blue-50/80 focus:ring-1 focus:ring-blue-400/50",
        className
      )}
    />
  );
}

/* ============================================================
 * BLOCK CONTENT RENDERER (inline-editable when `editable`)
 * ==========================================================*/
interface BlockContentProps {
  block: DocBlock;
  editable: boolean;
  isId: boolean;
  documentId: string | null;
  department: string;
  isSelected: boolean;
  onUpdate: (updates: Partial<DocBlock>) => void;
  onSelectBlock?: () => void;
  onTableColResizeStart?: (e: React.MouseEvent, blockId: string, colIndex: number, currentWidth: number) => void;
  onTableRowResizeStart?: (e: React.MouseEvent, blockId: string, rowIndex: number, currentHeight: number) => void;
}

function BlockContent({
  block,
  editable,
  isId,
  documentId,
  department,
  isSelected,
  onUpdate,
  onSelectBlock,
  onTableColResizeStart,
  onTableRowResizeStart,
}: BlockContentProps) {
  const updateAddress = (field: keyof NonNullable<DocBlock["addressData"]>, value: string) => {
    onUpdate({ addressData: { ...block.addressData, [field]: value } });
  };

  const updateListItem = (idx: number, value: string) => {
    const items = [...(block.listItems || [])];
    items[idx] = value;
    onUpdate({ listItems: items });
  };
  const addListItem = (afterIdx: number) => {
    const items = [...(block.listItems || [])];
    items.splice(afterIdx + 1, 0, "");
    onUpdate({ listItems: items });
  };
  const removeListItem = (idx: number) => {
    const items = [...(block.listItems || [])];
    items.splice(idx, 1);
    onUpdate({ listItems: items });
  };

  const updateHeader = (idx: number, value: string) => {
    if (!block.tableData) return;
    const headers = [...block.tableData.headers];
    headers[idx] = value;
    onUpdate({ tableData: { ...block.tableData, headers } });
  };
  const updateCell = (r: number, c: number, value: string) => {
    if (!block.tableData) return;
    const rows = block.tableData.rows.map((row, ri) =>
      ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row
    );
    onUpdate({ tableData: { ...block.tableData, rows } });
  };
  const addRow = () => {
    if (!block.tableData) return;
    const colCount = block.tableData.headers.length;
    onUpdate({
      tableData: {
        ...block.tableData,
        rows: [...block.tableData.rows, Array.from({ length: colCount }, () => "")],
      },
    });
  };
  const removeRow = () => {
    if (!block.tableData || block.tableData.rows.length <= 1) return;
    onUpdate({
      tableData: { ...block.tableData, rows: block.tableData.rows.slice(0, -1) },
    });
  };
  const addCol = () => {
    if (!block.tableData) return;
    onUpdate({
      tableData: {
        headers: [...block.tableData.headers, isId ? `Kolom ${block.tableData.headers.length + 1}` : `Column ${block.tableData.headers.length + 1}`],
        rows: block.tableData.rows.map((r) => [...r, ""]),
      },
    });
  };
  const removeCol = () => {
    if (!block.tableData || block.tableData.headers.length <= 1) return;
    onUpdate({
      tableData: {
        headers: block.tableData.headers.slice(0, -1),
        rows: block.tableData.rows.map((r) => r.slice(0, -1)),
      },
    });
  };

  const updateMeta = (idx: number, field: "key" | "value", value: string) => {
    const meta = [...(block.metaData || [])];
    meta[idx] = { ...meta[idx], [field]: value };
    onUpdate({ metaData: meta });
  };
  const addMeta = () => {
    onUpdate({ metaData: [...(block.metaData || []), { key: "", value: "" }] });
  };
  const removeMeta = (idx: number) => {
    const meta = [...(block.metaData || [])];
    meta.splice(idx, 1);
    onUpdate({ metaData: meta });
  };

  const alignClass =
    block.alignment === "CENTER"
      ? "text-center"
      : block.alignment === "RIGHT"
      ? "text-right"
      : block.alignment === "JUSTIFY"
      ? "text-justify"
      : "text-left";

  const blockTextStyle: React.CSSProperties = {
    fontSize: block.fontSize ? `${block.fontSize}px` : undefined,
    fontWeight: block.isBold ? 700 : undefined,
    fontStyle: block.isItalic ? "italic" : undefined,
    textDecoration:
      block.isUnderline && block.isStrikethrough
        ? "underline line-through"
        : block.isUnderline
        ? "underline"
        : block.isStrikethrough
        ? "line-through"
        : undefined,
    color: block.textColor || undefined,
    backgroundColor: block.highlightColor || undefined,
  };

  switch (block.type) {
    /* --- 1. OFFICIAL LETTERHEAD (locked, read-only) --- */
    case "OFFICIAL_LETTERHEAD":
      return (
        <div className="w-full border-b-[2.5px] border-black pb-3 mb-2 bg-white relative z-10 flex items-center gap-4 shrink-0 select-none">
          <div className="w-13 h-13 shrink-0 flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-black tracking-tight uppercase leading-none mb-1 text-base sm:text-lg">
              {block.title || "CV. BATU EMAS GROUP"}
            </h1>
            <div className="font-semibold text-stone-700 leading-normal text-[10.5px]">
              {block.addressData?.streetAddress ||
                "Dusun Petahunan, Jajag, Gambiran, Banyuwangi Regency, East Java 68486"}
              <br />
              <span className="font-bold text-black">Phone:</span> {block.addressData?.phone || "0811-1111-3993"}{" "}
              &nbsp;|&nbsp; <span className="font-bold text-black">Email:</span>{" "}
              {block.addressData?.email || "pavingjoss@gmail.com"}
            </div>
          </div>
          <div className="flex items-center gap-3 text-right shrink-0">
            <div className="flex flex-col items-end">
              <div className="font-bold tracking-widest uppercase mb-0.5 text-[9px] text-stone-500">
                Valid Doc ID:
              </div>
              <div className="font-mono font-bold text-black border border-stone-300 px-2 py-0.5 bg-stone-50 rounded-xs text-[10px]">
                {documentId || "REF/QUO/2026"}
              </div>
            </div>
            <div className="w-11 h-11 bg-white border border-stone-300 p-0.5 flex items-center justify-center shrink-0 rounded-xs shadow-2xs">
              <QRCodeSVG
                value={`https://fhtbs-erp.shared/doc/${documentId || "REF/QUO/2026"}`}
                size={38}
                level="M"
                fgColor="#000000"
              />
            </div>
          </div>
        </div>
      );

    /* --- 2. ADDRESS BLOCKS --- */
    case "SENDER_ADDRESS":
    case "RECIPIENT_ADDRESS":
    case "PROJECT_SITE_ADDRESS": {
      const palette =
        block.type === "RECIPIENT_ADDRESS"
          ? "bg-blue-50/50 border-blue-200/80"
          : block.type === "PROJECT_SITE_ADDRESS"
          ? "bg-emerald-50/50 border-emerald-200/80"
          : "bg-stone-50 border-stone-200";
      const labelColor =
        block.type === "RECIPIENT_ADDRESS"
          ? "text-blue-600"
          : block.type === "PROJECT_SITE_ADDRESS"
          ? "text-emerald-700"
          : "text-stone-400";
      const a = block.addressData || {};
      return (
        <div className={cn("border rounded-xl p-3.5 space-y-1 text-xs", palette)}>
          <InlineInput
            editable={editable}
            value={block.title || ""}
            onChange={(v) => onUpdate({ title: v })}
            placeholder={isId ? "Label blok alamat" : "Address block label"}
            className={cn("text-[10px] font-black uppercase tracking-wider", labelColor)}
          />
          <InlineInput
            editable={editable}
            value={a.companyName || ""}
            onChange={(v) => updateAddress("companyName", v)}
            placeholder={isId ? "Nama perusahaan / penerima" : "Company / recipient name"}
            className="font-bold text-stone-900 text-sm"
          />
          <InlineInput
            editable={editable}
            value={a.division || a.siteLocation || ""}
            onChange={(v) =>
              updateAddress(block.type === "PROJECT_SITE_ADDRESS" ? "siteLocation" : "division", v)
            }
            placeholder={isId ? "Divisi / lokasi site" : "Division / site location"}
            className="text-stone-700 font-medium"
          />
          <InlineInput
            editable={editable}
            value={a.streetAddress || ""}
            onChange={(v) => updateAddress("streetAddress", v)}
            placeholder={isId ? "Alamat jalan" : "Street address"}
            className="text-stone-600 text-[11px]"
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500 font-mono">
            <InlineInput
              editable={editable}
              value={a.contactPerson || ""}
              onChange={(v) => updateAddress("contactPerson", v)}
              placeholder={isId ? "Kontak person" : "Contact person"}
              className="flex-1 min-w-40"
            />
            <InlineInput
              editable={editable}
              value={a.phone || ""}
              onChange={(v) => updateAddress("phone", v)}
              placeholder={isId ? "Telepon" : "Phone"}
              className="w-44"
            />
          </div>
        </div>
      );
    }

    /* --- 3. HEADER --- */
    case "HEADER":
      return (
        <div className={cn("space-y-1 py-2", alignClass)} style={blockTextStyle}>
          <InlineInput
            editable={editable}
            value={block.title || ""}
            onChange={(v) => onUpdate({ title: v })}
            onFocus={onSelectBlock}
            placeholder={isId ? "JUDUL DOKUMEN" : "DOCUMENT TITLE"}
            style={{ fontSize: block.fontSize ? `${block.fontSize}px` : undefined }}
            className="text-lg font-black tracking-tight text-stone-950 uppercase text-inherit"
          />
          <InlineInput
            editable={editable}
            value={block.content || ""}
            onChange={(v) => onUpdate({ content: v })}
            onFocus={onSelectBlock}
            placeholder="NO: REF/PJ/001"
            className="text-xs font-bold text-stone-500 font-mono tracking-wider text-inherit"
          />
        </div>
      );

    /* --- 4. TEXT PARAGRAPH --- */
    case "TEXT":
      return (
        <div className="w-full h-full min-h-full flex flex-col justify-start flex-1">
          <InlineTextarea
            editable={editable}
            value={block.content || ""}
            onChange={(v) => onUpdate({ content: v })}
            onFocus={onSelectBlock}
            placeholder={isId ? "Ketik isi paragraf di sini..." : "Type paragraph content here..."}
            style={blockTextStyle}
            className={cn(
              "text-xs text-stone-800 leading-relaxed w-full h-full min-h-full flex-1",
              alignClass,
              block.isBold ? "font-bold text-stone-950" : "font-normal"
            )}
          />
        </div>
      );

    /* --- 5. CALLOUT --- */
    case "CALLOUT":
      return (
        <div
          className={cn(
            "p-4 rounded-xl border space-y-1 text-xs w-full h-full min-h-full flex flex-col justify-start",
            block.style === "WARNING"
              ? "bg-amber-50/80 border-amber-300"
              : block.style === "SUCCESS"
              ? "bg-emerald-50/80 border-emerald-300"
              : "bg-blue-50/80 border-blue-300"
          )}
        >
          <div className="font-bold flex items-center gap-1.5 uppercase text-[11px] tracking-wide shrink-0">
            <AlertTriangle
              className={cn(
                "w-3.5 h-3.5 shrink-0",
                block.style === "WARNING"
                  ? "text-amber-600"
                  : block.style === "SUCCESS"
                  ? "text-emerald-600"
                  : "text-blue-600"
              )}
            />
            <InlineInput
              editable={editable}
              value={block.title || ""}
              onChange={(v) => onUpdate({ title: v })}
              onFocus={onSelectBlock}
              placeholder={isId ? "Judul catatan" : "Callout title"}
              className="uppercase"
            />
          </div>
          <InlineTextarea
            editable={editable}
            value={block.content || ""}
            onChange={(v) => onUpdate({ content: v })}
            onFocus={onSelectBlock}
            placeholder={isId ? "Isi catatan penting..." : "Callout content..."}
            style={blockTextStyle}
            className={cn(
              "leading-relaxed text-stone-800 flex-1 w-full h-full min-h-full",
              block.isBold ? "font-bold" : "font-medium"
            )}
          />
        </div>
      );

    /* --- 6. LIST POINTS --- */
    case "LIST_POINTS":
      return (
        <div className="space-y-1.5 text-xs text-stone-800">
          <InlineInput
            editable={editable}
            value={block.title || ""}
            onChange={(v) => onUpdate({ title: v })}
            placeholder={isId ? "Judul daftar (opsional)" : "List title (optional)"}
            className="font-bold text-stone-900"
          />
          <ol className="space-y-1">
            {(block.listItems || []).map((item, liIdx) => (
              <li key={liIdx} className="flex items-start gap-2 group/li">
                <span className="text-stone-400 font-bold shrink-0 w-5 text-right select-none">
                  {liIdx + 1}.
                </span>
                <InlineInput
                  editable={editable}
                  value={item}
                  onChange={(v) => updateListItem(liIdx, v)}
                  onEnter={() => addListItem(liIdx)}
                  placeholder={isId ? "Tulis poin..." : "Write a point..."}
                  className="flex-1 leading-relaxed"
                />
                {editable && isSelected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeListItem(liIdx);
                    }}
                    className="opacity-0 group-hover/li:opacity-100 p-0.5 text-stone-300 hover:text-rose-500 transition-opacity cursor-pointer shrink-0"
                    title={isId ? "Hapus poin" : "Remove point"}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {editable && isSelected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                addListItem((block.listItems || []).length - 1);
              }}
              className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              {isId ? "Tambah poin" : "Add point"}
            </button>
          )}
        </div>
      );

    /* --- 7. TABLE (fully editable with column & row resizing) --- */
    case "TABLE": {
      const td = block.tableData || { headers: [], rows: [] };
      const colWidths = td.colWidths || [];
      const rowHeights = td.rowHeights || [];

      const vAlignClass =
        block.verticalAlignment === "TOP"
          ? "align-top"
          : block.verticalAlignment === "BOTTOM"
          ? "align-bottom"
          : "align-middle";

      return (
        <div className="space-y-1.5 text-xs">
          <InlineInput
            editable={editable}
            value={block.title || ""}
            onChange={(v) => onUpdate({ title: v })}
            placeholder={isId ? "Judul tabel (opsional)" : "Table title (optional)"}
            className="font-bold text-stone-900"
          />
          <div className="overflow-x-auto border border-stone-200 rounded-xl relative select-none">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200">
                  {td.headers.map((h, hIdx) => {
                    const colW = colWidths[hIdx] || 120;
                    return (
                      <th
                        key={hIdx}
                        style={{ width: `${colW}px` }}
                        className={cn(
                          "p-1 relative group/th border-r border-stone-200/80 last:border-r-0 transition-colors",
                          vAlignClass
                        )}
                      >
                        <InlineInput
                          editable={editable}
                          value={h}
                          onChange={(v) => updateHeader(hIdx, v)}
                          placeholder={`Kolom ${hIdx + 1}`}
                          className="font-bold text-stone-700 px-1.5 py-1"
                        />
                        {editable && isSelected && onTableColResizeStart && (
                          <div
                            onMouseDown={(e) => onTableColResizeStart(e, block.id, hIdx, colW)}
                            className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/80 z-20 group-hover/th:bg-blue-400/50 transition-colors"
                            title={isId ? "Seret untuk meresize lebar kolom" : "Drag to resize column width"}
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {td.rows.map((row, rIdx) => {
                  const rowH = rowHeights[rIdx] || 36;
                  return (
                    <tr
                      key={rIdx}
                      style={{ height: `${rowH}px` }}
                      className="border-b border-stone-100 hover:bg-stone-50/50 relative group/tr"
                    >
                      {row.map((cell, cIdx) => {
                        const colW = colWidths[cIdx] || 120;
                        return (
                          <td
                            key={cIdx}
                            style={{ width: `${colW}px` }}
                            className={cn(
                              "p-1 relative border-r border-stone-100 last:border-r-0",
                              vAlignClass
                            )}
                          >
                            <InlineInput
                              editable={editable}
                              value={cell}
                              onChange={(v) => updateCell(rIdx, cIdx, v)}
                              placeholder="—"
                              className="text-stone-800 px-1.5 py-1"
                            />
                            {editable && isSelected && onTableColResizeStart && (
                              <div
                                onMouseDown={(e) => onTableColResizeStart(e, block.id, cIdx, colW)}
                                className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/80 z-20 transition-colors"
                              />
                            )}
                          </td>
                        );
                      })}
                      {editable && isSelected && onTableRowResizeStart && (
                        <td className="p-0 border-none w-0">
                          <div
                            onMouseDown={(e) => onTableRowResizeStart(e, block.id, rIdx, rowH)}
                            className="absolute left-0 right-0 bottom-0 h-2 cursor-row-resize hover:bg-blue-500/80 z-20 group-hover/tr:bg-blue-400/50 transition-colors"
                            title={isId ? "Seret untuk meresize tinggi baris" : "Drag to resize row height"}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {editable && isSelected && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); addRow(); }}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> {isId ? "Baris" : "Row"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); removeRow(); }}
                disabled={td.rows.length <= 1}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white text-stone-600 border border-stone-200 hover:bg-stone-100 disabled:opacity-40 cursor-pointer flex items-center gap-1"
              >
                <Minus className="w-3 h-3" /> {isId ? "Baris" : "Row"}
              </button>
              <span className="w-px h-4 bg-stone-200" />
              <button
                onClick={(e) => { e.stopPropagation(); addCol(); }}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> {isId ? "Kolom" : "Column"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); removeCol(); }}
                disabled={td.headers.length <= 1}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white text-stone-600 border border-stone-200 hover:bg-stone-100 disabled:opacity-40 cursor-pointer flex items-center gap-1"
              >
                <Minus className="w-3 h-3" /> {isId ? "Kolom" : "Column"}
              </button>
            </div>
          )}
        </div>
      );
    }

    /* --- 8. METADATA GRID --- */
    case "METADATA_GRID":
      return (
        <div className="space-y-2">
          <InlineInput
            editable={editable}
            value={block.title || ""}
            onChange={(v) => onUpdate({ title: v })}
            placeholder={isId ? "Judul grid (opsional)" : "Grid title (optional)"}
            className="font-bold text-stone-900 text-xs"
          />
          <div className="grid grid-cols-2 gap-2 text-xs">
            {(block.metaData || []).map((m, mIdx) => (
              <div
                key={mIdx}
                className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl flex items-center gap-2 group/meta"
              >
                <InlineInput
                  editable={editable}
                  value={m.key}
                  onChange={(v) => updateMeta(mIdx, "key", v)}
                  placeholder={isId ? "Label" : "Key"}
                  className="font-bold text-stone-600 w-24 shrink-0"
                />
                <InlineInput
                  editable={editable}
                  value={m.value}
                  onChange={(v) => updateMeta(mIdx, "value", v)}
                  placeholder={isId ? "Nilai" : "Value"}
                  className="font-mono font-bold text-stone-900 flex-1 text-right"
                />
                {editable && isSelected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMeta(mIdx);
                    }}
                    className="opacity-0 group-hover/meta:opacity-100 text-stone-300 hover:text-rose-500 cursor-pointer shrink-0 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {editable && isSelected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                addMeta();
              }}
              className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              {isId ? "Tambah metadata" : "Add metadata"}
            </button>
          )}
        </div>
      );

    /* --- 9. SIGNATURE COLUMN / STAMP --- */
    case "SIGNATURE_COLUMN":
    case "SIGNATURE_STAMP": {
      const deptCfg =
        DEPARTMENT_ROUTING_CONFIG[block.targetDepartment || "PURCHASING"] ||
        DEPARTMENT_ROUTING_CONFIG.PURCHASING;
      return (
        <div className="mt-6 pt-3 border-t border-stone-200">
          <div className="flex justify-end">
            <div className="w-64 text-center">
              <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
                {isId ? "Disetujui Oleh" : "Approved By"}{" "}
                <span className="text-stone-500 font-normal">/ Authorized By</span>
              </div>
              <InlineInput
                editable={editable}
                value={block.signatoryTitle || deptCfg.signatoryTitleId}
                onChange={(v) => onUpdate({ signatoryTitle: v })}
                placeholder={isId ? "Jabatan penandatangan" : "Signatory title"}
                className="text-[10px] text-stone-500 uppercase font-bold mb-1 text-center"
              />
              <div className="h-12 flex items-center justify-center my-1">
                <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg shadow-2xs">
                  <QRCodeSVG
                    value={`https://fhtbs-erp.shared/auth/${block.targetDepartment || "PURCHASING"}`}
                    size={22}
                    fgColor="#059669"
                  />
                  <div className="text-left">
                    <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">
                      Validated System
                    </div>
                    <div className="text-[8px] font-mono text-emerald-700 leading-none">
                      {block.targetDepartment || "PURCHASING"} Dept
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-300 pt-1">
                <InlineInput
                  editable={editable}
                  value={block.signatoryName || ""}
                  onChange={(v) => onUpdate({ signatoryName: v })}
                  placeholder={isId ? "( Nama Pejabat )" : "( Officer Name )"}
                  className="text-center uppercase"
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    /* --- 10. DUAL SIGNATURE --- */
    case "DUAL_SIGNATURE": {
      const deptCfg =
        DEPARTMENT_ROUTING_CONFIG[block.targetDepartment || "PURCHASING"] ||
        DEPARTMENT_ROUTING_CONFIG.PURCHASING;
      return (
        <div className="mt-6 pt-3 border-t border-stone-200 grid grid-cols-2 gap-8 text-center">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
              {isId ? "Dibuat Oleh" : "Created By"}{" "}
              <span className="text-stone-500 font-normal">/ Submitted By</span>
            </div>
            <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">
              {department || "General"} Team
            </div>
            <div className="h-12 flex items-center justify-center my-1">
              <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg shadow-2xs">
                <QRCodeSVG
                  value={`https://fhtbs-erp.shared/creator/${department || "General"}`}
                  size={22}
                  fgColor="#059669"
                />
                <div className="text-left">
                  <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">
                    Validated System
                  </div>
                  <div className="text-[8px] font-mono text-emerald-700 leading-none">
                    Creator Validated
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-300 pt-1">
              {department || "General"} Officer
            </div>
          </div>

          <div>
            <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
              {isId ? "Disetujui Oleh" : "Approved By"}{" "}
              <span className="text-stone-500 font-normal">/ Authorized By</span>
            </div>
            <InlineInput
              editable={editable}
              value={block.signatoryTitle || deptCfg.signatoryTitleId}
              onChange={(v) => onUpdate({ signatoryTitle: v })}
              placeholder={isId ? "Jabatan penandatangan" : "Signatory title"}
              className="text-[10px] text-stone-500 uppercase font-bold mb-1 text-center"
            />
            <div className="h-12 flex items-center justify-center my-1">
              <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg shadow-2xs">
                <QRCodeSVG
                  value={`https://fhtbs-erp.shared/auth/${block.targetDepartment || "PURCHASING"}`}
                  size={22}
                  fgColor="#059669"
                />
                <div className="text-left">
                  <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">
                    Validated System
                  </div>
                  <div className="text-[8px] font-mono text-emerald-700 leading-none">
                    {block.targetDepartment || "PURCHASING"} Dept
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-300 pt-1">
              <InlineInput
                editable={editable}
                value={block.signatoryName || ""}
                onChange={(v) => onUpdate({ signatoryName: v })}
                placeholder={isId ? "( Nama Pejabat )" : "( Officer Name )"}
                className="text-center uppercase"
              />
            </div>
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

/* ============================================================
 * MAIN STUDIO EDITOR COMPONENT
 * ==========================================================*/
interface DragGuideState {
  vertical?: { x: number; label: string };
  horizontal?: { y: number; label: string };
}

const VerticalAlignTopIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16" />
    <path d="M8 20v-8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v8" />
  </svg>
);

const VerticalAlignCenterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h16" />
    <path d="M8 6v12" />
    <path d="M16 8v8" />
  </svg>
);

const VerticalAlignBottomIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h16" />
    <path d="M8 4v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4" />
  </svg>
);

interface FloatingTextToolbarProps {
  isId: boolean;
  x: number;
  y: number;
  selectedText: string;
  selectedBlock?: DocBlock | null;
  targetInput?: HTMLInputElement | HTMLTextAreaElement | null;
  onApplyStyle: (patch: Partial<DocBlock>) => void;
  onWrapText: (prefix: string, suffix: string) => void;
  onTransformCase: () => void;
  onClose: () => void;
}

function FloatingTextToolbar({
  isId,
  x,
  y,
  selectedText: _selectedText,
  selectedBlock,
  targetInput,
  onApplyStyle,
  onWrapText,
  onTransformCase,
  onClose,
}: FloatingTextToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);

  const colors = [
    { label: isId ? "Hitam" : "Black", value: "#18181b" },
    { label: isId ? "Abu-abu" : "Slate", value: "#475569" },
    { label: isId ? "Biru" : "Blue", value: "#2563eb" },
    { label: isId ? "Hijau" : "Emerald", value: "#059669" },
    { label: isId ? "Kuning" : "Amber", value: "#d97706" },
    { label: isId ? "Merah" : "Rose", value: "#e11d48" },
  ];

  const highlights = [
    { label: isId ? "Tanpa Sorotan" : "None", value: "" },
    { label: isId ? "Kuning Cerah" : "Yellow", value: "#fef08a" },
    { label: isId ? "Biru Muda" : "Cyan", value: "#bae6fd" },
    { label: isId ? "Hijau Muda" : "Green", value: "#bbf7d0" },
    { label: isId ? "Merah Muda" : "Pink", value: "#fecdd3" },
  ];

  const fontSizes = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28];
  const currentFontSize = selectedBlock?.fontSize || 12;

  return (
    <div
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: y < 70 ? "translate(-50%, 10px)" : "translate(-50%, -100%)",
      }}
      className="fixed z-[999] bg-stone-900/95 backdrop-blur-md text-white border border-stone-700/80 rounded-2xl shadow-2xl px-2 py-1.5 flex items-center gap-1 select-none animate-in fade-in zoom-in-95 duration-150"
      onMouseDown={(e) => {
        // Prevent stealing focus from input or deselecting text
        e.preventDefault();
      }}
    >
      {/* Pointer arrow */}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-stone-900/95 border-stone-700/80 rotate-45 pointer-events-none",
          y < 70 ? "-top-1.5 border-t border-l" : "-bottom-1.5 border-b border-r"
        )}
      />

      {/* 1. Styling Group: Bold, Italic, Underline, Strikethrough */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            if (selectedBlock) onApplyStyle({ isBold: !selectedBlock.isBold });
          }}
          title={isId ? "Tebal (Bold)" : "Bold"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.isBold ? "bg-blue-600 text-white font-black" : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <Bold className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (selectedBlock) onApplyStyle({ isItalic: !selectedBlock.isItalic });
          }}
          title={isId ? "Miring (Italic)" : "Italic"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.isItalic ? "bg-blue-600 text-white" : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <Italic className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (selectedBlock) onApplyStyle({ isUnderline: !selectedBlock.isUnderline });
          }}
          title={isId ? "Garis Bawah (Underline)" : "Underline"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.isUnderline ? "bg-blue-600 text-white" : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <Underline className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (selectedBlock) onApplyStyle({ isStrikethrough: !selectedBlock.isStrikethrough });
          }}
          title={isId ? "Coret (Strikethrough)" : "Strikethrough"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.isStrikethrough ? "bg-blue-600 text-white" : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-stone-700 mx-0.5" />

      {/* 2. Text Alignment Group */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onApplyStyle({ alignment: "LEFT" })}
          title={isId ? "Rata Kiri" : "Align Left"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            (selectedBlock?.alignment || "LEFT") === "LEFT"
              ? "bg-stone-800 text-blue-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ alignment: "CENTER" })}
          title={isId ? "Rata Tengah" : "Center"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.alignment === "CENTER"
              ? "bg-stone-800 text-blue-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ alignment: "RIGHT" })}
          title={isId ? "Rata Kanan" : "Align Right"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.alignment === "RIGHT"
              ? "bg-stone-800 text-blue-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ alignment: "JUSTIFY" })}
          title={isId ? "Rata Kiri-Kanan (Justify)" : "Justify"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.alignment === "JUSTIFY"
              ? "bg-stone-800 text-blue-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-stone-700 mx-0.5" />

      {/* 2b. Vertical Alignment Group */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onApplyStyle({ verticalAlignment: "TOP" })}
          title={isId ? "Rata Atas (Vertical Top)" : "Vertical Top"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            (selectedBlock?.verticalAlignment || "TOP") === "TOP"
              ? "bg-stone-800 text-amber-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <VerticalAlignTopIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ verticalAlignment: "MIDDLE" })}
          title={isId ? "Rata Tengah Vertikal (Vertical Middle)" : "Vertical Middle"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.verticalAlignment === "MIDDLE"
              ? "bg-stone-800 text-amber-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <VerticalAlignCenterIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ verticalAlignment: "BOTTOM" })}
          title={isId ? "Rata Bawah (Vertical Bottom)" : "Vertical Bottom"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.verticalAlignment === "BOTTOM"
              ? "bg-stone-800 text-amber-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <VerticalAlignBottomIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-stone-700 mx-0.5" />

      {/* 3. Sizing (Memperbesar / Memperkecil Teks) */}
      <div className="relative flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onApplyStyle({ fontSize: Math.max(9, currentFontSize - 1) })}
          title={isId ? "Perkecil Teks (-1px)" : "Decrease font size"}
          className="p-1 rounded-md text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => setShowSizeDropdown((v) => !v)}
          title={isId ? "Pilih Ukuran Font" : "Choose font size"}
          className="font-mono text-[11px] font-bold text-stone-200 px-1.5 py-0.5 hover:bg-stone-800 rounded cursor-pointer"
        >
          {currentFontSize}px
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ fontSize: Math.min(48, currentFontSize + 1) })}
          title={isId ? "Perbesar Teks (+1px)" : "Increase font size"}
          className="p-1 rounded-md text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer"
        >
          <Plus className="w-3 h-3" />
        </button>

        {showSizeDropdown && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 bg-stone-800 border border-stone-700 rounded-xl shadow-xl py-1 px-1 flex flex-col gap-0.5 z-50">
            {fontSizes.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => {
                  onApplyStyle({ fontSize: sz });
                  setShowSizeDropdown(false);
                }}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-mono rounded hover:bg-stone-700 text-left cursor-pointer",
                  currentFontSize === sz ? "text-blue-400 font-bold bg-stone-700/60" : "text-stone-300"
                )}
              >
                {sz}px
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-stone-700 mx-0.5" />

      {/* 4. Text Color & Highlight */}
      <div className="relative flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            setShowColorPicker((v) => !v);
            setShowHighlightPicker(false);
          }}
          title={isId ? "Warna Teks" : "Text Color"}
          className="p-1.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer relative"
        >
          <Palette className="w-3.5 h-3.5" />
          {selectedBlock?.textColor && (
            <span
              className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full border border-stone-900"
              style={{ backgroundColor: selectedBlock.textColor }}
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowHighlightPicker((v) => !v);
            setShowColorPicker(false);
          }}
          title={isId ? "Sorotan Latar (Highlight)" : "Text Highlight"}
          className="p-1.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer relative"
        >
          <Highlighter className="w-3.5 h-3.5" />
          {selectedBlock?.highlightColor && (
            <span
              className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full border border-stone-900"
              style={{ backgroundColor: selectedBlock.highlightColor }}
            />
          )}
        </button>

        {showColorPicker && (
          <div className="absolute top-full right-0 mt-1.5 bg-stone-800 border border-stone-700 rounded-xl shadow-xl p-1.5 flex items-center gap-1.5 z-50">
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  onApplyStyle({ textColor: c.value });
                  setShowColorPicker(false);
                }}
                title={c.label}
                className="w-4 h-4 rounded-full border border-stone-600 hover:scale-125 transition-transform cursor-pointer"
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        )}

        {showHighlightPicker && (
          <div className="absolute top-full right-0 mt-1.5 bg-stone-800 border border-stone-700 rounded-xl shadow-xl p-1.5 flex items-center gap-1.5 z-50">
            {highlights.map((h) => (
              <button
                key={h.value || "none"}
                type="button"
                onClick={() => {
                  onApplyStyle({ highlightColor: h.value });
                  setShowHighlightPicker(false);
                }}
                title={h.label}
                className="w-4 h-4 rounded-full border border-stone-600 hover:scale-125 transition-transform cursor-pointer flex items-center justify-center text-[9px]"
                style={{ backgroundColor: h.value || "#292524" }}
              >
                {!h.value && <X className="w-2.5 h-2.5 text-stone-400" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-stone-700 mx-0.5" />

      {/* 5. Transform Case & Close */}
      <button
        type="button"
        onClick={onTransformCase}
        title={isId ? "Ubah Huruf Besar/Kecil (Case)" : "Toggle Text Case"}
        className="p-1.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer"
      >
        <CaseSensitive className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={onClose}
        title={isId ? "Tutup Toolbar" : "Close toolbar"}
        className="p-1 text-stone-400 hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

interface ResizeState {
  blockId: string;
  handle: "se" | "e" | "s";
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

interface DragState {
  blockId: string;
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
}

const HISTORY_LIMIT = 60;
const LIB_DRAG_MIME = "application/x-fhtbs-block";

export function CanvaStudioEditor({
  documentId,
  initialTitle,
  initialDocType,
  initialDepartment,
  initialAuthRole,
  initialAuthDepartment = "PURCHASING",
  initialAuthName = "",
  initialBlocks,
  initialLayoutPreset = "A4_PORTRAIT",
  onSave,
  onClose,
  isSaving,
  isId = true,
}: CanvaStudioEditorProps) {
  /* ---------- Document meta ---------- */
  const [docTitle, setDocTitle] = useState(initialTitle || "Untitled Document");
  const [docType, setDocType] = useState(initialDocType || "MEMORANDUM");
  const [department, setDepartment] = useState(initialDepartment || "General");
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>(initialLayoutPreset);

  /* ---------- Routing (auto-triggered by signature blocks) ---------- */
  const [targetAuthRole, setTargetAuthRole] = useState<string>(initialAuthRole || "PURCHASING_MANAGER");
  const [targetAuthDept, setTargetAuthDept] = useState<TargetDepartment>(
    (initialAuthDepartment as TargetDepartment) || "PURCHASING"
  );
  const [targetAuthName, setTargetAuthName] = useState(initialAuthName || "");

  /* ---------- Canvas blocks + undo/redo history ---------- */
  const [blocks, setBlocksState] = useState<DocBlock[]>(() => {
    let list = initialBlocks && initialBlocks.length > 0 ? [...initialBlocks] : [];
    const kopIndex = list.findIndex((b) => b.type === "OFFICIAL_LETTERHEAD");
    if (kopIndex === -1) {
      list = [{ ...OFFICIAL_KOP_SURAT_BLOCK }, ...list];
    } else {
      const existingKop = list.splice(kopIndex, 1)[0];
      list.unshift({ ...OFFICIAL_KOP_SURAT_BLOCK, ...existingKop, isLocked: true });
    }
    return list;
  });
  const blocksRef = useRef(blocks);
  const [past, setPast] = useState<DocBlock[][]>([]);
  const [future, setFuture] = useState<DocBlock[][]>([]);
  const historyBatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchPending = useRef(false);

  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  /* ---------- Selection & interaction ---------- */
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  const [liveDimensions, setLiveDimensions] = useState<{ width: number; height: number } | null>(null);
  const [alignGuides, setAlignGuides] = useState<DragGuideState | null>(null);

  // Floating text selection formatting toolbar
  const [selectionToolbar, setSelectionToolbar] = useState<{
    visible: boolean;
    x: number;
    y: number;
    selectedText: string;
    targetInput: HTMLInputElement | HTMLTextAreaElement | null;
    blockId?: string | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    selectedText: "",
    targetInput: null,
    blockId: null,
  });

  // HTML5 drag & drop reorder / library insert
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ id: string; pos: "before" | "after" } | null>(null);

  // Hover Popover Tooltip for canvas blocks
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [hoveredBlockRect, setHoveredBlockRect] = useState<{ width: number; height: number } | null>(null);

  // Table Column & Row Resizing state
  const [tableResizing, setTableResizing] = useState<{
    blockId: string;
    type: "col" | "row";
    index: number;
    startX: number;
    startY: number;
    initialSize: number;
  } | null>(null);

  const handleTableColResizeStart = useCallback(
    (e: React.MouseEvent, blockId: string, colIndex: number, currentWidth: number) => {
      e.stopPropagation();
      e.preventDefault();
      setTableResizing({
        blockId,
        type: "col",
        index: colIndex,
        startX: e.clientX,
        startY: e.clientY,
        initialSize: currentWidth || 120,
      });
    },
    []
  );

  const handleTableRowResizeStart = useCallback(
    (e: React.MouseEvent, blockId: string, rowIndex: number, currentHeight: number) => {
      e.stopPropagation();
      e.preventDefault();
      setTableResizing({
        blockId,
        type: "row",
        index: rowIndex,
        startX: e.clientX,
        startY: e.clientY,
        initialSize: currentHeight || 36,
      });
    },
    []
  );

  /* ---------- Studio chrome ---------- */
  const [sidebarTab, setSidebarTab] = useState<BlockCategory | "ALL">("ALL");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [showLeftPanel, setShowLeftPanel] = useState(false); // mobile drawer
  const [showRightPanel, setShowRightPanel] = useState(false); // mobile drawer
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [quickInsertIndex, setQuickInsertIndex] = useState<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [notice, setNotice] = useState<{ id: number; text: string; tone: "info" | "success" | "error" } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const notify = useCallback((text: string, tone: "info" | "success" | "error" = "info") => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ id: Date.now(), text, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  /* ---------- Routing sync (fires notice only on actual change) ---------- */
  const routingDeptRef = useRef<TargetDepartment>(targetAuthDept);
  const syncRoutingFromBlocks = useCallback(
    (list: DocBlock[]) => {
      const sig = list.find(
        (b) => b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP" || b.type === "DUAL_SIGNATURE"
      );
      if (!sig || !sig.targetDepartment) return;
      const dept = sig.targetDepartment;
      const config = DEPARTMENT_ROUTING_CONFIG[dept];
      if (!config) return;
      if (routingDeptRef.current !== dept) {
        routingDeptRef.current = dept;
        setTargetAuthDept(dept);
        setTargetAuthRole(config.role);
        notify(
          isId
            ? `Otorisasi otomatis diarahkan ke ${config.deptNameId} (${config.signatoryTitleId}).`
            : `Authorization auto-routed to ${config.deptNameEn}.`,
          "info"
        );
      } else {
        setTargetAuthDept(dept);
        setTargetAuthRole(config.role);
      }
    },
    [isId, notify]
  );

  /* ---------- Core block mutators with history ---------- */
  const applyBlocks = useCallback(
    (next: DocBlock[], opts?: { history?: boolean }) => {
      const withHistory = opts?.history !== false;
      if (withHistory) {
        // Batch rapid changes (typing) into a single history entry
        if (!batchPending.current) {
          setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), blocksRef.current]);
          batchPending.current = true;
        }
        if (historyBatchTimer.current) clearTimeout(historyBatchTimer.current);
        historyBatchTimer.current = setTimeout(() => {
          batchPending.current = false;
        }, 900);
        setFuture([]);
        setDirty(true);
      }
      blocksRef.current = next;
      setBlocksState(next);
      syncRoutingFromBlocks(next);
    },
    [syncRoutingFromBlocks]
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;
    if (historyBatchTimer.current) {
      clearTimeout(historyBatchTimer.current);
      batchPending.current = false;
    }
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([blocks, ...future].slice(0, HISTORY_LIMIT));
    blocksRef.current = prev;
    setBlocksState(prev);
    setDirty(true);
    syncRoutingFromBlocks(prev);
  }, [past, future, blocks, syncRoutingFromBlocks]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    if (historyBatchTimer.current) {
      clearTimeout(historyBatchTimer.current);
      batchPending.current = false;
    }
    const next = future[0];
    setFuture(future.slice(1));
    setPast([...past, blocks].slice(-HISTORY_LIMIT));
    blocksRef.current = next;
    setBlocksState(next);
    setDirty(true);
    syncRoutingFromBlocks(next);
  }, [past, future, blocks, syncRoutingFromBlocks]);

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) || null,
    [blocks, selectedBlockId]
  );

  const updateBlock = useCallback(
    (id: string, updates: Partial<DocBlock>) => {
      applyBlocks(
        blocksRef.current.map((b) => {
          if (b.id !== id) return b;
          if (b.type === "OFFICIAL_LETTERHEAD" || b.isLocked) {
            return {
              ...b,
              width: updates.width !== undefined ? updates.width : b.width,
              height: updates.height !== undefined ? updates.height : b.height,
            };
          }
          const modified = { ...b, ...updates };
          if (updates.targetDepartment && updates.targetDepartment !== b.targetDepartment) {
            const config = DEPARTMENT_ROUTING_CONFIG[updates.targetDepartment];
            if (config) {
              modified.targetRole = config.role;
              modified.signatoryTitle = isId ? config.signatoryTitleId : config.signatoryTitleEn;
            }
          }
          return modified;
        })
      );
    },
    [applyBlocks, isId]
  );

  /* ---------- Insert / delete / duplicate / reorder ---------- */
  const insertBlock = useCallback(
    (item: LibraryItem, atIndex?: number | null) => {
      if (item.locked || item.type === "OFFICIAL_LETTERHEAD") {
        notify(
          isId
            ? "Kop Surat Resmi sudah terpasang permanen di posisi paling atas dan terkunci."
            : "Official Letterhead is already permanently locked at the top.",
          "info"
        );
        const kop = blocksRef.current.find((b) => b.type === "OFFICIAL_LETTERHEAD");
        if (kop) setSelectedBlockId(kop.id);
        return;
      }
      const block = buildBlock(item.type, isId, department, item.dept);
      const current = blocksRef.current;
      let idx: number;
      if (atIndex !== undefined && atIndex !== null) {
        idx = Math.max(1, Math.min(atIndex, current.length)); // never above the locked kop
      } else if (selectedBlockId) {
        const selIdx = current.findIndex((b) => b.id === selectedBlockId);
        idx = selIdx >= 0 ? selIdx + 1 : current.length;
      } else {
        idx = current.length;
      }
      const next = [...current.slice(0, idx), block, ...current.slice(idx)];
      applyBlocks(next);
      setSelectedBlockId(block.id);
      setQuickInsertIndex(null);
      notify(
        isId ? `Blok "${item.labelId}" ditambahkan.` : `"${item.labelEn}" block added.`,
        "success"
      );
    },
    [applyBlocks, department, isId, notify, selectedBlockId]
  );

  const deleteBlock = useCallback(
    (id: string) => {
      const target = blocksRef.current.find((b) => b.id === id);
      if (!target) return;
      if (target.type === "OFFICIAL_LETTERHEAD" || target.isLocked) {
        notify(
          isId
            ? "Kop Surat Resmi bersifat permanen dan tidak dapat dihapus demi integritas dokumen."
            : "Official Letterhead is permanent and cannot be deleted.",
          "error"
        );
        return;
      }
      applyBlocks(blocksRef.current.filter((b) => b.id !== id));
      if (selectedBlockId === id) setSelectedBlockId(null);
    },
    [applyBlocks, isId, notify, selectedBlockId]
  );

  const duplicateBlock = useCallback(
    (id: string) => {
      const target = blocksRef.current.find((b) => b.id === id);
      if (!target) return;
      if (target.type === "OFFICIAL_LETTERHEAD" || target.isLocked) {
        notify(
          isId ? "Kop Surat Resmi tidak dapat diduplikasi." : "Official Letterhead cannot be duplicated.",
          "error"
        );
        return;
      }
      const copy: DocBlock = { ...JSON.parse(JSON.stringify(target)), id: newBlockId() };
      const idx = blocksRef.current.findIndex((b) => b.id === id);
      const next = [...blocksRef.current];
      next.splice(idx + 1, 0, copy);
      applyBlocks(next);
      setSelectedBlockId(copy.id);
    },
    [applyBlocks, isId, notify]
  );

  const moveBlock = useCallback(
    (id: string, direction: "UP" | "DOWN") => {
      const current = blocksRef.current;
      const idx = current.findIndex((b) => b.id === id);
      if (idx === -1) return;
      if (current[idx].type === "OFFICIAL_LETTERHEAD" || current[idx].isLocked) return;
      if (direction === "UP" && idx <= 1) return; // kop stays at index 0
      if (direction === "DOWN" && idx === current.length - 1) return;
      const targetIdx = direction === "UP" ? idx - 1 : idx + 1;
      const next = [...current];
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      applyBlocks(next);
    },
    [applyBlocks]
  );

  const reorderBlock = useCallback(
    (dragId: string, targetId: string, pos: "before" | "after") => {
      if (dragId === targetId) return;
      const current = blocksRef.current;
      const fromIdx = current.findIndex((b) => b.id === dragId);
      let toIdx = current.findIndex((b) => b.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      if (current[fromIdx].type === "OFFICIAL_LETTERHEAD" || current[fromIdx].isLocked) return;
      const next = [...current];
      const [moved] = next.splice(fromIdx, 1);
      toIdx = next.findIndex((b) => b.id === targetId);
      const insertAt = pos === "before" ? toIdx : toIdx + 1;
      next.splice(Math.max(1, insertAt), 0, moved); // never above locked kop
      applyBlocks(next);
    },
    [applyBlocks]
  );

  const resetBlockPosition = useCallback(
    (id: string) => {
      applyBlocks(
        blocksRef.current.map((b) => (b.id === id ? { ...b, x: 0, y: 0 } : b))
      );
    },
    [applyBlocks]
  );

  /* ---------- Free-position drag (hold & move) with Auto Align Center ---------- */
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const zoomFactor = zoomLevel / 100;
      const deltaX = (e.clientX - dragging.startX) / zoomFactor;
      const deltaY = (e.clientY - dragging.startY) / zoomFactor;

      let newX = Math.round(dragging.initialX + deltaX);
      let newY = Math.round(dragging.initialY + deltaY);
      if (showGrid) {
        newX = Math.round(newX / 10) * 10;
        newY = Math.round(newY / 10) * 10;
      }

      // Auto Align Center Horizontal & Vertical detection
      let snappedVertical: { x: number; label: string } | undefined;
      let snappedHorizontal: { y: number; label: string } | undefined;

      const movingEl = document.getElementById("doc-container-" + dragging.blockId);
      const sheetEl = sheetRef.current;
      if (movingEl && sheetEl) {
        const SNAP_THRESHOLD = 8;
        const currentBlock = blocksRef.current.find((b) => b.id === dragging.blockId);
        const curBX = currentBlock?.x || 0;
        const curBY = currentBlock?.y || 0;
        const blockW = movingEl.offsetWidth;
        const blockH = movingEl.offsetHeight;

        const naturalLeft = movingEl.offsetLeft - curBX;
        const naturalTop = movingEl.offsetTop - curBY;

        const candidateLeft = naturalLeft + newX;
        const candidateTop = naturalTop + newY;
        const candidateCenterX = candidateLeft + blockW / 2;
        const candidateCenterY = candidateTop + blockH / 2;

        const sheetWidth = sheetEl.clientWidth;
        const sheetHeight = sheetEl.clientHeight;
        const sheetCenterX = sheetWidth / 2;
        const sheetCenterY = sheetHeight / 2;

        // 1. Center Horizontal with Sheet
        if (Math.abs(candidateCenterX - sheetCenterX) <= SNAP_THRESHOLD) {
          newX = Math.round(sheetCenterX - naturalLeft - blockW / 2);
          snappedVertical = { x: sheetCenterX, label: isId ? "Rata Tengah Kanvas (X)" : "Center Canvas (X)" };
        } else if (Math.abs(newX) <= 6) {
          newX = 0;
          snappedVertical = { x: naturalLeft + blockW / 2, label: isId ? "Sumbu Flow Dokumen (0px)" : "Flow Axis (0px)" };
        }

        // 2. Center Vertical with Sheet
        if (Math.abs(candidateCenterY - sheetCenterY) <= SNAP_THRESHOLD) {
          newY = Math.round(sheetCenterY - naturalTop - blockH / 2);
          snappedHorizontal = { y: sheetCenterY, label: isId ? "Rata Tengah Kanvas (Y)" : "Center Canvas (Y)" };
        }

        // 3. Align with other blocks on sheet
        for (const other of blocksRef.current) {
          if (other.id === dragging.blockId) continue;
          const otherEl = document.getElementById("doc-container-" + other.id);
          if (!otherEl) continue;

          const otherW = otherEl.offsetWidth;
          const otherH = otherEl.offsetHeight;
          const otherLeft = otherEl.offsetLeft;
          const otherTop = otherEl.offsetTop;
          const otherCenterX = otherLeft + otherW / 2;
          const otherCenterY = otherTop + otherH / 2;

          // Check Horizontal Center
          if (!snappedVertical && Math.abs(candidateCenterX - otherCenterX) <= SNAP_THRESHOLD) {
            newX = Math.round(otherCenterX - naturalLeft - blockW / 2);
            snappedVertical = {
              x: otherCenterX,
              label: isId ? `Sejajar Tengah (${other.title || other.type})` : `Align Center (${other.type})`,
            };
          }

          // Check Left Edge
          if (!snappedVertical && Math.abs(candidateLeft - otherLeft) <= SNAP_THRESHOLD) {
            newX = Math.round(otherLeft - naturalLeft);
            snappedVertical = {
              x: otherLeft,
              label: isId ? "Rata Kiri Blok" : "Align Left",
            };
          }

          // Check Vertical Center
          if (!snappedHorizontal && Math.abs(candidateCenterY - otherCenterY) <= SNAP_THRESHOLD) {
            newY = Math.round(otherCenterY - naturalTop - blockH / 2);
            snappedHorizontal = {
              y: otherCenterY,
              label: isId ? `Sejajar Tengah Vertikal (${other.title || other.type})` : `Align Center Y (${other.type})`,
            };
          }

          // Check Top Edge
          if (!snappedHorizontal && Math.abs(candidateTop - otherTop) <= SNAP_THRESHOLD) {
            newY = Math.round(otherTop - naturalTop);
            snappedHorizontal = {
              y: otherTop,
              label: isId ? "Rata Atas Blok" : "Align Top",
            };
          }
        }
      }

      setAlignGuides(
        snappedVertical || snappedHorizontal ? { vertical: snappedVertical, horizontal: snappedHorizontal } : null
      );

      // Clamp inside a sane canvas range so a block can never get lost off-sheet
      newX = Math.max(-80, Math.min(720, newX));
      newY = Math.max(-40, Math.min(4000, newY));

      const next = blocksRef.current.map((b) => (b.id === dragging.blockId ? { ...b, x: newX, y: newY } : b));
      blocksRef.current = next;
      setBlocksState(next);
    };

    const handleMouseUp = () => {
      setAlignGuides(null);
      applyBlocks(blocksRef.current); // commit single history entry
      setDragging(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, zoomLevel, showGrid, applyBlocks, isId]);

  const handleStartDrag = (e: React.MouseEvent, blockId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const currentBlock = blocksRef.current.find((b) => b.id === blockId);
    if (!currentBlock || currentBlock.isLocked || currentBlock.type === "OFFICIAL_LETTERHEAD") return;
    setSelectedBlockId(blockId);
    setDragging({
      blockId,
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentBlock.x || 0,
      initialY: currentBlock.y || 0,
    });
  };

  /* ---------- Resize handles ---------- */
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const zoomFactor = zoomLevel / 100;
      const deltaX = (e.clientX - resizing.startX) / zoomFactor;
      const deltaY = (e.clientY - resizing.startY) / zoomFactor;

      let newWidth = resizing.startWidth;
      let newHeight = resizing.startHeight;
      if (resizing.handle === "se" || resizing.handle === "e") {
        newWidth = Math.max(220, Math.min(780, Math.round(resizing.startWidth + deltaX)));
        if (showGrid) newWidth = Math.round(newWidth / 10) * 10;
      }
      if (resizing.handle === "se" || resizing.handle === "s") {
        newHeight = Math.max(60, Math.min(1200, Math.round(resizing.startHeight + deltaY)));
        if (showGrid) newHeight = Math.round(newHeight / 10) * 10;
      }
      setLiveDimensions({ width: newWidth, height: newHeight });
      const next = blocksRef.current.map((b) =>
        b.id === resizing.blockId ? { ...b, width: newWidth, height: newHeight } : b
      );
      blocksRef.current = next;
      setBlocksState(next);
    };

    const handleMouseUp = () => {
      applyBlocks(blocksRef.current);
      setResizing(null);
      setLiveDimensions(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, zoomLevel, showGrid, applyBlocks]);

  const handleStartResize = (e: React.MouseEvent, blockId: string, handle: "se" | "e" | "s") => {
    e.preventDefault();
    e.stopPropagation();
    const containerElem = document.getElementById(`doc-container-${blockId}`);
    if (!containerElem) return;
    const rect = containerElem.getBoundingClientRect();
    const currentBlock = blocksRef.current.find((b) => b.id === blockId);
    const startW = typeof currentBlock?.width === "number" ? currentBlock.width : rect.width;
    const startH = typeof currentBlock?.height === "number" ? currentBlock.height : rect.height;
    setResizing({
      blockId,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: startW,
      startHeight: startH,
    });
    setLiveDimensions({ width: Math.round(startW), height: Math.round(startH) });
  };

  /* ---------- Table Column & Row Resizing Handler ---------- */
  useEffect(() => {
    if (!tableResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const zoomFactor = zoomLevel / 100;
      const targetBlock = blocksRef.current.find((b) => b.id === tableResizing.blockId);
      if (!targetBlock || !targetBlock.tableData) return;

      if (tableResizing.type === "col") {
        const deltaX = (e.clientX - tableResizing.startX) / zoomFactor;
        const newWidth = Math.max(40, Math.round(tableResizing.initialSize + deltaX));
        const colWidths = [
          ...(targetBlock.tableData.colWidths || targetBlock.tableData.headers.map(() => 120)),
        ];
        colWidths[tableResizing.index] = newWidth;
        updateBlock(targetBlock.id, {
          tableData: {
            ...targetBlock.tableData,
            colWidths,
          },
        });
      } else {
        const deltaY = (e.clientY - tableResizing.startY) / zoomFactor;
        const newHeight = Math.max(24, Math.round(tableResizing.initialSize + deltaY));
        const rowHeights = [
          ...(targetBlock.tableData.rowHeights || targetBlock.tableData.rows.map(() => 36)),
        ];
        rowHeights[tableResizing.index] = newHeight;
        updateBlock(targetBlock.id, {
          tableData: {
            ...targetBlock.tableData,
            rowHeights,
          },
        });
      }
    };

    const handleMouseUp = () => {
      setTableResizing(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [tableResizing, zoomLevel, updateBlock]);

  /* ---------- Selection & Floating Text Toolbar ---------- */
  useEffect(() => {
    const handleSelection = () => {
      // 1. Check if activeElement is an input or textarea within sheetRef
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
        sheetRef.current?.contains(activeEl)
      ) {
        const input = activeEl as HTMLInputElement | HTMLTextAreaElement;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        if (start !== end) {
          const text = input.value.slice(start, end).trim();
          if (text.length > 0) {
            const rect = input.getBoundingClientRect();
            const container = input.closest("[data-block-id]");
            const blockId = container?.getAttribute("data-block-id") || null;
            if (blockId) {
              setSelectedBlockId(blockId);
            }
            setSelectionToolbar({
              visible: true,
              x: rect.left + rect.width / 2,
              y: Math.max(12, rect.top - 54),
              selectedText: text,
              targetInput: input,
              blockId: blockId,
            });
            return;
          }
        }
      }

      // 2. Check window.getSelection() for any text highlighted inside sheetRef
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
        if (sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (sheetRef.current && sheetRef.current.contains(range.commonAncestorContainer)) {
            const rect = range.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const node = range.commonAncestorContainer;
              const elem = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
              const container = elem?.closest?.("[data-block-id]");
              const blockId = container?.getAttribute("data-block-id") || null;
              if (blockId) {
                setSelectedBlockId(blockId);
              }
              setSelectionToolbar({
                visible: true,
                x: rect.left + rect.width / 2,
                y: Math.max(12, rect.top - 54),
                selectedText: sel.toString(),
                targetInput: null,
                blockId: blockId,
              });
              return;
            }
          }
        }
      }

      setSelectionToolbar((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    document.addEventListener("selectionchange", handleSelection);
    window.addEventListener("mouseup", handleSelection);
    window.addEventListener("keyup", handleSelection);
    return () => {
      document.removeEventListener("selectionchange", handleSelection);
      window.removeEventListener("mouseup", handleSelection);
      window.removeEventListener("keyup", handleSelection);
    };
  }, []);

  const handleWrapSelection = useCallback((prefix: string, suffix: string) => {
    if (selectionToolbar.targetInput) {
      const input = selectionToolbar.targetInput;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const val = input.value;
      const sel = val.slice(start, end);
      let newVal: string;
      if (sel.startsWith(prefix) && sel.endsWith(suffix) && sel.length >= prefix.length + suffix.length) {
        newVal = val.slice(0, start) + sel.slice(prefix.length, sel.length - suffix.length) + val.slice(end);
      } else {
        newVal = val.slice(0, start) + prefix + sel + suffix + val.slice(end);
      }
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        "value"
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, newVal);
      } else {
        input.value = newVal;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, [selectionToolbar.targetInput]);

  const handleTransformCase = useCallback(() => {
    if (selectionToolbar.targetInput) {
      const input = selectionToolbar.targetInput;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const val = input.value;
      const sel = val.slice(start, end);
      let transformed: string;
      if (sel === sel.toUpperCase()) {
        transformed = sel.toLowerCase();
      } else if (sel === sel.toLowerCase()) {
        transformed = sel.replace(/\b\w/g, (c) => c.toUpperCase());
      } else {
        transformed = sel.toUpperCase();
      }
      const newVal = val.slice(0, start) + transformed + val.slice(end);
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        "value"
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, newVal);
      } else {
        input.value = newVal;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, [selectionToolbar.targetInput]);

  /* ---------- Save ---------- */
  const handleSave = useCallback(
    async (submitForApproval: boolean, closeAfter: boolean) => {
      try {
        await onSave(
          {
            title: docTitle.trim() || "Untitled Document",
            document_type: docType,
            department: department || "General",
            content: blocksRef.current,
            layout_preset: layoutPreset,
            authorization_role: targetAuthRole,
            authorization_department: targetAuthDept,
            authorization_user_name: targetAuthName.trim(),
            submitForApproval,
          },
          { closeAfter }
        );
        setDirty(false);
        setLastSavedAt(new Date());
        if (!closeAfter) {
          notify(isId ? "Draft tersimpan. Anda bisa lanjut mengedit." : "Draft saved. You can keep editing.", "success");
        }
      } catch {
        // parent already surfaced the error toast; keep dirty flag on
      }
    },
    [onSave, docTitle, docType, department, layoutPreset, targetAuthRole, targetAuthDept, targetAuthName, isId, notify]
  );

  /* ---------- Close with unsaved-changes guard ---------- */
  const requestClose = useCallback(() => {
    if (dirty) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }, [dirty, onClose]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* ---------- Keyboard shortcuts ---------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = !!target?.closest("input, textarea, select, [contenteditable=true]");
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          handleSave(true, true);
        } else {
          handleSave(false, false);
        }
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        if (isTyping) return; // let native input undo work
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        if (isTyping) return;
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        if (isTyping || !selectedBlockId) return;
        e.preventDefault();
        duplicateBlock(selectedBlockId);
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoomLevel((z) => Math.min(150, z + 10));
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        setZoomLevel((z) => Math.max(40, z - 10));
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        setZoomLevel(100);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isTyping && selectedBlockId && viewMode === "edit") {
        e.preventDefault();
        deleteBlock(selectedBlockId);
        return;
      }
      if (e.key === "Escape") {
        if (quickInsertIndex !== null) {
          setQuickInsertIndex(null);
        } else if (showShortcuts) {
          setShowShortcuts(false);
        } else if (showCloseConfirm) {
          setShowCloseConfirm(false);
        } else {
          setSelectedBlockId(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, undo, redo, duplicateBlock, deleteBlock, selectedBlockId, viewMode, quickInsertIndex, showShortcuts, showCloseConfirm]);

  /* ---------- Print ---------- */
  const handlePrint = useCallback(() => {
    setViewMode("preview");
    setZoomLevel(100);
    setSelectedBlockId(null);
    document.body.classList.add("printing-workspace");
    setTimeout(() => {
      window.print();
    }, 60);
  }, []);

  useEffect(() => {
    const cleanup = () => document.body.classList.remove("printing-workspace");
    window.addEventListener("afterprint", cleanup);
    return () => {
      window.removeEventListener("afterprint", cleanup);
      document.body.classList.remove("printing-workspace");
    };
  }, []);

  /* ---------- Zoom fit-to-width ---------- */
  const handleFitZoom = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const sheetWidth = layoutPreset === "A4_LANDSCAPE" ? 1130 : layoutPreset === "EXECUTIVE_MEMO" ? 750 : 800;
    const fit = Math.floor(((scroller.clientWidth - 48) / sheetWidth) * 100);
    setZoomLevel(Math.max(40, Math.min(150, fit)));
  }, [layoutPreset]);

  /* ---------- Library filtering ---------- */
  const filteredLibrary = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    return LIBRARY_ITEMS.filter((item) => {
      if (sidebarTab !== "ALL" && item.category !== sidebarTab) return false;
      if (!q) return true;
      return (
        item.labelId.toLowerCase().includes(q) ||
        item.labelEn.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q) ||
        (item.dept || "").toLowerCase().includes(q)
      );
    });
  }, [libraryQuery, sidebarTab]);

  const activeDeptConfig = DEPARTMENT_ROUTING_CONFIG[targetAuthDept] || DEPARTMENT_ROUTING_CONFIG.PURCHASING;
  const isEditable = viewMode === "edit";

  /* ============================ RENDER ============================ */

  const renderLibraryItem = (item: LibraryItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        draggable={!item.locked}
        onDragStart={(e) => {
          if (item.locked) return;
          e.dataTransfer.setData(LIB_DRAG_MIME, item.key);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => insertBlock(item, null)}
        className={cn(
          "w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer group flex items-start gap-2.5",
          item.locked
            ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50"
            : "border-stone-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-2xs"
        )}
        title={
          item.locked
            ? isId
              ? "Terpasang permanen di kanvas"
              : "Permanently installed on canvas"
            : isId
            ? "Klik untuk menyisipkan, atau seret ke kanvas"
            : "Click to insert, or drag onto the canvas"
        }
      >
        <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", item.accent)}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-stone-900 truncate">
              {isId ? item.labelId : item.labelEn}
            </span>
            {item.locked && <Lock className="w-3 h-3 text-amber-600 shrink-0" />}
          </span>
          <span className="block text-[10.5px] text-stone-500 leading-snug mt-0.5 line-clamp-2">
            {isId ? item.descId : item.descEn}
          </span>
        </span>
        <span className="shrink-0 mt-1 text-stone-300 group-hover:text-blue-500 transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </span>
      </button>
    );
  };

  const renderLibrary = () => (
    <>
      {/* Search */}
      <div className="p-3 border-b border-stone-200/80 space-y-2.5 bg-stone-50/60">
        <div className="relative">
          <input
            type="text"
            value={libraryQuery}
            onChange={(e) => setLibraryQuery(e.target.value)}
            placeholder={isId ? "Cari blok… (mis. tabel, ttd)" : "Search blocks… (e.g. table, sign)"}
            className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-stone-200 rounded-xl outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 font-medium"
          />
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <div className="flex gap-1 bg-stone-200/60 p-1 rounded-xl">
          {(["ALL", "BODY_TEXT", "ADDRESS_TEMPLATE", "SIGNATURE_COLUMN"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSidebarTab(tab)}
              className={cn(
                "flex-1 py-1.5 px-1 rounded-lg text-[9.5px] font-black uppercase tracking-tight transition-all cursor-pointer",
                sidebarTab === tab ? "bg-white text-stone-900 shadow-2xs" : "text-stone-500 hover:text-stone-800"
              )}
            >
              {tab === "ALL" ? (isId ? "Semua" : "All") : tab === "BODY_TEXT" ? "Teks" : tab === "ADDRESS_TEMPLATE" ? "Alamat" : "TTD"}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
        {filteredLibrary.length === 0 && (
          <div className="text-center py-8 text-stone-400 text-xs space-y-2">
            <Search className="w-6 h-6 mx-auto text-stone-300" />
            <p>{isId ? "Tidak ada blok yang cocok." : "No matching blocks."}</p>
          </div>
        )}
        {(Object.keys(CATEGORY_META) as BlockCategory[]).map((cat) => {
          const items = filteredLibrary.filter((i) => i.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-stone-400 flex items-center gap-2">
                <span>{isId ? CATEGORY_META[cat].labelId : CATEGORY_META[cat].labelEn}</span>
                <span className="flex-1 h-px bg-stone-200" />
              </div>
              {cat === "SIGNATURE_COLUMN" && (
                <div className="bg-purple-50/80 border border-purple-200/70 rounded-xl p-2.5 text-[10.5px] text-purple-900 leading-snug flex gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                  <span>
                    {isId
                      ? "Kolom TTD otomatis menjadi trigger routing dokumen ke departemen terkait."
                      : "Signature columns auto-trigger routing to their department."}
                  </span>
                </div>
              )}
              <div className="space-y-1.5">{items.map(renderLibraryItem)}</div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="p-2.5 border-t border-stone-200/80 bg-stone-50/60 text-[10px] text-stone-500 flex items-center gap-1.5">
        <GripVertical className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        <span>{isId ? "Klik atau seret blok ke kanvas dokumen." : "Click or drag blocks onto the sheet."}</span>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 bg-stone-100 flex flex-col font-sans overflow-hidden">
      {/* ============ 1. TOP STUDIO BAR ============ */}
      <header className="min-h-14 bg-white border-b border-stone-200/90 px-3 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 shrink-0 shadow-2xs z-20">
        {/* Left cluster */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={requestClose}
            className="p-2 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer relative"
            title={isId ? "Tutup Studio (Esc untuk batal pilih)" : "Close Studio"}
          >
            <X className="w-4.5 h-4.5" />
            {dirty && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />}
          </button>

          <div className="h-5 w-px bg-stone-200 hidden sm:block" />

          {/* Mobile panel toggles */}
          <button
            onClick={() => setShowLeftPanel(true)}
            className="lg:hidden p-2 rounded-xl text-stone-500 hover:bg-stone-100 cursor-pointer"
            title={isId ? "Buka panel blok" : "Open block library"}
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1.5 rounded-lg bg-stone-100 text-stone-800 border border-stone-200 shrink-0 hidden sm:flex">
              <FileText className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={docTitle}
              onChange={(e) => {
                setDocTitle(e.target.value);
                setDirty(true);
              }}
              placeholder={isId ? "Judul Dokumen…" : "Document Title…"}
              className="text-sm font-black text-stone-900 bg-transparent hover:bg-stone-50 focus:bg-white border border-transparent hover:border-stone-200 focus:border-stone-900 rounded-lg px-2 py-1 outline-none transition-all truncate w-36 sm:w-64"
            />
            {/* Save state chip */}
            <span
              className={cn(
                "hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0",
                dirty
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-stone-100 text-stone-800 border-stone-200"
              )}
            >
              {dirty ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {isId ? "Belum disimpan" : "Unsaved"}
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  {lastSavedAt
                    ? `${isId ? "Tersimpan" : "Saved"} ${lastSavedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
                    : isId
                    ? "Tersimpan"
                    : "Saved"}
                </>
              )}
            </span>
          </div>
        </div>

        {/* Center: routing badge */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-xl bg-stone-100 border border-stone-200 text-stone-900 text-xs font-medium order-3 xl:order-none">
          <ShieldCheck className="w-4 h-4 text-stone-700 shrink-0" />
          <span className="text-stone-500 text-[11px]">{isId ? "Otorisasi:" : "Routing:"}</span>
          <span className="font-bold text-stone-900">{activeDeptConfig.deptNameId}</span>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Undo / Redo */}
          <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200/80">
            <button
              onClick={undo}
              disabled={past.length === 0}
              className="p-1.5 rounded-lg text-stone-600 hover:bg-white hover:text-stone-900 disabled:opacity-30 cursor-pointer transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={future.length === 0}
              className="p-1.5 rounded-lg text-stone-600 hover:bg-white hover:text-stone-900 disabled:opacity-30 cursor-pointer transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Zoom */}
          <div className="hidden md:flex items-center gap-0.5 bg-stone-100 p-0.5 rounded-xl border border-stone-200/80 text-xs">
            <button
              onClick={() => setZoomLevel((z) => Math.max(40, z - 10))}
              className="p-1.5 hover:bg-white rounded-lg text-stone-600 hover:text-stone-900 cursor-pointer"
              title="Zoom Out (Ctrl+-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 font-mono text-[11px] font-bold text-stone-700 min-w-9 text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
              className="p-1.5 hover:bg-white rounded-lg text-stone-600 hover:text-stone-900 cursor-pointer"
              title="Zoom In (Ctrl++)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleFitZoom}
              className="p-1.5 hover:bg-white rounded-lg text-stone-600 hover:text-stone-900 cursor-pointer"
              title={isId ? "Zoom pas lebar layar" : "Fit to width"}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Grid toggle */}
          <button
            onClick={() => setShowGrid((g) => !g)}
            className={cn(
              "hidden sm:flex p-2 rounded-xl border transition-all cursor-pointer",
              showGrid
                ? "bg-blue-50 text-blue-700 border-blue-300"
                : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100"
            )}
            title={isId ? "Grid panduan & snap" : "Grid guides & snapping"}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>

          {/* Preview toggle */}
          <button
            onClick={() => {
              setViewMode((m) => (m === "edit" ? "preview" : "edit"));
              setSelectedBlockId(null);
              setQuickInsertIndex(null);
            }}
            className={cn(
              "px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer",
              viewMode === "preview"
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
            )}
            title={isId ? "Lihat hasil akhir dokumen" : "Preview final document"}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isId ? "Pratinjau" : "Preview"}</span>
          </button>

          {/* Print */}
          <button
            onClick={handlePrint}
            className="hidden sm:flex p-2 rounded-xl border border-stone-200 bg-white text-stone-500 hover:bg-stone-100 cursor-pointer transition-colors"
            title={isId ? "Cetak / Simpan PDF" : "Print / Save PDF"}
          >
            <Printer className="w-3.5 h-3.5" />
          </button>

          {/* Shortcuts */}
          <button
            onClick={() => setShowShortcuts(true)}
            className="hidden sm:flex p-2 rounded-xl border border-stone-200 bg-white text-stone-500 hover:bg-stone-100 cursor-pointer transition-colors"
            title={isId ? "Pintasan keyboard" : "Keyboard shortcuts"}
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>

          <div className="h-5 w-px bg-stone-200 hidden sm:block" />

          {/* Save draft */}
          <Button
            onClick={() => handleSave(false, false)}
            disabled={isSaving}
            variant="outline"
            size="sm"
            className="rounded-xl border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold gap-1.5 shadow-2xs"
          >
            <Save className="w-3.5 h-3.5 text-stone-600" />
            <span className="hidden sm:inline">{isId ? "Simpan" : "Save"}</span>
          </Button>

          {/* Submit */}
          <Button
            onClick={() => handleSave(true, true)}
            disabled={isSaving}
            variant="primary"
            size="sm"
            className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black gap-1.5 shadow-2xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {isId ? `Kirim ke ${targetAuthDept}` : `Submit to ${targetAuthDept}`}
            </span>
          </Button>

          <button
            onClick={() => setShowRightPanel(true)}
            className="lg:hidden p-2 rounded-xl text-stone-500 hover:bg-stone-100 cursor-pointer"
            title={isId ? "Buka pengaturan" : "Open inspector"}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ============ 2. MAIN WORKSPACE ============ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ---- A. LEFT LIBRARY (desktop) ---- */}
        <aside className="hidden lg:flex w-72 xl:w-80 bg-white border-r border-stone-200/90 flex-col shrink-0 z-10">
          {renderLibrary()}
        </aside>

        {/* ---- B. CANVAS ---- */}
        <main
          ref={scrollRef}
          onClick={() => {
            setSelectedBlockId(null);
            setQuickInsertIndex(null);
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(LIB_DRAG_MIME)) e.preventDefault();
          }}
          onDrop={(e) => {
            const key = e.dataTransfer.getData(LIB_DRAG_MIME);
            if (key) {
              e.preventDefault();
              const item = LIBRARY_ITEMS.find((i) => i.key === key);
              if (item) insertBlock(item, null);
            }
          }}
          className="studio-canvas-scroll flex-1 bg-stone-200/70 overflow-auto p-4 sm:p-8 flex justify-center items-start custom-scrollbar bg-[radial-gradient(#d6d3d1_1px,transparent_1px)] [background-size:16px_16px]"
        >
          <div
            ref={sheetRef}
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: "top center",
              transition: "transform 0.15s ease-out",
            }}
            className={cn(
              "studio-sheet bg-white shadow-xl rounded-xl border border-stone-300 relative print:shadow-none print:border-none z-0 shrink-0",
              layoutPreset === "A4_PORTRAIT" && "w-[800px] min-h-[1130px] p-12",
              layoutPreset === "A4_LANDSCAPE" && "w-[1130px] min-h-[800px] p-12",
              layoutPreset === "EXECUTIVE_MEMO" && "w-[750px] min-h-[950px] p-10"
            )}
          >
            {/* Grid overlay */}
            {showGrid && isEditable && (
              <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden z-0 opacity-40 print:hidden">
                <svg className="w-full h-full" width="100%" height="100%">
                  <defs>
                    <pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="1,2" />
                    </pattern>
                    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                      <rect width="50" height="50" fill="url(#smallGrid)" />
                      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#94a3b8" strokeWidth="0.8" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
              </div>
            )}

            {/* Auto Align Guidelines (Smart Magnetic Alignment Guides) */}
            {alignGuides?.vertical && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-50 transition-all duration-75"
                style={{ left: `${alignGuides.vertical.x}px` }}
              >
                <div className="w-[2px] h-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,1)]" />
                <div className="absolute top-3 -translate-x-1/2 bg-rose-600 text-white font-mono text-[10px] font-black px-2.5 py-1 rounded-md shadow-xl flex items-center gap-1.5 whitespace-nowrap z-50 animate-in fade-in zoom-in-95 duration-100">
                  <AlignCenter className="w-3 h-3 text-rose-100" />
                  <span>{alignGuides.vertical.label}</span>
                </div>
              </div>
            )}
            {alignGuides?.horizontal && (
              <div
                className="absolute left-0 right-0 pointer-events-none z-50 transition-all duration-75"
                style={{ top: `${alignGuides.horizontal.y}px` }}
              >
                <div className="h-[2px] w-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,1)]" />
                <div className="absolute left-4 -translate-y-1/2 bg-rose-600 text-white font-mono text-[10px] font-black px-2.5 py-1 rounded-md shadow-xl flex items-center gap-1.5 whitespace-nowrap z-50 animate-in fade-in zoom-in-95 duration-100">
                  <AlignCenter className="w-3 h-3 text-rose-100 rotate-90" />
                  <span>{alignGuides.horizontal.label}</span>
                </div>
              </div>
            )}

            {/* Blocks flow */}
            <div className="space-y-6 relative z-10" onClick={(e) => e.stopPropagation()}>
              {blocks.map((block, idx) => {
                const isSelected = selectedBlockId === block.id;
                const isKop = block.type === "OFFICIAL_LETTERHEAD" || Boolean(block.isLocked);
                const isMoved = Boolean(block.x || block.y);

                return (
                  <React.Fragment key={block.id}>
                    {/* Gap quick-insert zone */}
                    {isEditable && idx >= 1 && (
                      <div className="relative h-4 -my-3 group/gap z-20 flex items-center justify-center">
                        <div className="absolute inset-x-8 top-1/2 h-px bg-blue-300 opacity-0 group-hover/gap:opacity-100 transition-opacity" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuickInsertIndex(idx);
                          }}
                          className="relative opacity-0 group-hover/gap:opacity-100 transition-opacity w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md hover:scale-110 cursor-pointer"
                          title={isId ? "Sisipkan blok di sini" : "Insert block here"}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <div
                      id={`doc-container-${block.id}`}
                      data-block-id={block.id}
                      style={{
                        width: block.width
                          ? typeof block.width === "number"
                            ? `${block.width}px`
                            : block.width
                          : "100%",
                        minHeight: block.height
                          ? typeof block.height === "number"
                            ? `${block.height}px`
                            : block.height
                          : undefined,
                        maxWidth: "100%",
                        transform: block.x || block.y ? `translate(${block.x || 0}px, ${block.y || 0}px)` : undefined,
                      }}
                      onMouseEnter={(e) => {
                        setHoveredBlockId(block.id);
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredBlockRect({
                          width: Math.round(rect.width),
                          height: Math.round(rect.height),
                        });
                      }}
                      onMouseLeave={() => {
                        if (hoveredBlockId === block.id) {
                          setHoveredBlockId(null);
                          setHoveredBlockRect(null);
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditable) setSelectedBlockId(block.id);
                      }}
                      onDragOver={(e) => {
                        if (!isEditable) return;
                        if (dragBlockId || e.dataTransfer.types.includes(LIB_DRAG_MIME)) {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                          setDropIndicator({ id: block.id, pos });
                        }
                      }}
                      onDragLeave={() => {
                        if (dropIndicator?.id === block.id) setDropIndicator(null);
                      }}
                      onDrop={(e) => {
                        if (!isEditable) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pos = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                        const libKey = e.dataTransfer.getData(LIB_DRAG_MIME);
                        if (libKey) {
                          const item = LIBRARY_ITEMS.find((i) => i.key === libKey);
                          if (item) {
                            const targetIdx = blocksRef.current.findIndex((b) => b.id === block.id);
                            insertBlock(item, pos === "before" ? targetIdx : targetIdx + 1);
                          }
                        } else if (dragBlockId) {
                          reorderBlock(dragBlockId, block.id, pos);
                        }
                        setDropIndicator(null);
                        setDragBlockId(null);
                      }}
                      className={cn(
                        "relative group/block transition-shadow rounded-xl",
                        isEditable && isSelected
                          ? "ring-2 ring-blue-500 p-3 bg-blue-50/10"
                          : isEditable
                          ? "hover:ring-1 hover:ring-stone-300 p-2"
                          : "",
                        isEditable && isKop && "hover:ring-amber-300",
                        dragging && dragging.blockId === block.id && "opacity-90 shadow-2xl ring-2 ring-amber-500 cursor-grabbing z-30"
                      )}
                    >
                      {/* Hover Tooltip Popover */}
                      {isEditable && hoveredBlockId === block.id && !dragging && !resizing && !isSelected && (
                        <div className="absolute -top-8 left-2 bg-stone-900/95 backdrop-blur-md text-white border border-stone-700/80 rounded-lg px-2.5 py-1 text-[10px] font-mono shadow-xl z-40 flex items-center gap-2 pointer-events-none animate-in fade-in duration-100">
                          <span className="font-bold text-amber-400 uppercase tracking-wide">
                            {BLOCK_TYPE_LABELS[block.type] || block.type}
                          </span>
                          <span className="text-stone-500">|</span>
                          <span className="text-stone-300">
                            {hoveredBlockRect ? `${hoveredBlockRect.width}px × ${hoveredBlockRect.height}px` : "Auto"}
                          </span>
                          {block.isLocked && (
                            <>
                              <span className="text-stone-500">|</span>
                              <span className="text-amber-300 font-bold flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5" /> Terkunci
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Drop indicator lines */}
                      {dropIndicator?.id === block.id && dropIndicator.pos === "before" && (
                        <div className="absolute -top-2 inset-x-0 h-1 bg-blue-500 rounded-full z-40 pointer-events-none" />
                      )}
                      {dropIndicator?.id === block.id && dropIndicator.pos === "after" && (
                        <div className="absolute -bottom-2 inset-x-0 h-1 bg-blue-500 rounded-full z-40 pointer-events-none" />
                      )}

                      {/* Left handles: reorder grip + free move */}
                      {isEditable && isSelected && !isKop && (
                        <div className="absolute -top-3.5 left-2 flex items-center bg-blue-600 text-white rounded-lg shadow-md z-30 text-[10px] font-bold overflow-hidden">
                          <span
                            draggable
                            onDragStart={(e) => {
                              setDragBlockId(block.id);
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", block.id);
                            }}
                            onDragEnd={() => {
                              setDragBlockId(null);
                              setDropIndicator(null);
                            }}
                            className="flex items-center gap-1 px-2 py-1 hover:bg-blue-700 cursor-grab active:cursor-grabbing"
                            title={isId ? "Seret untuk mengubah urutan blok" : "Drag to reorder block"}
                          >
                            <GripVertical className="w-3 h-3 text-blue-200" />
                            <span className="hidden sm:inline">{isId ? "Urutkan" : "Reorder"}</span>
                          </span>
                          <span className="w-px h-4 bg-blue-500" />
                          <span
                            onMouseDown={(e) => handleStartDrag(e, block.id)}
                            className="flex items-center gap-1 px-2 py-1 hover:bg-blue-700 cursor-grab active:cursor-grabbing"
                            title={isId ? "Tahan & geser untuk posisi bebas" : "Hold & drag for free positioning"}
                          >
                            <Move className="w-3 h-3 text-amber-300" />
                            <span className="hidden sm:inline">{isId ? "Geser" : "Move"}</span>
                            {isMoved && (
                              <span className="font-mono text-[9px] text-blue-200 bg-blue-800/80 px-1 rounded">
                                ({block.x || 0}, {block.y || 0})
                              </span>
                            )}
                          </span>
                        </div>
                      )}

                      {/* Live drag tooltip */}
                      {dragging && dragging.blockId === block.id && (
                        <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-blue-900 text-white text-[10px] font-mono px-2.5 py-1 rounded-md shadow-xl z-50 flex items-center gap-1.5 pointer-events-none">
                          <Move className="w-3 h-3 text-amber-300" />
                          <span>
                            X: {block.x || 0}px, Y: {block.y || 0}px {showGrid ? "(snap)" : ""}
                          </span>
                        </div>
                      )}

                      {/* Right floating toolbar */}
                      {isEditable && isSelected && (
                        <div className="absolute -top-3.5 right-2 flex items-center gap-0.5 bg-stone-900 text-white rounded-lg px-1.5 py-0.5 shadow-md z-30 text-[10px] font-bold">
                          {isKop ? (
                            <span className="text-amber-400 flex items-center gap-1 px-1">
                              <Lock className="w-3 h-3" />
                              <span>{isId ? "Kop Resmi Terkunci" : "Official Letterhead Locked"}</span>
                            </span>
                          ) : (
                            <>
                              <span className="text-stone-400 font-mono px-1">#{idx + 1}</span>
                              {isMoved && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    resetBlockPosition(block.id);
                                  }}
                                  className="p-1 hover:bg-stone-800 text-amber-300 hover:text-white rounded cursor-pointer"
                                  title={isId ? "Reset posisi ke alur dokumen" : "Reset position to flow"}
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveBlock(block.id, "UP");
                                }}
                                disabled={idx <= 1}
                                className="p-1 hover:bg-stone-800 disabled:opacity-30 rounded cursor-pointer"
                                title={isId ? "Pindah ke atas" : "Move up"}
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveBlock(block.id, "DOWN");
                                }}
                                disabled={idx === blocks.length - 1}
                                className="p-1 hover:bg-stone-800 disabled:opacity-30 rounded cursor-pointer"
                                title={isId ? "Pindah ke bawah" : "Move down"}
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicateBlock(block.id);
                                }}
                                className="p-1 hover:bg-stone-800 rounded cursor-pointer"
                                title={isId ? "Duplikat (Ctrl+D)" : "Duplicate (Ctrl+D)"}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteBlock(block.id);
                                }}
                                className="p-1 hover:bg-rose-600 rounded text-rose-300 hover:text-white cursor-pointer"
                                title={isId ? "Hapus (Delete)" : "Delete (Del)"}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Resize handles */}
                      {isEditable && isSelected && !isKop && (
                        <>
                          <div
                            onMouseDown={(e) => handleStartResize(e, block.id, "se")}
                            className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-600 border-2 border-white rounded-xs shadow-md cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                            title={isId ? "Tahan & geser untuk ubah ukuran" : "Hold & drag to resize"}
                          />
                          <div
                            onMouseDown={(e) => handleStartResize(e, block.id, "s")}
                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-2 bg-blue-500/80 border border-white rounded-full shadow-2xs cursor-ns-resize z-40 hover:bg-blue-600 transition-colors"
                          />
                          <div
                            onMouseDown={(e) => handleStartResize(e, block.id, "e")}
                            className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-8 bg-blue-500/80 border border-white rounded-full shadow-2xs cursor-ew-resize z-40 hover:bg-blue-600 transition-colors"
                          />
                          {resizing && resizing.blockId === block.id && liveDimensions && (
                            <div className="absolute -bottom-8 right-0 bg-stone-900/90 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-lg z-50 pointer-events-none">
                              {liveDimensions.width}px × {liveDimensions.height}px
                            </div>
                          )}
                        </>
                      )}

                      {/* Block body */}
                      <BlockContent
                        block={block}
                        editable={isEditable && !isKop}
                        isId={isId}
                        documentId={documentId}
                        department={department}
                        isSelected={isSelected}
                        onUpdate={(updates) => updateBlock(block.id, updates)}
                        onSelectBlock={() => setSelectedBlockId(block.id)}
                        onTableColResizeStart={handleTableColResizeStart}
                        onTableRowResizeStart={handleTableRowResizeStart}
                      />
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Trailing quick-insert */}
              {isEditable && blocks.length > 0 && (
                <div className="relative h-4 -my-3 group/gap z-20 flex items-center justify-center">
                  <div className="absolute inset-x-8 top-1/2 h-px bg-blue-300 opacity-0 group-hover/gap:opacity-100 transition-opacity" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuickInsertIndex(blocks.length);
                    }}
                    className="relative opacity-0 group-hover/gap:opacity-100 transition-opacity w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md hover:scale-110 cursor-pointer"
                    title={isId ? "Sisipkan blok di akhir" : "Insert block at end"}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ---- C. RIGHT INSPECTOR (desktop) ---- */}
        <aside className="hidden lg:flex w-72 xl:w-80 bg-white border-l border-stone-200/90 flex-col shrink-0 z-10">
          <StudioInspector
            isId={isId}
            blocks={blocks}
            selectedBlock={selectedBlock}
            selectedIndex={selectedBlock ? blocks.findIndex((b) => b.id === selectedBlock.id) : -1}
            onSelectBlock={setSelectedBlockId}
            onUpdateBlock={updateBlock}
            onDeleteBlock={deleteBlock}
            onDuplicateBlock={duplicateBlock}
            onMoveBlock={moveBlock}
            onResetPosition={resetBlockPosition}
            docType={docType}
            onDocTypeChange={(v) => {
              setDocType(v);
              setDirty(true);
            }}
            department={department}
            onDepartmentChange={(v) => {
              setDepartment(v);
              setDirty(true);
            }}
            layoutPreset={layoutPreset}
            onLayoutPresetChange={(v) => {
              setLayoutPreset(v);
              setDirty(true);
            }}
            targetAuthName={targetAuthName}
            onTargetAuthNameChange={(v) => {
              setTargetAuthName(v);
              setDirty(true);
            }}
            activeDeptConfig={activeDeptConfig}
          />
        </aside>
      </div>

      {/* ============ 3. STATUS BAR ============ */}
      <footer className="h-8 bg-white border-t border-stone-200/90 px-3 hidden sm:flex items-center justify-between text-[10px] text-stone-500 font-medium shrink-0 z-10 print:hidden">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3 text-stone-400" />
            {blocks.length} {isId ? "blok" : "blocks"}
          </span>
          <span className="font-mono">{zoomLevel}%</span>
          <span className="flex items-center gap-1">
            {viewMode === "preview" ? (
              <>
                <Eye className="w-3 h-3 text-stone-400" />
                {isId ? "Mode Pratinjau" : "Preview Mode"}
              </>
            ) : (
              <>
                <PenTool className="w-3 h-3 text-stone-400" />
                {isId ? "Mode Edit" : "Edit Mode"}
              </>
            )}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <span>Ctrl+Z {isId ? "urungkan" : "undo"}</span>
          <span>Ctrl+S {isId ? "simpan" : "save"}</span>
          <span>Ctrl+D {isId ? "duplikat" : "duplicate"}</span>
          <span>Del {isId ? "hapus blok" : "delete block"}</span>
        </div>
      </footer>

      {/* ============ 4. FLOATING NOTICE PILL ============ */}
      {notice && (
        <div
          key={notice.id}
          className={cn(
            "fixed bottom-12 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200",
            notice.tone === "success" && "bg-emerald-600 text-white",
            notice.tone === "error" && "bg-rose-600 text-white",
            notice.tone === "info" && "bg-stone-900 text-white"
          )}
        >
          {notice.tone === "success" ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : notice.tone === "error" ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          )}
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ============ 5. MOBILE DRAWERS ============ */}
      {showLeftPanel && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-stone-950/40" onClick={() => setShowLeftPanel(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="p-3 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wide text-stone-900">
                {isId ? "Pustaka Blok" : "Block Library"}
              </span>
              <button
                onClick={() => setShowLeftPanel(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderLibrary()}
          </aside>
        </div>
      )}

      {showRightPanel && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-stone-950/40" onClick={() => setShowRightPanel(false)} />
          <aside className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-3 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wide text-stone-900">
                {isId ? "Inspektor & Pengaturan" : "Inspector & Settings"}
              </span>
              <button
                onClick={() => setShowRightPanel(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <StudioInspector
              isId={isId}
              blocks={blocks}
              selectedBlock={selectedBlock}
              selectedIndex={selectedBlock ? blocks.findIndex((b) => b.id === selectedBlock.id) : -1}
              onSelectBlock={(id) => {
                setSelectedBlockId(id);
                if (id) setShowRightPanel(false);
              }}
              onUpdateBlock={updateBlock}
              onDeleteBlock={(id) => {
                deleteBlock(id);
                setShowRightPanel(false);
              }}
              onDuplicateBlock={duplicateBlock}
              onMoveBlock={moveBlock}
              onResetPosition={resetBlockPosition}
              docType={docType}
              onDocTypeChange={(v) => {
                setDocType(v);
                setDirty(true);
              }}
              department={department}
              onDepartmentChange={(v) => {
                setDepartment(v);
                setDirty(true);
              }}
              layoutPreset={layoutPreset}
              onLayoutPresetChange={(v) => {
                setLayoutPreset(v);
                setDirty(true);
              }}
              targetAuthName={targetAuthName}
              onTargetAuthNameChange={(v) => {
                setTargetAuthName(v);
                setDirty(true);
              }}
              activeDeptConfig={activeDeptConfig}
            />
          </aside>
        </div>
      )}

      {/* ============ 6. QUICK INSERT PICKER ============ */}
      {quickInsertIndex !== null && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-stone-950/30 p-4"
          onClick={() => setQuickInsertIndex(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <div className="text-sm font-black text-stone-900">
                  {isId ? "Sisipkan Blok Baru" : "Insert New Block"}
                </div>
                <div className="text-[11px] text-stone-500">
                  {isId
                    ? `Blok akan ditempatkan pada posisi #${quickInsertIndex + 1} dokumen.`
                    : `Block will be placed at position #${quickInsertIndex + 1}.`}
                </div>
              </div>
              <button
                onClick={() => setQuickInsertIndex(null)}
                className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 custom-scrollbar">
              {LIBRARY_ITEMS.filter((i) => !i.locked).map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => insertBlock(item, quickInsertIndex)}
                    className="text-left p-2.5 rounded-xl border border-stone-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 transition-all cursor-pointer flex items-start gap-2.5"
                  >
                    <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", item.accent)}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-stone-900 truncate">
                        {isId ? item.labelId : item.labelEn}
                      </span>
                      <span className="block text-[10px] text-stone-500 leading-snug mt-0.5 line-clamp-2">
                        {isId ? item.descId : item.descEn}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============ 7. UNSAVED CHANGES CONFIRM ============ */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4.5 h-4.5" />
              </span>
              <div>
                <div className="text-sm font-black text-stone-900">
                  {isId ? "Perubahan belum disimpan" : "Unsaved changes"}
                </div>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  {isId
                    ? "Ada perubahan pada dokumen yang belum tersimpan. Simpan sebagai draft sebelum keluar?"
                    : "This document has unsaved changes. Save as draft before leaving?"}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => handleSave(false, true)}
                disabled={isSaving}
                variant="primary"
                className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold w-full"
              >
                {isId ? "Simpan Draft & Keluar" : "Save Draft & Exit"}
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowCloseConfirm(false)}
                  variant="outline"
                  className="rounded-xl text-xs font-bold flex-1 border-stone-200"
                >
                  {isId ? "Lanjut Mengedit" : "Keep Editing"}
                </Button>
                <Button
                  onClick={() => {
                    setDirty(false);
                    setShowCloseConfirm(false);
                    onClose();
                  }}
                  variant="outline"
                  className="rounded-xl text-xs font-bold flex-1 text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  {isId ? "Keluar Tanpa Simpan" : "Exit Without Saving"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ 8. SHORTCUTS HELP ============ */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/40 p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-black text-stone-900 flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-stone-500" />
                {isId ? "Pintasan Keyboard" : "Keyboard Shortcuts"}
              </div>
              <button
                onClick={() => setShowShortcuts(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-stone-100 text-xs">
              {[
                ["Ctrl / Cmd + Z", isId ? "Urungkan perubahan" : "Undo"],
                ["Ctrl / Cmd + Shift + Z", isId ? "Ulangi perubahan" : "Redo"],
                ["Ctrl / Cmd + S", isId ? "Simpan draft (tanpa keluar)" : "Save draft (stay open)"],
                ["Ctrl / Cmd + Shift + S", isId ? "Simpan & kirim untuk otorisasi" : "Save & submit for approval"],
                ["Ctrl / Cmd + D", isId ? "Duplikat blok terpilih" : "Duplicate selected block"],
                ["Delete / Backspace", isId ? "Hapus blok terpilih" : "Delete selected block"],
                ["Ctrl / Cmd + (+ / - / 0)", isId ? "Zoom masuk / keluar / reset" : "Zoom in / out / reset"],
                ["Esc", isId ? "Batal pilih blok / tutup panel" : "Deselect block / close panel"],
              ].map(([keys, label]) => (
                <div key={keys} className="flex items-center justify-between py-2">
                  <span className="text-stone-600 font-medium">{label}</span>
                  <kbd className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 font-mono text-[10px] font-bold text-stone-700">
                    {keys}
                  </kbd>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-100 text-[11px] text-blue-800 leading-snug">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
              <span>
                {isId
                  ? "Seret gagang ⋮⋮ pada blok terpilih untuk mengubah urutan, atau seret blok dari panel kiri langsung ke kanvas."
                  : "Drag the ⋮⋮ grip on a selected block to reorder, or drag blocks from the left panel straight onto the canvas."}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ============ 8. FLOATING TEXT SELECTION TOOLBAR ============ */}
      {selectionToolbar.visible && isEditable && (
        <FloatingTextToolbar
          isId={isId}
          x={selectionToolbar.x}
          y={selectionToolbar.y}
          selectedText={selectionToolbar.selectedText}
          selectedBlock={blocks.find((b) => b.id === (selectionToolbar.blockId || selectedBlockId)) || null}
          targetInput={selectionToolbar.targetInput}
          onApplyStyle={(patch) => {
            const targetId = selectionToolbar.blockId || selectedBlockId;
            if (targetId) {
              updateBlock(targetId, patch);
            }
          }}
          onWrapText={handleWrapSelection}
          onTransformCase={handleTransformCase}
          onClose={() => setSelectionToolbar((prev) => ({ ...prev, visible: false }))}
        />
      )}
    </div>
  );
}

/* ============================================================
 * STUDIO INSPECTOR — right panel (block props or doc settings)
 * ==========================================================*/
interface StudioInspectorProps {
  isId: boolean;
  blocks: DocBlock[];
  selectedBlock: DocBlock | null;
  selectedIndex: number;
  onSelectBlock: (id: string | null) => void;
  onUpdateBlock: (id: string, updates: Partial<DocBlock>) => void;
  onDeleteBlock: (id: string) => void;
  onDuplicateBlock: (id: string) => void;
  onMoveBlock: (id: string, dir: "UP" | "DOWN") => void;
  onResetPosition: (id: string) => void;
  docType: string;
  onDocTypeChange: (v: string) => void;
  department: string;
  onDepartmentChange: (v: string) => void;
  layoutPreset: LayoutPreset;
  onLayoutPresetChange: (v: LayoutPreset) => void;
  targetAuthName: string;
  onTargetAuthNameChange: (v: string) => void;
  activeDeptConfig: (typeof DEPARTMENT_ROUTING_CONFIG)[TargetDepartment];
}

const BLOCK_TYPE_LABELS: Record<DocBlockType, string> = {
  OFFICIAL_LETTERHEAD: "Kop Surat",
  SENDER_ADDRESS: "Alamat Pengirim",
  RECIPIENT_ADDRESS: "Alamat Tujuan",
  PROJECT_SITE_ADDRESS: "Lokasi Proyek",
  CONTACT_CARD: "Kartu Kontak",
  HEADER: "Judul",
  TEXT: "Paragraf",
  CALLOUT: "Catatan",
  LIST_POINTS: "Daftar Poin",
  TABLE: "Tabel",
  METADATA_GRID: "Metadata",
  SIGNATURE_COLUMN: "Kolom TTD",
  SIGNATURE_STAMP: "Stempel TTD",
  DUAL_SIGNATURE: "TTD Ganda",
};

function StudioInspector({
  isId,
  blocks,
  selectedBlock,
  selectedIndex,
  onSelectBlock,
  onUpdateBlock,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
  onResetPosition,
  docType,
  onDocTypeChange,
  department,
  onDepartmentChange,
  layoutPreset,
  onLayoutPresetChange,
  targetAuthName,
  onTargetAuthNameChange,
  activeDeptConfig,
}: StudioInspectorProps) {
  const isKop = selectedBlock?.type === "OFFICIAL_LETTERHEAD" || Boolean(selectedBlock?.isLocked);
  const isSignature =
    selectedBlock?.type === "SIGNATURE_COLUMN" ||
    selectedBlock?.type === "SIGNATURE_STAMP" ||
    selectedBlock?.type === "DUAL_SIGNATURE";
  const isMoved = Boolean(selectedBlock?.x || selectedBlock?.y);

  return (
    <>
      <div className="p-3 border-b border-stone-200/80 bg-stone-50 flex items-center justify-between shrink-0">
        <span className="text-xs font-black text-stone-900 uppercase tracking-tight flex items-center gap-1.5">
          <SlidersHorizontal className="w-4 h-4 text-amber-700" />
          {isId ? "Inspektor" : "Inspector"}
        </span>
        {selectedBlock && (
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-stone-200/80 text-stone-700">
            {BLOCK_TYPE_LABELS[selectedBlock.type] || selectedBlock.type}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs custom-scrollbar">
        {selectedBlock ? (
          isKop ? (
            /* ---- Locked Kop Surat info ---- */
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>{isId ? "Kop Surat Resmi Terstandarisasi" : "Standardized Official Letterhead"}</span>
                </div>
                <p className="text-[11px] text-amber-900/90 leading-relaxed font-medium">
                  {isId
                    ? "Kop surat ini adalah identitas resmi CV. BATU EMAS GROUP yang disamakan persis dengan dokumen penawaran resmi dan tidak dapat diedit maupun dihapus demi standar tata naskah dinas."
                    : "This letterhead is the official CV. BATU EMAS GROUP identity, matching exported quotations, and cannot be edited or deleted."}
                </p>
              </div>
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5 text-[11px] text-stone-700">
                <span className="text-[10px] font-bold text-stone-600 uppercase block mb-1">
                  {isId ? "Data Resmi Terdaftar" : "Registered Official Data"}
                </span>
                <div><b>Badan Usaha:</b> CV. BATU EMAS GROUP</div>
                <div><b>{isId ? "Pabrik & Kantor" : "Plant & Office"}:</b> Dusun Petahunan, Jajag, Gambiran, Banyuwangi 68486</div>
                <div><b>Phone:</b> 0811-1111-3993</div>
                <div><b>Email:</b> pavingjoss@gmail.com</div>
                <div className="text-amber-700 font-bold flex items-center gap-1 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                  <span>{isId ? "Terpasang permanen di atas lembar" : "Permanently pinned at sheet top"}</span>
                </div>
              </div>
              <button
                onClick={() => onSelectBlock(null)}
                className="w-full py-2 rounded-xl text-xs font-bold bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer"
              >
                {isId ? "Tutup pilihan" : "Deselect"}
              </button>
            </div>
          ) : (
            /* ---- Editable block props ---- */
            <div className="space-y-4">
              {/* Order controls */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-stone-700 uppercase">
                    {isId ? "Posisi & Urutan" : "Order & Position"}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-stone-500">
                    #{selectedIndex + 1} / {blocks.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => onMoveBlock(selectedBlock.id, "UP")}
                    disabled={selectedIndex <= 1}
                    className="py-1.5 px-2 rounded-lg text-[10.5px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <ChevronUp className="w-3 h-3" /> {isId ? "Naik" : "Up"}
                  </button>
                  <button
                    onClick={() => onMoveBlock(selectedBlock.id, "DOWN")}
                    disabled={selectedIndex === blocks.length - 1}
                    className="py-1.5 px-2 rounded-lg text-[10.5px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <ChevronDown className="w-3 h-3" /> {isId ? "Turun" : "Down"}
                  </button>
                </div>
                {isMoved && (
                  <button
                    onClick={() => onResetPosition(selectedBlock.id)}
                    className="w-full py-1.5 px-2 rounded-lg text-[10.5px] font-bold bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {isId ? `Reset posisi bebas (${selectedBlock.x || 0}, ${selectedBlock.y || 0})` : `Reset free position (${selectedBlock.x || 0}, ${selectedBlock.y || 0})`}
                  </button>
                )}
                <p className="text-[10px] text-stone-500 leading-snug">
                  {isId
                    ? "Tip: seret gagang ⋮⋮ di blok untuk menyusun ulang dengan cepat, atau gunakan handle biru untuk posisi bebas."
                    : "Tip: drag the ⋮⋮ grip on the block to reorder quickly, or use the blue handle for free positioning."}
                </p>
              </div>

              {/* Alignment & Typography (text blocks) */}
              {(selectedBlock.type === "HEADER" || selectedBlock.type === "TEXT" || selectedBlock.type === "CALLOUT" || selectedBlock.type === "LIST_POINTS") && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-stone-600 uppercase block mb-1.5">
                      {isId ? "Perataan Teks" : "Text Alignment"}
                    </label>
                    <div className="grid grid-cols-4 gap-1 bg-stone-100 p-1 rounded-xl">
                      {(
                        [
                          { v: "LEFT", icon: AlignLeft, label: isId ? "Rata Kiri" : "Align Left" },
                          { v: "CENTER", icon: AlignCenter, label: isId ? "Rata Tengah" : "Center" },
                          { v: "RIGHT", icon: AlignRight, label: isId ? "Rata Kanan" : "Align Right" },
                          { v: "JUSTIFY", icon: AlignJustify, label: isId ? "Rata Kiri-Kanan" : "Justify" },
                        ] as const
                      ).map(({ v, icon: AIcon, label }) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => onUpdateBlock(selectedBlock.id, { alignment: v })}
                          title={label}
                          className={cn(
                            "py-1.5 rounded-lg flex items-center justify-center cursor-pointer transition-all",
                            (selectedBlock.alignment || "LEFT") === v
                              ? "bg-white shadow-2xs text-stone-900 font-bold"
                              : "text-stone-400 hover:text-stone-700"
                          )}
                        >
                          <AIcon className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-stone-600 uppercase block mb-1.5">
                      {isId ? "Perataan Vertikal" : "Vertical Alignment"}
                    </label>
                    <div className="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-xl">
                      {(
                        [
                          { v: "TOP", icon: VerticalAlignTopIcon, label: isId ? "Atas" : "Top" },
                          { v: "MIDDLE", icon: VerticalAlignCenterIcon, label: isId ? "Tengah" : "Middle" },
                          { v: "BOTTOM", icon: VerticalAlignBottomIcon, label: isId ? "Bawah" : "Bottom" },
                        ] as const
                      ).map(({ v, icon: VIcon, label }) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => onUpdateBlock(selectedBlock.id, { verticalAlignment: v })}
                          title={label}
                          className={cn(
                            "py-1.5 rounded-lg flex items-center justify-center gap-1 text-[10px] font-bold cursor-pointer transition-all",
                            (selectedBlock.verticalAlignment || "TOP") === v
                              ? "bg-white shadow-2xs text-stone-900 font-bold"
                              : "text-stone-400 hover:text-stone-700"
                          )}
                        >
                          <VIcon className="w-3.5 h-3.5" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-stone-600 uppercase block mb-1.5">
                      {isId ? "Gaya & Ukuran Font" : "Style & Font Size"}
                    </label>
                    <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { isBold: !selectedBlock.isBold })}
                        title={isId ? "Tebal (Bold)" : "Bold"}
                        className={cn(
                          "p-1.5 rounded-lg flex-1 flex items-center justify-center transition-all cursor-pointer",
                          selectedBlock.isBold ? "bg-white shadow-2xs text-blue-600 font-black" : "text-stone-500 hover:text-stone-900"
                        )}
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { isItalic: !selectedBlock.isItalic })}
                        title={isId ? "Miring (Italic)" : "Italic"}
                        className={cn(
                          "p-1.5 rounded-lg flex-1 flex items-center justify-center transition-all cursor-pointer",
                          selectedBlock.isItalic ? "bg-white shadow-2xs text-blue-600" : "text-stone-500 hover:text-stone-900"
                        )}
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { isUnderline: !selectedBlock.isUnderline })}
                        title={isId ? "Garis Bawah (Underline)" : "Underline"}
                        className={cn(
                          "p-1.5 rounded-lg flex-1 flex items-center justify-center transition-all cursor-pointer",
                          selectedBlock.isUnderline ? "bg-white shadow-2xs text-blue-600" : "text-stone-500 hover:text-stone-900"
                        )}
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { isStrikethrough: !selectedBlock.isStrikethrough })}
                        title={isId ? "Coret (Strikethrough)" : "Strikethrough"}
                        className={cn(
                          "p-1.5 rounded-lg flex-1 flex items-center justify-center transition-all cursor-pointer",
                          selectedBlock.isStrikethrough ? "bg-white shadow-2xs text-blue-600" : "text-stone-500 hover:text-stone-900"
                        )}
                      >
                        <Strikethrough className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-4 bg-stone-300 mx-0.5" />

                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { fontSize: Math.max(9, (selectedBlock.fontSize || 12) - 1) })}
                        title={isId ? "Perkecil font (-1px)" : "Decrease font size"}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono text-[10.5px] font-bold text-stone-700 px-1 min-w-[28px] text-center">
                        {selectedBlock.fontSize || 12}px
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { fontSize: Math.min(48, (selectedBlock.fontSize || 12) + 1) })}
                        title={isId ? "Perbesar font (+1px)" : "Increase font size"}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Callout style */}
              {selectedBlock.type === "CALLOUT" && (
                <div>
                  <label className="text-[10px] font-bold text-stone-600 uppercase block mb-1.5">
                    {isId ? "Gaya Catatan" : "Callout Style"}
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { v: "WARNING", label: isId ? "Penting" : "Warning", cls: "bg-amber-100 text-amber-800 border-amber-300" },
                        { v: "INFO", label: "Info", cls: "bg-blue-100 text-blue-800 border-blue-300" },
                        { v: "SUCCESS", label: isId ? "Sukses" : "Success", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
                      ] as const
                    ).map(({ v, label, cls }) => (
                      <button
                        key={v}
                        onClick={() => onUpdateBlock(selectedBlock.id, { style: v })}
                        className={cn(
                          "py-1.5 rounded-lg text-[10.5px] font-bold border cursor-pointer transition-all",
                          cls,
                          selectedBlock.style === v ? "ring-2 ring-stone-900/20" : "opacity-60 hover:opacity-100"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Signature routing config */}
              {isSignature && (
                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3">
                  <div className="font-bold text-blue-950 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>{isId ? "Trigger Otorisasi" : "Routing Trigger"}</span>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-blue-900 block mb-1">
                      {isId ? "Departemen Otorisasi *" : "Authorization Dept *"}
                    </label>
                    <select
                      value={selectedBlock.targetDepartment || "PURCHASING"}
                      onChange={(e) =>
                        onUpdateBlock(selectedBlock.id, {
                          targetDepartment: e.target.value as TargetDepartment,
                        })
                      }
                      className="w-full text-xs p-2 bg-white border border-blue-300 rounded-lg font-bold text-blue-950 outline-none cursor-pointer"
                    >
                      {ERP_DEPARTMENT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-blue-900 block mb-1">
                      {isId ? "Jabatan Penandatangan" : "Signatory Title"}
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.signatoryTitle || ""}
                      onChange={(e) => onUpdateBlock(selectedBlock.id, { signatoryTitle: e.target.value })}
                      className="w-full text-xs p-2 bg-white border border-blue-200 rounded-lg font-medium outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-blue-900 block mb-1">
                      {isId ? "Catatan Kepatuhan" : "Compliance Notes"}
                    </label>
                    <textarea
                      rows={2}
                      value={selectedBlock.notes || ""}
                      onChange={(e) => onUpdateBlock(selectedBlock.id, { notes: e.target.value })}
                      className="w-full text-xs p-2 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-400 resize-none"
                    />
                  </div>
                  <div className="text-[10px] text-blue-800 italic leading-snug">
                    {isId
                      ? "Mengirim dokumen ini akan mengarahkan workflow ke antrean otorisasi departemen terpilih."
                      : "Submitting routes this document to the selected department's approval queue."}
                  </div>
                </div>
              )}

              {/* Container size */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-stone-700 uppercase flex items-center gap-1">
                    <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>{isId ? "Ukuran Container" : "Container Size"}</span>
                  </span>
                  <span className="text-[10px] text-stone-600 font-mono font-bold">
                    {selectedBlock.width ? `${selectedBlock.width}px` : "100%"} ×{" "}
                    {selectedBlock.height ? `${selectedBlock.height}px` : "Auto"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => onUpdateBlock(selectedBlock.id, { width: undefined, height: undefined })}
                    className="py-1 px-2 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 cursor-pointer"
                  >
                    100%
                  </button>
                  <button
                    onClick={() => onUpdateBlock(selectedBlock.id, { width: 540 })}
                    className="py-1 px-2 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 cursor-pointer"
                  >
                    75%
                  </button>
                  <button
                    onClick={() => onUpdateBlock(selectedBlock.id, { width: 360 })}
                    className="py-1 px-2 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 cursor-pointer"
                  >
                    50%
                  </button>
                </div>
              </div>

              {/* Duplicate / delete */}
              <div className="pt-2 border-t border-stone-100 flex items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => onDuplicateBlock(selectedBlock.id)}
                  className="flex-1 rounded-xl text-xs font-bold gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isId ? "Duplikat" : "Duplicate"}</span>
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => onDeleteBlock(selectedBlock.id)}
                  className="flex-1 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isId ? "Hapus" : "Delete"}</span>
                </Button>
              </div>
            </div>
          )
        ) : (
          /* ---- Document-level settings ---- */
          <div className="space-y-4">
            <div className="text-stone-500 text-[11px] leading-relaxed">
              {isId
                ? "Klik blok pada kanvas untuk mengedit propertinya. Semua teks bisa langsung diklik & diketik di kanvas."
                : "Click a block on the canvas to edit its properties. All text is directly editable on the canvas."}
            </div>

            {/* Doc type & department */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5">
              <span className="text-[10px] font-bold text-stone-600 uppercase block">
                {isId ? "Pengaturan Dokumen" : "Document Settings"}
              </span>
              <div>
                <label className="text-[9px] text-stone-500 font-bold block mb-0.5">
                  {isId ? "Jenis Dokumen" : "Document Type"}
                </label>
                <select
                  value={docType}
                  onChange={(e) => onDocTypeChange(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-bold outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="MEMORANDUM">Memorandum</option>
                  <option value="INTERNAL_POLICY">{isId ? "Kebijakan Internal / SOP" : "Internal Policy / SOP"}</option>
                  <option value="AUTHORIZATION_LETTER">{isId ? "Surat Otorisasi" : "Authorization Letter"}</option>
                  <option value="SURAT_PERINTAH">{isId ? "Surat Perintah Kerja" : "Work Order Letter"}</option>
                  <option value="BERITA_ACARA">Berita Acara</option>
                  <option value="LAINNYA">{isId ? "Lainnya" : "Other"}</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] text-stone-500 font-bold block mb-0.5">
                  {isId ? "Departemen Pembuat" : "Authoring Department"}
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => onDepartmentChange(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-medium outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-[9px] text-stone-500 font-bold block mb-0.5">
                  {isId ? "Nama Otorisator (opsional)" : "Authorizer Name (optional)"}
                </label>
                <input
                  type="text"
                  value={targetAuthName}
                  onChange={(e) => onTargetAuthNameChange(e.target.value)}
                  placeholder={isId ? "mis. Bpk. Haryanto" : "e.g. Mr. Haryanto"}
                  className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-medium outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Layout preset */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-stone-600 uppercase block">
                {isId ? "Format Kertas" : "Paper Format"}
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {(
                  [
                    { v: "A4_PORTRAIT", label: "A4 Portrait (210×297 mm)" },
                    { v: "A4_LANDSCAPE", label: "A4 Landscape (297×210 mm)" },
                    { v: "EXECUTIVE_MEMO", label: isId ? "Memo Eksekutif Formal" : "Executive Memo Formal" },
                  ] as const
                ).map(({ v, label }) => (
                  <button
                    key={v}
                    onClick={() => onLayoutPresetChange(v)}
                    className={cn(
                      "p-2 rounded-lg text-left text-xs font-bold border transition-all flex items-center justify-between cursor-pointer",
                      layoutPreset === v
                        ? "bg-amber-50 border-amber-300 text-amber-900"
                        : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
                    )}
                  >
                    <span>{label}</span>
                    {layoutPreset === v && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Routing summary */}
            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl space-y-1.5">
              <div className="font-bold text-blue-900 flex items-center gap-1.5 text-xs">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>{isId ? "Trigger Otorisasi Aktif" : "Active Routing Trigger"}</span>
              </div>
              <div className="text-[11px] text-blue-950">
                {isId ? "Departemen Target:" : "Target Department:"} <b>{activeDeptConfig.deptNameId}</b>
              </div>
              <div className="text-[10px] text-stone-500 font-mono">Role: {activeDeptConfig.role}</div>
              <p className="text-[11px] text-blue-800 leading-snug">
                {isId ? activeDeptConfig.descriptionId : activeDeptConfig.descriptionEn}
              </p>
            </div>

            {/* Structure / layers list */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-stone-600 uppercase block">
                {isId ? "Struktur Dokumen" : "Document Structure"}
              </span>
              <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
                {blocks.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => onSelectBlock(b.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-white border border-transparent hover:border-stone-200 transition-all cursor-pointer"
                  >
                    <span className="text-[9px] font-mono font-bold text-stone-400 w-5 shrink-0">{i + 1}</span>
                    <span className="text-[11px] font-bold text-stone-700 truncate flex-1">
                      {BLOCK_TYPE_LABELS[b.type] || b.type}
                    </span>
                    {(b.type === "OFFICIAL_LETTERHEAD" || b.isLocked) && (
                      <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
