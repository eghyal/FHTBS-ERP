import React, { useState, useMemo, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  FileText,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
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
  ArrowRight,
  Eye,
  Info,
  AlertTriangle,
  Table as TableIcon,
  ListOrdered,
  Type,
  Phone,
  Mail,
  UserCheck,
  Grid3X3,
  GripVertical,
  Move,
  RotateCcw
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
  WorkspaceDocument,
} from "@/types/workspace";

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
  onSave: (docData: {
    title: string;
    document_type: string;
    department: string;
    content: DocBlock[];
    layout_preset: LayoutPreset;
    authorization_role: string;
    authorization_department: string;
    authorization_user_name: string;
    submitForApproval: boolean;
  }) => Promise<void>;
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
  PURCHASING: {
    role: "PURCHASING_MANAGER",
    deptNameId: "Departemen Purchasing (Pengadaan)",
    deptNameEn: "Purchasing & Procurement Department",
    signatoryTitleId: "Purchasing Manager (Manager Pengadaan)",
    signatoryTitleEn: "Purchasing Manager",
    badgeColor: "bg-blue-50 border-blue-200 text-blue-700",
    descriptionId: "Dokumen ini akan otomatis diteruskan ke Departemen Purchasing untuk diverifikasi dan diotorisasi.",
    descriptionEn: "This document will automatically route to the Purchasing Department for verification and authorization.",
  },
  FINANCE: {
    role: "FINANCE_HEAD",
    deptNameId: "Departemen Keuangan & Finance",
    deptNameEn: "Finance & Accounting Department",
    signatoryTitleId: "Head of Finance & Accounting",
    signatoryTitleEn: "Head of Finance & Accounting",
    badgeColor: "bg-emerald-50 border-emerald-200 text-emerald-700",
    descriptionId: "Dokumen ini akan otomatis diteruskan ke Head of Finance untuk verifikasi anggaran & otorisasi.",
    descriptionEn: "This document will automatically route to the Head of Finance for budget verification.",
  },
  PRODUCTION: {
    role: "PRODUCTION_MANAGER",
    deptNameId: "Departemen Produksi & Pabrik",
    deptNameEn: "Plant & Production Department",
    signatoryTitleId: "Production Manager / Kepala Pabrik",
    signatoryTitleEn: "Production Manager",
    badgeColor: "bg-amber-50 border-amber-200 text-amber-700",
    descriptionId: "Dokumen ini akan otomatis diteruskan ke Production Manager untuk instruksi operasional lantai pabrik.",
    descriptionEn: "This document will automatically route to the Production Manager for floor instructions.",
  },
  FACTORY_CONTROLLER: {
    role: "FACTORY_CONTROLLER",
    deptNameId: "Factory Controller (FC)",
    deptNameEn: "Factory Controller (FC)",
    signatoryTitleId: "Factory Controller",
    signatoryTitleEn: "Factory Controller",
    badgeColor: "bg-purple-50 border-purple-200 text-purple-700",
    descriptionId: "Dokumen ini akan otomatis diteruskan ke Factory Controller untuk audit kepatuhan & standar mutu.",
    descriptionEn: "This document will automatically route to the Factory Controller for compliance audit.",
  },
  MANAGEMENT: {
    role: "PLANT_HEAD",
    deptNameId: "Direksi & Plant Head (GM)",
    deptNameEn: "Plant Head / General Management",
    signatoryTitleId: "Plant Head / General Manager",
    signatoryTitleEn: "Plant Head / General Manager",
    badgeColor: "bg-indigo-50 border-indigo-200 text-indigo-700",
    descriptionId: "Dokumen ini akan otomatis diteruskan ke Direksi / Plant Head untuk pengesahan eksekutif.",
    descriptionEn: "This document will automatically route to Executive Management for final endorsement.",
  },
  WAREHOUSE: {
    role: "WAREHOUSE_SUPERVISOR",
    deptNameId: "Gudang & Logistik",
    deptNameEn: "Warehouse & Logistics",
    signatoryTitleId: "Warehouse & Logistics Supervisor",
    signatoryTitleEn: "Warehouse & Logistics Supervisor",
    badgeColor: "bg-cyan-50 border-cyan-200 text-cyan-700",
    descriptionId: "Dokumen ini akan otomatis diteruskan ke Supervisor Gudang untuk validasi material fisik.",
    descriptionEn: "This document will automatically route to the Warehouse Supervisor for physical validation.",
  },
  GENERAL: {
    role: "ADMIN",
    deptNameId: "Divisi Administrasi Umum",
    deptNameEn: "General Administration",
    signatoryTitleId: "General Administrator",
    signatoryTitleEn: "General Administrator",
    badgeColor: "bg-stone-50 border-stone-200 text-stone-700",
    descriptionId: "Dokumen ini akan diteruskan untuk persetujuan administrasi umum.",
    descriptionEn: "This document will route for general administrative approval.",
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

interface ResizeState {
  blockId: string;
  handle: "se" | "e" | "s";
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

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
  // Document Level States
  const [docTitle, setDocTitle] = useState(initialTitle || "Untitled Document");
  const [docType, setDocType] = useState(initialDocType || "MEMORANDUM");
  const [department, setDepartment] = useState(initialDepartment || "General");
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>(initialLayoutPreset);

  // Active Routing States (Triggered by Signature Column)
  const [targetAuthRole, setTargetAuthRole] = useState<string>(initialAuthRole || "PURCHASING_MANAGER");
  const [targetAuthDept, setTargetAuthDept] = useState<TargetDepartment>(
    (initialAuthDepartment as TargetDepartment) || "PURCHASING"
  );
  const [targetAuthName, setTargetAuthName] = useState(initialAuthName || "");

  // Canvas Blocks (Official Kop Surat is ALWAYS guaranteed at index 0 and locked)
  const [blocks, setBlocks] = useState<DocBlock[]>(() => {
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
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    initialBlocks && initialBlocks.length > 0 ? initialBlocks[0].id : "blk-official-letterhead"
  );

  // Studio UI Controls & Grid Guidelines
  const [sidebarTab, setSidebarTab] = useState<BlockCategory>("SIGNATURE_COLUMN");
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [lastTriggerNotice, setLastTriggerNotice] = useState<string | null>(null);

  // Hold-and-Move Mouse Drag Interaction State (Free Positioning)
  const [dragging, setDragging] = useState<{
    blockId: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  // Hold-and-Move Mouse Resize Interaction State
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  const [liveDimensions, setLiveDimensions] = useState<{ width: number; height: number } | null>(null);

  // Global mousemove and mouseup listeners for container free-position hold-and-drag
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const zoomFactor = zoomLevel / 100;
      let deltaX = (e.clientX - dragging.startX) / zoomFactor;
      let deltaY = (e.clientY - dragging.startY) / zoomFactor;

      let newX = Math.round(dragging.initialX + deltaX);
      let newY = Math.round(dragging.initialY + deltaY);

      // Snap to grid if showGrid is active (10px grid step)
      if (showGrid) {
        newX = Math.round(newX / 10) * 10;
        newY = Math.round(newY / 10) * 10;
      }

      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== dragging.blockId) return b;
          return {
            ...b,
            x: newX,
            y: newY,
          };
        })
      );
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, zoomLevel, showGrid]);

  const handleStartDrag = (e: React.MouseEvent, blockId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const currentBlock = blocks.find((b) => b.id === blockId);
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

  const handleResetBlockPosition = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          x: 0,
          y: 0,
        };
      })
    );
  };

  // Global mousemove and mouseup listeners for container resize
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

      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== resizing.blockId) return b;
          return {
            ...b,
            width: newWidth,
            height: newHeight,
          };
        })
      );
    };

    const handleMouseUp = () => {
      setResizing(null);
      setLiveDimensions(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, zoomLevel, showGrid]);

  const handleStartResize = (
    e: React.MouseEvent,
    blockId: string,
    handle: "se" | "e" | "s"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const containerElem = document.getElementById(`doc-container-${blockId}`);
    if (!containerElem) return;

    const rect = containerElem.getBoundingClientRect();
    const currentBlock = blocks.find((b) => b.id === blockId);

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

  // Selected Block Reference
  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) || null,
    [blocks, selectedBlockId]
  );

  // Automatically recalculate and sync target department whenever signature columns change
  const syncRoutingFromBlocks = (newBlocks: DocBlock[]) => {
    // Find the latest or primary signature column in the document
    const sigBlock = newBlocks.find(
      (b) =>
        b.type === "SIGNATURE_COLUMN" ||
        b.type === "SIGNATURE_STAMP" ||
        b.type === "DUAL_SIGNATURE"
    );

    if (sigBlock && sigBlock.targetDepartment) {
      const dept = sigBlock.targetDepartment;
      const config = DEPARTMENT_ROUTING_CONFIG[dept];
      if (config) {
        setTargetAuthDept(dept);
        setTargetAuthRole(config.role);
        setLastTriggerNotice(
          isId
            ? `⚡ Auto-Trigger Aktif: Dokumen otomatis diarahkan ke ${config.deptNameId} (${config.signatoryTitleId})`
            : `⚡ Auto-Trigger Active: Document routed to ${config.deptNameEn} (${config.signatoryTitleEn})`
        );
      }
    }
  };

  // Insert a new graphic template block into canvas
  const handleInsertGraphicTemplate = (type: DocBlockType, customDept?: TargetDepartment) => {
    // If official letterhead is requested, it's already permanently active at index 0
    if (type === "OFFICIAL_LETTERHEAD") {
      setLastTriggerNotice(
        isId
          ? "🔒 Kop Surat Resmi PT FATHIN BUMI PRATAMA sudah terpasang permanen di posisi paling atas kanvas dan tidak dapat diubah/dihapus."
          : "🔒 Official Letterhead is already permanently active at the top of canvas and cannot be edited or deleted."
      );
      const kopBlock = blocks.find((b) => b.type === "OFFICIAL_LETTERHEAD");
      if (kopBlock) setSelectedBlockId(kopBlock.id);
      return;
    }

    const newId = "blk-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
    let newBlock: DocBlock;

    if (type === "SIGNATURE_COLUMN" || type === "DUAL_SIGNATURE" || type === "SIGNATURE_STAMP") {
      const dept: TargetDepartment = customDept || "PURCHASING";
      const config = DEPARTMENT_ROUTING_CONFIG[dept];

      newBlock = {
        id: newId,
        type,
        category: "SIGNATURE_COLUMN",
        title: isId ? `Kolom Otorisasi & Pengesahan: ${config.deptNameId}` : `Authorization Sign-off: ${config.deptNameEn}`,
        subtitle: isId ? `Tanda Tangan Resmi ${config.signatoryTitleId}` : `Official Signature ${config.signatoryTitleEn}`,
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

      // Instantly trigger routing update
      setTargetAuthDept(dept);
      setTargetAuthRole(config.role);
      setLastTriggerNotice(
        isId
          ? `⚡ Otorisasi Terhubung: Dokumen otomatis akan diteruskan ke ${config.deptNameId} untuk dibaca dan disetujui.`
          : `⚡ Routing Trigger Connected: Document will automatically be forwarded to ${config.deptNameEn}.`
      );
    } else if (type === "SENDER_ADDRESS") {
      newBlock = {
        id: newId,
        type: "SENDER_ADDRESS",
        category: "ADDRESS_TEMPLATE",
        title: isId ? "ALAMAT PENGIRIM (FROM)" : "SENDER ADDRESS (FROM)",
        addressData: {
          companyName: "PT Fathin Bumi Pratama",
          division: "Divisi Operasional & Rekayasa Workshop",
          contactPerson: "Ir. Bambang Wijaya (Plant Manager)",
          streetAddress: "Plant Yard Menganti Line #2",
          phone: "Ext. 204 / +62 813-1122-3344",
          email: "workshop@pavingjoss.com",
        },
        style: "NORMAL",
        alignment: "LEFT",
      };
    } else if (type === "RECIPIENT_ADDRESS") {
      newBlock = {
        id: newId,
        type: "RECIPIENT_ADDRESS",
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
    } else if (type === "PROJECT_SITE_ADDRESS") {
      newBlock = {
        id: newId,
        type: "PROJECT_SITE_ADDRESS",
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
    } else if (type === "HEADER") {
      newBlock = {
        id: newId,
        type: "HEADER",
        category: "BODY_TEXT",
        title: isId ? "MEMORANDUM RESMI INTERNAL" : "OFFICIAL INTERNAL MEMORANDUM",
        content: isId ? "No: MEMO/OPS/2026/X/001" : "Doc Ref: MEMO/OPS/2026/X/001",
        alignment: "CENTER",
        style: "NORMAL",
      };
    } else if (type === "TEXT") {
      newBlock = {
        id: newId,
        type: "TEXT",
        category: "BODY_TEXT",
        content: isId
          ? "Sehubungan dengan evaluasi operasional pabrik, dokumen ini diterbitkan untuk memastikan seluruh prosedur dan alokasi sumber daya memenuhi standar baku mutu yang telah ditetapkan."
          : "In connection with plant operational evaluation, this document is issued to verify that all workflows comply with standard manufacturing protocols.",
        alignment: "LEFT",
        style: "NORMAL",
      };
    } else if (type === "CALLOUT") {
      newBlock = {
        id: newId,
        type: "CALLOUT",
        category: "BODY_TEXT",
        title: isId ? "PERHATIAN KHUSUS & KETENTUAN MUTLAK" : "CRITICAL POLICY NOTICE",
        content: isId
          ? "Seluruh pengadaan dan perubahan alokasi wajib diotorisasi oleh pejabat departemen terkait sebelum tindakan fisik dimulai."
          : "All procurement and resource adjustments must be authorized by designated department heads prior to physical floor execution.",
        style: "WARNING",
        alignment: "LEFT",
      };
    } else if (type === "LIST_POINTS") {
      newBlock = {
        id: newId,
        type: "LIST_POINTS",
        category: "BODY_TEXT",
        title: isId ? "Poin-Poin Instruksi & Regulasi:" : "Instruction Points & Policy Terms:",
        listItems: [
          isId ? "1. Verifikasi spesifikasi fisik komponen sebelum serah terima." : "1. Verify physical specifications before handover.",
          isId ? "2. Catat seluruh nomor seri / batch pada sistem ERP." : "2. Record all serial numbers and batch tags into ERP.",
          isId ? "3. Laporkan kendala teknis dalam kurun waktu maksimum 2 jam." : "3. Report any bottlenecks within a maximum of 2 hours.",
        ],
        alignment: "LEFT",
        style: "NORMAL",
      };
    } else if (type === "TABLE") {
      newBlock = {
        id: newId,
        type: "TABLE",
        category: "BODY_TEXT",
        title: isId ? "Matriks Komponen Kebutuhan / Spesifikasi" : "Material & Component Specification Matrix",
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
    } else {
      newBlock = {
        id: newId,
        type: "METADATA_GRID",
        category: "BODY_TEXT",
        title: isId ? "Informasi Singkat Dokumen" : "Document Quick Metadata",
        metaData: [
          { key: isId ? "Tanggal Terbit" : "Issued Date", value: new Date().toLocaleDateString("id-ID") },
          { key: isId ? "Tingkat Urgensi" : "Urgency", value: "Prioritas Standar (Normal)" },
          { key: isId ? "Departemen Pembuat" : "Authoring Dept", value: department || "Operations" },
          { key: isId ? "Kerahasiaan" : "Confidentiality", value: "Internal Paving Joss Only" },
        ],
        style: "NORMAL",
        alignment: "LEFT",
      };
    }

    setBlocks((prev) => {
      const updated = [...prev, newBlock];
      syncRoutingFromBlocks(updated);
      return updated;
    });
    setSelectedBlockId(newId);
  };

  // Block updates
  const handleUpdateBlock = (id: string, updates: Partial<DocBlock>) => {
    setBlocks((prev) => {
      const updated = prev.map((b) => {
        if (b.id !== id) return b;
        // Protect Kop Surat from text/company tampering
        if (b.type === "OFFICIAL_LETTERHEAD" || b.isLocked) {
          return {
            ...b,
            width: updates.width !== undefined ? updates.width : b.width,
            height: updates.height !== undefined ? updates.height : b.height,
          };
        }
        const modified = { ...b, ...updates };

        // If targetDepartment changed on a signature column, sync routing immediately
        if (updates.targetDepartment && updates.targetDepartment !== b.targetDepartment) {
          const config = DEPARTMENT_ROUTING_CONFIG[updates.targetDepartment];
          if (config) {
            modified.targetRole = config.role;
            modified.signatoryTitle = isId ? config.signatoryTitleId : config.signatoryTitleEn;
            setTargetAuthDept(updates.targetDepartment);
            setTargetAuthRole(config.role);
            setLastTriggerNotice(
              isId
                ? `⚡ Otorisasi dialihkan ke ${config.deptNameId}. Dokumen akan diteruskan ke departemen ini.`
                : `⚡ Authorization rerouted to ${config.deptNameEn}.`
            );
          }
        }
        return modified;
      });
      syncRoutingFromBlocks(updated);
      return updated;
    });
  };

  // Reordering & Actions (Kop Surat is permanently pinned at top index 0)
  const handleMoveBlock = (id: string, direction: "UP" | "DOWN") => {
    const target = blocks.find((b) => b.id === id);
    if (target?.type === "OFFICIAL_LETTERHEAD" || target?.isLocked) {
      return; // Cannot move Kop Surat
    }
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx === -1) return prev;
      if (direction === "UP" && idx <= 1) return prev; // Cannot move above Kop Surat at index 0
      if (direction === "DOWN" && idx === prev.length - 1) return prev;

      const targetIdx = direction === "UP" ? idx - 1 : idx + 1;
      const clone = [...prev];
      const temp = clone[idx];
      clone[idx] = clone[targetIdx];
      clone[targetIdx] = temp;
      return clone;
    });
  };

  const handleDuplicateBlock = (id: string) => {
    const target = blocks.find((b) => b.id === id);
    if (target?.type === "OFFICIAL_LETTERHEAD" || target?.isLocked) {
      setLastTriggerNotice(
        isId
          ? "🔒 Kop Surat Resmi sudah aktif permanen dan tidak dapat diduplikasi."
          : "🔒 Official Letterhead is permanently active and cannot be duplicated."
      );
      return;
    }
    const duplicated: DocBlock = {
      ...JSON.parse(JSON.stringify(target)),
      id: "blk-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    };
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      const clone = [...prev];
      clone.splice(idx + 1, 0, duplicated);
      return clone;
    });
    setSelectedBlockId(duplicated.id);
  };

  const handleDeleteBlock = (id: string) => {
    const target = blocks.find((b) => b.id === id);
    if (target?.type === "OFFICIAL_LETTERHEAD" || target?.isLocked) {
      setLastTriggerNotice(
        isId
          ? "🔒 Kop Surat Resmi PT FATHIN BUMI PRATAMA bersifat permanen dan tidak dapat dihapus demi integritas dokumen resmi."
          : "🔒 Official Letterhead is permanent and cannot be deleted for official document compliance."
      );
      return;
    }
    setBlocks((prev) => {
      const updated = prev.filter((b) => b.id !== id);
      syncRoutingFromBlocks(updated);
      return updated;
    });
    if (selectedBlockId === id) setSelectedBlockId(null);
  };

  // Save handler
  const handleTriggerSave = async (submitForApproval: boolean) => {
    await onSave({
      title: docTitle.trim() || "Untitled Document",
      document_type: docType,
      department: department || "General",
      content: blocks,
      layout_preset: layoutPreset,
      authorization_role: targetAuthRole,
      authorization_department: targetAuthDept,
      authorization_user_name: targetAuthName.trim(),
      submitForApproval,
    });
  };

  const activeDeptConfig = DEPARTMENT_ROUTING_CONFIG[targetAuthDept] || DEPARTMENT_ROUTING_CONFIG.PURCHASING;

  return (
    <div className="fixed inset-0 z-50 bg-stone-100 flex flex-col font-sans select-none overflow-hidden">
      {/* 1. TOP STUDIO NAVIGATION BAR */}
      <header className="h-14 bg-white border-b border-stone-200/90 px-4 flex items-center justify-between gap-3 shrink-0 shadow-2xs z-20">
        {/* Left: Back & Title Edit */}
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 text-xs font-bold gap-1 px-2.5"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">{isId ? "Tutup Studio" : "Close Studio"}</span>
          </Button>

          <div className="h-4 w-px bg-stone-200 hidden sm:block" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/80 shrink-0">
              <FileText className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder={isId ? "Judul Dokumen..." : "Document Title..."}
              className="text-sm font-black text-stone-900 bg-transparent hover:bg-stone-50 focus:bg-white border border-transparent hover:border-stone-200 focus:border-amber-500 rounded-lg px-2 py-1 outline-none transition-all truncate max-w-xs sm:max-w-md"
            />
          </div>
        </div>

        {/* Center: Live Authorization Trigger Badge */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-900 text-xs font-medium">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-stone-500 text-[11px]">{isId ? "Tujuan Otorisasi:" : "Target Authorization:"}</span>
          <span className="font-bold text-blue-800">{activeDeptConfig.deptNameId}</span>
        </div>

        {/* Right: Layout Preset, Grid Toggle, Zoom & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Grid Toggle Button */}
          <button
            onClick={() => setShowGrid((g) => !g)}
            className={cn(
              "px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border shadow-2xs",
              showGrid
                ? "bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-500/20"
                : "bg-white text-stone-600 border-stone-300 hover:bg-stone-100"
            )}
            title={isId ? "Tampilkan atau sembunyikan grid layout untuk kerapian penyusunan" : "Toggle layout grid guides"}
          >
            <Grid3X3 className={cn("w-3.5 h-3.5", showGrid ? "text-blue-600" : "text-stone-500")} />
            <span className="hidden sm:inline">{showGrid ? (isId ? "Grid: On" : "Grid: On") : (isId ? "Grid: Off" : "Grid: Off")}</span>
          </button>

          {/* Zoom controls */}
          <div className="hidden md:flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200/80 text-xs">
            <button
              onClick={() => setZoomLevel((z) => Math.max(50, z - 15))}
              className="p-1 hover:bg-white rounded text-stone-600 hover:text-stone-900"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono text-[11px] font-bold text-stone-700 min-w-[36px] text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(150, z + 15))}
              className="p-1 hover:bg-white rounded text-stone-600 hover:text-stone-900"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(100)}
              className="p-1 hover:bg-white rounded text-stone-600 hover:text-stone-900"
              title="Reset Zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Save Draft */}
          <Button
            onClick={() => handleTriggerSave(false)}
            disabled={isSaving}
            variant="outline"
            size="sm"
            className="rounded-xl border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold gap-1.5 shadow-2xs"
          >
            <Save className="w-3.5 h-3.5 text-stone-600" />
            <span className="hidden sm:inline">{isId ? "Simpan Draft" : "Save Draft"}</span>
          </Button>

          {/* Submit For Approval (Forwards to target department!) */}
          <Button
            onClick={() => handleTriggerSave(true)}
            disabled={isSaving}
            variant="primary"
            size="sm"
            className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black gap-1.5 shadow-2xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {isId ? `Kirim ke Dept (${targetAuthDept})` : `Submit to Dept (${targetAuthDept})`}
            </span>
          </Button>
        </div>
      </header>

      {/* Trigger Notification Alert Bar */}
      {lastTriggerNotice && (
        <div className="bg-blue-600 text-white text-xs py-1.5 px-4 flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="font-semibold">{lastTriggerNotice}</span>
          </div>
          <button
            onClick={() => setLastTriggerNotice(null)}
            className="text-blue-200 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. MAIN WORKSPACE: SIDEBAR (GRAPHIC LIBRARY) + CANVAS + INSPECTOR */}
      <div className="flex-1 flex overflow-hidden">
        {/* ======================================================== */}
        {/* A. LEFT GRAPHIC TEMPLATES DRAWER (Canva Style)           */}
        {/* ======================================================== */}
        <aside className="w-80 bg-white border-r border-stone-200/90 flex flex-col shrink-0 shadow-xs z-10">
          {/* Category Tabs: Body Text, Template Alamat, Signature Kolom */}
          <div className="p-2 border-b border-stone-200/80 bg-stone-50/70">
            <div className="grid grid-cols-3 gap-1 bg-stone-200/70 p-1 rounded-xl">
              <button
                onClick={() => setSidebarTab("BODY_TEXT")}
                className={cn(
                  "py-2 px-1 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all flex flex-col items-center gap-1",
                  sidebarTab === "BODY_TEXT"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                <Type className="w-4 h-4 text-amber-700" />
                <span>Body Text</span>
              </button>

              <button
                onClick={() => setSidebarTab("ADDRESS_TEMPLATE")}
                className={cn(
                  "py-2 px-1 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all flex flex-col items-center gap-1",
                  sidebarTab === "ADDRESS_TEMPLATE"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                <Building2 className="w-4 h-4 text-blue-700" />
                <span>Alamat</span>
              </button>

              <button
                onClick={() => setSidebarTab("SIGNATURE_COLUMN")}
                className={cn(
                  "py-2 px-1 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all flex flex-col items-center gap-1 relative",
                  sidebarTab === "SIGNATURE_COLUMN"
                    ? "bg-white text-stone-900 shadow-xs ring-1 ring-amber-500/30"
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                <PenTool className="w-4 h-4 text-purple-700" />
                <span>Signature</span>
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-600" />
              </button>
            </div>
          </div>

          {/* Graphic Template Cards Stream */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
            {/* 1. SIGNATURE COLUMN TEMPLATES (Auto-Trigger Otorisasi) */}
            {sidebarTab === "SIGNATURE_COLUMN" && (
              <div className="space-y-3">
                <div className="bg-purple-50/80 border border-purple-200/80 rounded-xl p-2.5 text-xs text-purple-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-purple-950">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>Auto-Trigger Otorisasi Otomatis</span>
                  </div>
                  <p className="text-[11px] text-purple-800/90 leading-relaxed">
                    Setiap kolom tanda tangan yang diinsert akan <b>otomatis menjadi trigger</b> bahwa dokumen wajib diteruskan dan dibaca oleh departemen tersebut.
                  </p>
                </div>

                {/* Purchasing Signature Card */}
                <div
                  onClick={() => handleInsertGraphicTemplate("SIGNATURE_COLUMN", "PURCHASING")}
                  className="group p-3 rounded-xl border border-blue-200 bg-white hover:bg-blue-50/40 hover:border-blue-400 cursor-pointer shadow-2xs transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      Signature Purchasing
                    </span>
                    <span className="text-[9px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                      PURCHASING
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Otorisasi Manager Pengadaan. Dokumen otomatis diteruskan ke tim Purchasing untuk diverifikasi & diotorisasi.
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-blue-600 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>+ Pasang Kolom TTD Purchasing</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>

                {/* Finance Signature Card */}
                <div
                  onClick={() => handleInsertGraphicTemplate("SIGNATURE_COLUMN", "FINANCE")}
                  className="group p-3 rounded-xl border border-emerald-200 bg-white hover:bg-emerald-50/40 hover:border-emerald-400 cursor-pointer shadow-2xs transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Signature Finance
                    </span>
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                      FINANCE
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Otorisasi Head of Finance. Otomatis diteruskan untuk verifikasi anggaran & pencairan dana.
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-emerald-600 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>+ Pasang Kolom TTD Finance</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>

                {/* Production Signature Card */}
                <div
                  onClick={() => handleInsertGraphicTemplate("SIGNATURE_COLUMN", "PRODUCTION")}
                  className="group p-3 rounded-xl border border-amber-200 bg-white hover:bg-amber-50/40 hover:border-amber-400 cursor-pointer shadow-2xs transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                      Signature Produksi
                    </span>
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                      PRODUCTION
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Otorisasi Kepala Produksi / Plant Head. Untuk instruksi lini pabrik & jadwal mesin.
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-amber-600 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>+ Pasang Kolom TTD Produksi</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>

                {/* Factory Controller Signature Card */}
                <div
                  onClick={() => handleInsertGraphicTemplate("SIGNATURE_COLUMN", "FACTORY_CONTROLLER")}
                  className="group p-3 rounded-xl border border-purple-200 bg-white hover:bg-purple-50/40 hover:border-purple-400 cursor-pointer shadow-2xs transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-purple-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                      Signature Factory Controller (FC)
                    </span>
                    <span className="text-[9px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">
                      FC
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Otorisasi Factory Controller untuk pengendalian biaya produksi & audit sistem.
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-purple-600 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>+ Pasang Kolom TTD FC</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>

                {/* Direksi / Plant Head Signature Card */}
                <div
                  onClick={() => handleInsertGraphicTemplate("SIGNATURE_COLUMN", "MANAGEMENT")}
                  className="group p-3 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50/40 hover:border-indigo-400 cursor-pointer shadow-2xs transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                      Signature Direksi / GM
                    </span>
                    <span className="text-[9px] font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                      MANAGEMENT
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Otorisasi tertinggi Direksi / General Manager untuk memorandum eksekutif.
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-indigo-600 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>+ Pasang Kolom TTD Direksi</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>

                {/* Dual Signature (Creator + Target Dept) */}
                <div
                  onClick={() => handleInsertGraphicTemplate("DUAL_SIGNATURE", "PURCHASING")}
                  className="group p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-400 cursor-pointer shadow-2xs transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-stone-900 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-stone-700" />
                      Dual Signature (Pembuat + Pejabat)
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Format resmi 2 kolom: Tanda tangan pembuat di kiri dan tanda tangan otorisator di kanan.
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-stone-700 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>+ Pasang Dual Signature</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            )}

            {/* 2. ADDRESS TEMPLATES (Kop Surat, Alamat Vendor, Alamat Lapangan) */}
            {sidebarTab === "ADDRESS_TEMPLATE" && (
              <div className="space-y-3">
                <div className="text-[11px] text-stone-500 font-medium pb-1 border-b border-stone-100">
                  Pilih format alamat atau kop surat untuk ditempatkan pada dokumen:
                </div>

                {/* Kop Resmi CV. BATU EMAS GROUP (Quotation Reference) */}
                <div
                  onClick={() => handleInsertGraphicTemplate("OFFICIAL_LETTERHEAD")}
                  className="group p-3 rounded-xl border border-amber-300 bg-amber-50/50 hover:bg-amber-100/60 cursor-pointer shadow-2xs transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                      Kop Surat Resmi Quotation
                    </span>
                    <span className="text-[9px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                      TERPASANG PERMANEN
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900/80 leading-tight">
                    Kop terstandarisasi CV. Batu Emas Group (Logo, Alamat Petahunan Banyuwangi, Phone 0811-1111-3993, & QR Code Validasi).
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-amber-800 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>🔒 Terpasang & Terkunci di Kanvas</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />
                  </div>
                </div>

                {/* Alamat Pengirim Internal */}
                <div
                  onClick={() => handleInsertGraphicTemplate("SENDER_ADDRESS")}
                  className="group p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-400 cursor-pointer shadow-2xs transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-stone-900 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-stone-700" />
                      Alamat Pengirim (From)
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Blok identitas divisi internal pengirim dokumen, kontak ekstensi, dan penanggung jawab teknis.
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-stone-700 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>+ Pasang Alamat Pengirim</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>

                {/* Alamat Tujuan / Rekanan Eksternal */}
                <div
                  onClick={() => handleInsertGraphicTemplate("RECIPIENT_ADDRESS")}
                  className="group p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-400 cursor-pointer shadow-2xs transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-stone-900 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-700" />
                      Alamat Rekanan / Vendor (To)
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Format tujuan surat resmi kepada vendor rekanan, supplier bahan baku, atau customer proyek.
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-blue-700 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>+ Pasang Alamat Tujuan</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>

                {/* Alamat Lokasi Proyek Lapangan */}
                <div
                  onClick={() => handleInsertGraphicTemplate("PROJECT_SITE_ADDRESS")}
                  className="group p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-400 cursor-pointer shadow-2xs transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-stone-900 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                      Lokasi Proyek / Job Site
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Alamat serah terima barang di lapangan proyek, instruksi akses truk tronton, dan kontak mandor.
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-emerald-700 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>+ Pasang Lokasi Proyek</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            )}

            {/* 3. BODY TEXT TEMPLATES */}
            {sidebarTab === "BODY_TEXT" && (
              <div className="space-y-3">
                <div className="text-[11px] text-stone-500 font-medium pb-1 border-b border-stone-100">
                  Elemen teks terstruktur untuk menyusun narasi dokumen:
                </div>

                {/* Judul Dokumen */}
                <div
                  onClick={() => handleInsertGraphicTemplate("HEADER")}
                  className="group p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-400 cursor-pointer shadow-2xs transition-all space-y-1"
                >
                  <div className="text-xs font-black text-stone-900 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-stone-700" />
                    Judul Resmi Dokumen
                  </div>
                  <p className="text-[11px] text-stone-500">Judul kapital tegas dengan nomor registrasi dokumen.</p>
                </div>

                {/* Paragraf Isi */}
                <div
                  onClick={() => handleInsertGraphicTemplate("TEXT")}
                  className="group p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-400 cursor-pointer shadow-2xs transition-all space-y-1"
                >
                  <div className="text-xs font-black text-stone-900 flex items-center gap-1.5">
                    <AlignLeft className="w-3.5 h-3.5 text-stone-700" />
                    Paragraf Teks Instruksi
                  </div>
                  <p className="text-[11px] text-stone-500">Blok narasi paragraf standar dengan jarak baris proporsional.</p>
                </div>

                {/* Kotak Sorotan / Callout */}
                <div
                  onClick={() => handleInsertGraphicTemplate("CALLOUT")}
                  className="group p-3 rounded-xl border border-amber-200 bg-white hover:bg-amber-50/50 hover:border-amber-400 cursor-pointer shadow-2xs transition-all space-y-1"
                >
                  <div className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Kotak Catatan / Ketentuan Kritis
                  </div>
                  <p className="text-[11px] text-stone-500">Callout box dengan latar lembut untuk instruksi penting.</p>
                </div>

                {/* Poin Regulasi (List) */}
                <div
                  onClick={() => handleInsertGraphicTemplate("LIST_POINTS")}
                  className="group p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-400 cursor-pointer shadow-2xs transition-all space-y-1"
                >
                  <div className="text-xs font-black text-stone-900 flex items-center gap-1.5">
                    <ListOrdered className="w-3.5 h-3.5 text-stone-700" />
                    Poin Regulasi & Kebijakan
                  </div>
                  <p className="text-[11px] text-stone-500">Daftar bernomor untuk butir-butir syarat atau ketentuan resmi.</p>
                </div>

                {/* Tabel Matriks Data */}
                <div
                  onClick={() => handleInsertGraphicTemplate("TABLE")}
                  className="group p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-400 cursor-pointer shadow-2xs transition-all space-y-1"
                >
                  <div className="text-xs font-black text-stone-900 flex items-center gap-1.5">
                    <TableIcon className="w-3.5 h-3.5 text-stone-700" />
                    Tabel Spesifikasi & Kebutuhan
                  </div>
                  <p className="text-[11px] text-stone-500">Tabel matriks dengan kolom header dan baris terstruktur.</p>
                </div>

                {/* Grid Metadata Key-Value */}
                <div
                  onClick={() => handleInsertGraphicTemplate("METADATA_GRID")}
                  className="group p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-400 cursor-pointer shadow-2xs transition-all space-y-1"
                >
                  <div className="text-xs font-black text-stone-900 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-stone-700" />
                    Grid Metadata Parameter
                  </div>
                  <p className="text-[11px] text-stone-500">Kotak key-value untuk tanggal, sifat surat, dan klasifikasi.</p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ======================================================== */}
        {/* B. CENTER CANVA WORKBENCH & INTERACTIVE SHEET            */}
        {/* ======================================================== */}
        <main className="flex-1 bg-stone-200/70 overflow-auto p-8 flex justify-center items-start custom-scrollbar bg-[radial-gradient(#d6d3d1_1px,transparent_1px)] [background-size:16px_16px]">
          <div
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: "top center",
              transition: "transform 0.15s ease-out",
            }}
            className={cn(
              "bg-white shadow-xl rounded-xl transition-all border border-stone-300 relative print:shadow-none print:border-none z-0",
              layoutPreset === "A4_PORTRAIT" && "w-[800px] min-h-[1130px] p-12",
              layoutPreset === "A4_LANDSCAPE" && "w-[1130px] min-h-[800px] p-12",
              layoutPreset === "EXECUTIVE_MEMO" && "w-[750px] min-h-[950px] p-10"
            )}
          >
            {/* Interactive Precision Layout Grid Overlay (Toggleable Grid) */}
            {showGrid && (
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

            {/* Sheet Margin Guide (Subtle) */}
            <div className="space-y-6 relative z-10">
              {blocks.length === 0 ? (
                <div className="py-24 text-center border-2 border-dashed border-stone-200 rounded-2xl space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto border border-amber-200">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-stone-800">
                      {isId ? "Canvas Dokumen Masih Kosong" : "Canvas Sheet is Empty"}
                    </h4>
                    <p className="text-xs text-stone-500 max-w-sm mx-auto">
                      {isId
                        ? "Pilih template Body Text, Alamat, atau Signature Kolom di panel kiri untuk mulai menyusun dokumen seperti Canva."
                        : "Select templates from the left sidebar to add graphic containers to this canvas."}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleInsertGraphicTemplate("OFFICIAL_LETTERHEAD")}
                      className="rounded-xl text-xs font-bold"
                    >
                      + Pasang Kop Resmi
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleInsertGraphicTemplate("SIGNATURE_COLUMN", "PURCHASING")}
                      className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                    >
                      + Pasang TTD Purchasing
                    </Button>
                  </div>
                </div>
              ) : (
                blocks.map((block, idx) => {
                  const isSelected = selectedBlockId === block.id;
                  const isKop = block.type === "OFFICIAL_LETTERHEAD" || Boolean(block.isLocked);
                  const isMoved = Boolean(block.x || block.y);

                  return (
                    <div
                      key={block.id}
                      id={`doc-container-${block.id}`}
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
                        transform: (block.x || block.y) ? `translate(${block.x || 0}px, ${block.y || 0}px)` : undefined,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBlockId(block.id);
                      }}
                      className={cn(
                        "relative group transition-all rounded-xl",
                        isSelected
                          ? "ring-2 ring-blue-500 ring-offset-2 p-3 bg-blue-50/15"
                          : "hover:ring-1 hover:ring-stone-300 p-2",
                        isKop && "hover:ring-amber-300",
                        dragging && dragging.blockId === block.id && "opacity-90 shadow-2xl ring-2 ring-amber-500 cursor-grabbing z-30"
                      )}
                    >
                      {/* Hold-and-Drag Free Position Tag on Top-Left */}
                      {isSelected && !isKop && (
                        <div
                          onMouseDown={(e) => handleStartDrag(e, block.id)}
                          className="absolute -top-3.5 left-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-2.5 py-0.5 shadow-md z-30 text-[10px] font-bold flex items-center gap-1.5 cursor-grab active:cursor-grabbing transition-colors"
                          title={isId ? "Tahan (hold) & geser mouse untuk memindahkan container ini secara bebas pada canvas" : "Hold & drag mouse to move container freely"}
                        >
                          <Move className="w-3 h-3 text-amber-300" />
                          <span>{isId ? "Hold & Drag" : "Hold & Drag"}</span>
                          {isMoved && (
                            <span className="font-mono text-[9px] text-blue-200 bg-blue-800/80 px-1 rounded ml-0.5">
                              ({block.x || 0}, {block.y || 0})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Live Drag Position Tooltip Indicator */}
                      {dragging && dragging.blockId === block.id && (
                        <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-blue-900 text-white text-[10px] font-mono px-2.5 py-1 rounded-md shadow-xl z-50 flex items-center gap-1.5 pointer-events-none animate-in fade-in">
                          <Move className="w-3 h-3 text-amber-300" />
                          <span>📍 Posisi: X: {block.x || 0}px, Y: {block.y || 0}px {showGrid ? "(Grid Snapped)" : ""}</span>
                        </div>
                      )}

                      {/* Floating Selection Controls (Figma/Canva Handle) */}
                      {isSelected && (
                        <div className="absolute -top-3.5 right-2 flex items-center gap-1.5 bg-stone-900 text-white rounded-lg px-2.5 py-0.5 shadow-md z-30 text-[10px] font-bold">
                          {isKop ? (
                            <span className="text-amber-400 flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                              <span>🔒 Kop Resmi (Terkunci & Tidak Dapat Dihapus/Diedit)</span>
                            </span>
                          ) : (
                            <>
                              <span className="text-stone-300 font-mono">#{idx + 1}</span>
                              {isMoved && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResetBlockPosition(block.id);
                                  }}
                                  className="p-1 hover:bg-stone-800 text-amber-300 hover:text-white rounded cursor-pointer flex items-center gap-0.5"
                                  title="Reset Posisi (Ke Flow Default)"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveBlock(block.id, "UP");
                                }}
                                disabled={idx <= 1}
                                className="p-1 hover:bg-stone-800 disabled:opacity-30 rounded cursor-pointer"
                                title="Pindah ke Atas"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveBlock(block.id, "DOWN");
                                }}
                                className="p-1 hover:bg-stone-800 rounded cursor-pointer"
                                title="Pindah ke Bawah"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateBlock(block.id);
                                }}
                                className="p-1 hover:bg-stone-800 rounded cursor-pointer"
                                title="Duplikat"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteBlock(block.id);
                                }}
                                className="p-1 hover:bg-rose-600 rounded text-rose-300 hover:text-white cursor-pointer"
                                title="Hapus"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Interactive Hold-and-Move Mouse Resize Handles */}
                      {isSelected && !isKop && (
                        <>
                          {/* Bottom-Right Handle (Corner: Both Width & Height) */}
                          <div
                            onMouseDown={(e) => handleStartResize(e, block.id, "se")}
                            className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-600 border-2 border-white rounded-xs shadow-md cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                            title={isId ? "Tahan (hold) & geser mouse untuk atur ukuran container" : "Hold & drag mouse to resize container"}
                          />
                          {/* Bottom Edge Handle (Height) */}
                          <div
                            onMouseDown={(e) => handleStartResize(e, block.id, "s")}
                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-2 bg-blue-500/80 border border-white rounded-full shadow-xs cursor-ns-resize z-40 hover:bg-blue-600 transition-colors"
                            title={isId ? "Tahan & geser mouse untuk ubah tinggi" : "Hold & drag mouse to adjust height"}
                          />
                          {/* Right Edge Handle (Width) */}
                          <div
                            onMouseDown={(e) => handleStartResize(e, block.id, "e")}
                            className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-8 bg-blue-500/80 border border-white rounded-full shadow-xs cursor-ew-resize z-40 hover:bg-blue-600 transition-colors"
                            title={isId ? "Tahan & geser mouse untuk ubah lebar" : "Hold & drag mouse to adjust width"}
                          />

                          {/* Live Dimension Indicator Tooltip */}
                          {resizing && resizing.blockId === block.id && liveDimensions && (
                            <div className="absolute -bottom-8 right-0 bg-stone-900/90 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-lg z-50 flex items-center gap-1 pointer-events-none">
                              <span>📐 {liveDimensions.width}px × {liveDimensions.height}px</span>
                            </div>
                          )}
                        </>
                      )}

                      {/* --- RENDER BLOCK TYPES --- */}

                      {/* 1. KOP SURAT RESMI (MATCHING EXPORTED QUOTATION REFERENCE) */}
                      {block.type === "OFFICIAL_LETTERHEAD" && (
                        <div className="w-full border-b-[2.5px] border-black pb-3 mb-2 bg-white relative z-10 flex items-center gap-4 shrink-0 select-none">
                          {/* Minimal Logo */}
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
                              {block.addressData?.streetAddress || "Dusun Petahunan, Jajag, Gambiran, Banyuwangi Regency, East Java 68486"}
                              <br />
                              <span className="font-bold text-black">Phone:</span> {block.addressData?.phone || "0811-1111-3993"} &nbsp;|&nbsp;{" "}
                              <span className="font-bold text-black">Email:</span> {block.addressData?.email || "pavingjoss@gmail.com"}
                            </div>
                          </div>

                          {/* Top Right: QR Code for Verification (Exact Quotation Export Style) */}
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
                      )}

                      {/* 2. ALAMAT PENGIRIM */}
                      {block.type === "SENDER_ADDRESS" && (
                        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 space-y-1 text-xs">
                          <div className="text-[10px] font-black text-stone-400 uppercase tracking-wider">
                            {block.title || "PENGIRIM (FROM)"}
                          </div>
                          <div className="font-bold text-stone-900 text-sm">{block.addressData?.companyName}</div>
                          <div className="text-stone-700 font-medium">{block.addressData?.division}</div>
                          <div className="text-stone-600 text-[11px]">
                            {block.addressData?.contactPerson} · {block.addressData?.streetAddress}
                          </div>
                          <div className="text-[11px] text-stone-500 font-mono">
                            Kontak: {block.addressData?.phone} · {block.addressData?.email}
                          </div>
                        </div>
                      )}

                      {/* 3. ALAMAT PENERIMA */}
                      {block.type === "RECIPIENT_ADDRESS" && (
                        <div className="bg-blue-50/50 border border-blue-200/80 rounded-xl p-3.5 space-y-1 text-xs">
                          <div className="text-[10px] font-black text-blue-600 uppercase tracking-wider">
                            {block.title || "PENERIMA / REKANAN (TO)"}
                          </div>
                          <div className="font-bold text-stone-900 text-sm">{block.addressData?.companyName}</div>
                          <div className="text-stone-700 font-medium">{block.addressData?.contactPerson}</div>
                          <div className="text-stone-600 text-[11px]">{block.addressData?.streetAddress}</div>
                          <div className="text-[11px] text-stone-500 font-mono">{block.addressData?.phone}</div>
                        </div>
                      )}

                      {/* 4. ALAMAT LOKASI PROYEK */}
                      {block.type === "PROJECT_SITE_ADDRESS" && (
                        <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-3.5 space-y-1 text-xs">
                          <div className="text-[10px] font-black text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                            {block.title || "LOKASI PENGIRIMAN PROYEK LAPANGAN"}
                          </div>
                          <div className="font-bold text-stone-900 text-sm">{block.addressData?.companyName}</div>
                          <div className="text-stone-700 font-medium">{block.addressData?.siteLocation}</div>
                          <div className="text-[11px] text-stone-600">{block.addressData?.contactPerson}</div>
                          <div className="text-[10px] text-stone-500 italic">{block.addressData?.streetAddress}</div>
                        </div>
                      )}

                      {/* 5. HEADER JUDUL */}
                      {block.type === "HEADER" && (
                        <div className="text-center space-y-1 py-2">
                          <h2 className="text-lg font-black tracking-tight text-stone-950 uppercase">
                            {block.title || "JUDUL DOKUMEN"}
                          </h2>
                          <p className="text-xs font-bold text-stone-500 font-mono tracking-wider">
                            {block.content || "NO: REF/PJ/001"}
                          </p>
                        </div>
                      )}

                      {/* 6. TEXT PARAGRAF */}
                      {block.type === "TEXT" && (
                        <div className="text-xs text-stone-800 leading-relaxed font-normal whitespace-pre-line">
                          {block.content}
                        </div>
                      )}

                      {/* 7. CALLOUT BOX */}
                      {block.type === "CALLOUT" && (
                        <div
                          className={cn(
                            "p-4 rounded-xl border space-y-1 text-xs",
                            block.style === "WARNING"
                              ? "bg-amber-50/80 border-amber-300 text-amber-950"
                              : block.style === "SUCCESS"
                              ? "bg-emerald-50/80 border-emerald-300 text-emerald-950"
                              : "bg-blue-50/80 border-blue-300 text-blue-950"
                          )}
                        >
                          <div className="font-bold flex items-center gap-1.5 uppercase text-[11px] tracking-wide">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            {block.title}
                          </div>
                          <div className="leading-relaxed text-stone-800 font-medium">{block.content}</div>
                        </div>
                      )}

                      {/* 8. LIST POIN-POIN */}
                      {block.type === "LIST_POINTS" && (
                        <div className="space-y-1.5 text-xs text-stone-800">
                          {block.title && <div className="font-bold text-stone-900">{block.title}</div>}
                          <ul className="space-y-1 pl-1">
                            {block.listItems?.map((item, lIdx) => (
                              <li key={lIdx} className="leading-relaxed">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 9. DATA TABLE */}
                      {block.type === "TABLE" && (
                        <div className="space-y-1.5 text-xs">
                          {block.title && <div className="font-bold text-stone-900">{block.title}</div>}
                          <div className="overflow-x-auto border border-stone-200 rounded-xl">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200">
                                  {block.tableData?.headers.map((h, hIdx) => (
                                    <th key={hIdx} className="p-2.5">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {block.tableData?.rows.map((row, rIdx) => (
                                  <tr key={rIdx} className="border-b border-stone-100 hover:bg-stone-50/50">
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx} className="p-2.5 text-stone-800">
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* 10. METADATA GRID */}
                      {block.type === "METADATA_GRID" && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {block.metaData?.map((m, mIdx) => (
                            <div
                              key={mIdx}
                              className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between"
                            >
                              <span className="font-bold text-stone-600">{m.key}:</span>
                              <span className="font-mono font-bold text-stone-900">{m.value}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 11. SIGNATURE COLUMN GRAPHIC CONTAINER (STANDARD ERP PURCHASE ORDER STYLE) */}
                      {(block.type === "SIGNATURE_COLUMN" || block.type === "SIGNATURE_STAMP") && (
                        <div className="mt-6 pt-3 border-t border-stone-200">
                          <div className="flex justify-end">
                            <div className="w-64 text-center">
                              <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
                                {isId ? "Disetujui Oleh" : "Approved By"} <span className="text-stone-500 font-normal">/ Authorized By</span>
                              </div>
                              <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">
                                {block.signatoryTitle || DEPARTMENT_ROUTING_CONFIG[block.targetDepartment || "PURCHASING"]?.signatoryTitleId || "Manager / Head"}
                              </div>
                              <div className="h-12 flex items-center justify-center my-1">
                                <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg shadow-2xs">
                                  <QRCodeSVG value={`https://fhtbs-erp.shared/auth/${block.targetDepartment || "PURCHASING"}`} size={22} fgColor="#059669" />
                                  <div className="text-left">
                                    <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">Validated System</div>
                                    <div className="text-[8px] font-mono text-emerald-700 leading-none">
                                      {block.targetDepartment || "PURCHASING"} Dept
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-300 pt-1">
                                {block.signatoryName || block.signatoryTitle || DEPARTMENT_ROUTING_CONFIG[block.targetDepartment || "PURCHASING"]?.signatoryTitleId || "Authorized Officer"}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 12. DUAL SIGNATURE (STANDARD ERP PURCHASE ORDER STYLE) */}
                      {block.type === "DUAL_SIGNATURE" && (
                        <div className="mt-6 pt-3 border-t border-stone-200 grid grid-cols-2 gap-8 text-center">
                          {/* Left: Created By */}
                          <div>
                            <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
                              {isId ? "Dibuat Oleh" : "Created By"} <span className="text-stone-500 font-normal">/ Submitted By</span>
                            </div>
                            <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">
                              {department || "General"} Team
                            </div>
                            <div className="h-12 flex items-center justify-center my-1">
                              <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg shadow-2xs">
                                <QRCodeSVG value={`https://fhtbs-erp.shared/creator/${department || "General"}`} size={22} fgColor="#059669" />
                                <div className="text-left">
                                  <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">Validated System</div>
                                  <div className="text-[8px] font-mono text-emerald-700 leading-none">Creator Validated</div>
                                </div>
                              </div>
                            </div>
                            <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-300 pt-1">
                              {department || "General"} Officer
                            </div>
                          </div>

                          {/* Right: Approved By */}
                          <div>
                            <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
                              {isId ? "Disetujui Oleh" : "Approved By"} <span className="text-stone-500 font-normal">/ Authorized By</span>
                            </div>
                            <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">
                              {block.signatoryTitle || DEPARTMENT_ROUTING_CONFIG[block.targetDepartment || "PURCHASING"]?.signatoryTitleId || "Manager"}
                            </div>
                            <div className="h-12 flex items-center justify-center my-1">
                              <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg shadow-2xs">
                                <QRCodeSVG value={`https://fhtbs-erp.shared/auth/${block.targetDepartment || "PURCHASING"}`} size={22} fgColor="#059669" />
                                <div className="text-left">
                                  <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">Validated System</div>
                                  <div className="text-[8px] font-mono text-emerald-700 leading-none">
                                    {block.targetDepartment || "PURCHASING"} Dept
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-300 pt-1">
                              {block.signatoryName || block.signatoryTitle || DEPARTMENT_ROUTING_CONFIG[block.targetDepartment || "PURCHASING"]?.signatoryTitleId || "Authorized Manager"}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>

        {/* ======================================================== */}
        {/* C. RIGHT PROPERTY INSPECTOR (Figma Style)                */}
        {/* ======================================================== */}
        <aside className="w-80 bg-white border-l border-stone-200/90 flex flex-col shrink-0 shadow-xs z-10">
          <div className="p-3 border-b border-stone-200/80 bg-stone-50 flex items-center justify-between">
            <span className="text-xs font-black text-stone-900 uppercase tracking-tight flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-700" />
              {isId ? "Inspektor Elemen" : "Property Inspector"}
            </span>
            {selectedBlock && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-stone-200/80 text-stone-700">
                {selectedBlock.type}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs custom-scrollbar">
            {selectedBlock ? (
              <div className="space-y-4">
                {/* A. If selected block is the permanent locked Kop Surat */}
                {selectedBlock.type === "OFFICIAL_LETTERHEAD" || selectedBlock.isLocked ? (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 space-y-2">
                      <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
                        <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>Kop Surat Resmi Terstandarisasi</span>
                      </div>
                      <p className="text-[11px] text-amber-900/90 leading-relaxed font-medium">
                        Kop surat ini adalah identitas resmi <b>CV. BATU EMAS GROUP</b> (Paving Joss) yang disamakan persis dengan dokumen penawaran resmi (Quotation) dan <b>tidak dapat diedit maupun dihapus</b> untuk menjaga standar tata naskah dinas serta kepatuhan hukum perusahaan.
                      </p>
                    </div>

                    <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-2 text-xs">
                      <span className="text-[10px] font-bold text-stone-600 uppercase block">Data Resmi Terdaftar</span>
                      <div className="space-y-1.5 text-[11px] text-stone-700">
                        <div><b>Badan Usaha:</b> CV. BATU EMAS GROUP</div>
                        <div><b>Pabrik & Kantor:</b> Dusun Petahunan, Jajag, Gambiran, Banyuwangi 68486</div>
                        <div><b>Phone:</b> 0811-1111-3993</div>
                        <div><b>Email:</b> pavingjoss@gmail.com</div>
                        <div><b>Fitur Keamanan:</b> Valid Doc ID & QR Code System Verification</div>
                        <div className="text-amber-700 font-bold flex items-center gap-1 pt-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                          <span>Status: Terpasang Permanen di Atas Lembar Dokumen</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Container Sizing & Hold-and-Move Resize Info */}
                    <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-stone-700 uppercase flex items-center gap-1">
                          <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                          <span>Ukuran Container</span>
                        </span>
                        <span className="text-[10px] text-stone-600 font-mono font-bold">
                          {selectedBlock.width ? `${selectedBlock.width}px` : "100%"} × {selectedBlock.height ? `${selectedBlock.height}px` : "Auto"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-stone-500 leading-tight">
                        💡 <b>Tip Resize:</b> Tahan (Hold) handle biru di sudut atau tepi kotak container pada lembar dokumen lalu gerakkan mouse untuk mengubah lebar & tinggi.
                      </p>
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          onClick={() => handleUpdateBlock(selectedBlock.id, { width: undefined, height: undefined })}
                          className="flex-1 py-1 px-2 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 transition-colors cursor-pointer"
                        >
                          Lebar Penuh (100%)
                        </button>
                        <button
                          onClick={() => handleUpdateBlock(selectedBlock.id, { width: 360 })}
                          className="py-1 px-2 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 transition-colors cursor-pointer"
                        >
                          Lebar 50%
                        </button>
                      </div>
                    </div>

                    {/* 1. Title / Header input */}
                    <div>
                      <label className="text-[10px] font-bold text-stone-600 uppercase block mb-1">
                        {isId ? "Judul Elemen" : "Element Title"}
                      </label>
                      <input
                        type="text"
                        value={selectedBlock.title || ""}
                        onChange={(e) => handleUpdateBlock(selectedBlock.id, { title: e.target.value })}
                        className="w-full text-xs p-2 bg-stone-50 border border-stone-200 rounded-lg font-bold outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* 2. Content text input if applicable */}
                    {selectedBlock.content !== undefined && (
                      <div>
                        <label className="text-[10px] font-bold text-stone-600 uppercase block mb-1">
                          {isId ? "Isi Teks / Konten" : "Text Content"}
                        </label>
                        <textarea
                          rows={4}
                          value={selectedBlock.content || ""}
                          onChange={(e) => handleUpdateBlock(selectedBlock.id, { content: e.target.value })}
                          className="w-full text-xs p-2 bg-stone-50 border border-stone-200 rounded-lg font-medium outline-none focus:border-amber-500 leading-relaxed"
                        />
                      </div>
                    )}

                    {/* 3. SIGNATURE COLUMN SPECIFIC TRIGGER CONFIGURATION */}
                    {(selectedBlock.type === "SIGNATURE_COLUMN" ||
                      selectedBlock.type === "SIGNATURE_STAMP" ||
                      selectedBlock.type === "DUAL_SIGNATURE") && (
                      <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3">
                        <div className="font-bold text-blue-950 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                          <span>{isId ? "Pengaturan Trigger Otorisasi" : "Routing Trigger"}</span>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-blue-900 block mb-1">
                            {isId ? "Target Departemen Otorisasi *" : "Target Authorization Dept *"}
                          </label>
                          <select
                            value={selectedBlock.targetDepartment || "PURCHASING"}
                            onChange={(e) =>
                              handleUpdateBlock(selectedBlock.id, {
                                targetDepartment: e.target.value as TargetDepartment,
                              })
                            }
                            className="w-full text-xs p-2 bg-white border border-blue-300 rounded-lg font-bold text-blue-950 outline-none"
                          >
                            <option value="PURCHASING">Purchasing (Pengadaan)</option>
                            <option value="FINANCE">Finance & Accounting</option>
                            <option value="PRODUCTION">Produksi & Pabrik</option>
                            <option value="FACTORY_CONTROLLER">Factory Controller (FC)</option>
                            <option value="MANAGEMENT">Direksi & GM</option>
                            <option value="WAREHOUSE">Gudang & Logistik</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-blue-900 block mb-1">
                            {isId ? "Jabatan Penandatangan" : "Signatory Title"}
                          </label>
                          <input
                            type="text"
                            value={selectedBlock.signatoryTitle || ""}
                            onChange={(e) => handleUpdateBlock(selectedBlock.id, { signatoryTitle: e.target.value })}
                            className="w-full text-xs p-2 bg-white border border-blue-200 rounded-lg font-medium outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-blue-900 block mb-1">
                            {isId ? "Catatan Kepatuhan Otorisasi" : "Compliance Notes"}
                          </label>
                          <textarea
                            rows={2}
                            value={selectedBlock.notes || ""}
                            onChange={(e) => handleUpdateBlock(selectedBlock.id, { notes: e.target.value })}
                            className="w-full text-xs p-2 bg-white border border-blue-200 rounded-lg outline-none"
                          />
                        </div>

                        <div className="text-[10px] text-blue-800 italic leading-tight">
                          {isId
                            ? "Menyimpan dokumen ini akan otomatis mengarahkan workflow ke antrean otorisasi departemen ini."
                            : "Saving will auto-route this document to this department's approval inbox."}
                        </div>
                      </div>
                    )}

                    {/* 4. ADDRESS TEMPLATE CONFIGURATION */}
                    {selectedBlock.addressData && (
                      <div className="space-y-2 p-3 bg-stone-50 border border-stone-200 rounded-xl">
                        <span className="text-[10px] font-bold text-stone-700 uppercase block">
                          {isId ? "Detail Data Alamat" : "Address Details"}
                        </span>
                        <div>
                          <label className="text-[9px] text-stone-500 font-bold block">Nama PT / Penerima</label>
                          <input
                            type="text"
                            value={selectedBlock.addressData.companyName || ""}
                            onChange={(e) =>
                              handleUpdateBlock(selectedBlock.id, {
                                addressData: { ...selectedBlock.addressData, companyName: e.target.value },
                              })
                            }
                            className="w-full text-xs p-1.5 bg-white border border-stone-200 rounded-lg outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-stone-500 font-bold block">Alamat / Lokasi</label>
                          <input
                            type="text"
                            value={selectedBlock.addressData.streetAddress || selectedBlock.addressData.siteLocation || ""}
                            onChange={(e) =>
                              handleUpdateBlock(selectedBlock.id, {
                                addressData: { ...selectedBlock.addressData, streetAddress: e.target.value },
                              })
                            }
                            className="w-full text-xs p-1.5 bg-white border border-stone-200 rounded-lg outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-stone-500 font-bold block">Kontak / Telepon</label>
                          <input
                            type="text"
                            value={selectedBlock.addressData.phone || ""}
                            onChange={(e) =>
                              handleUpdateBlock(selectedBlock.id, {
                                addressData: { ...selectedBlock.addressData, phone: e.target.value },
                              })
                            }
                            className="w-full text-xs p-1.5 bg-white border border-stone-200 rounded-lg outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* 5. Quick Actions for Selected Block */}
                    <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleDuplicateBlock(selectedBlock.id)}
                        className="flex-1 rounded-xl text-xs font-bold gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{isId ? "Duplikat" : "Duplicate"}</span>
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleDeleteBlock(selectedBlock.id)}
                        className="flex-1 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isId ? "Hapus" : "Delete"}</span>
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* No block selected: Document Level Properties */
              <div className="space-y-4">
                <div className="text-stone-500 text-[11px] leading-relaxed">
                  {isId
                    ? "Klik salah satu elemen graphic pada lembar dokumen di tengah untuk mengedit teks atau propertinya."
                    : "Click any element container on the canvas sheet to edit properties."}
                </div>

                <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                  <span className="text-[10px] font-bold text-stone-600 uppercase block">
                    {isId ? "Format Kertas Canvas" : "Canvas Preset"}
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      onClick={() => setLayoutPreset("A4_PORTRAIT")}
                      className={cn(
                        "p-2 rounded-lg text-left text-xs font-bold border transition-all flex items-center justify-between",
                        layoutPreset === "A4_PORTRAIT"
                          ? "bg-amber-50 border-amber-300 text-amber-900"
                          : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
                      )}
                    >
                      <span>A4 Portrait (210×297 mm)</span>
                      {layoutPreset === "A4_PORTRAIT" && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                    </button>
                    <button
                      onClick={() => setLayoutPreset("A4_LANDSCAPE")}
                      className={cn(
                        "p-2 rounded-lg text-left text-xs font-bold border transition-all flex items-center justify-between",
                        layoutPreset === "A4_LANDSCAPE"
                          ? "bg-amber-50 border-amber-300 text-amber-900"
                          : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
                      )}
                    >
                      <span>A4 Landscape (297×210 mm)</span>
                      {layoutPreset === "A4_LANDSCAPE" && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                    </button>
                    <button
                      onClick={() => setLayoutPreset("EXECUTIVE_MEMO")}
                      className={cn(
                        "p-2 rounded-lg text-left text-xs font-bold border transition-all flex items-center justify-between",
                        layoutPreset === "EXECUTIVE_MEMO"
                          ? "bg-amber-50 border-amber-300 text-amber-900"
                          : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
                      )}
                    >
                      <span>Executive Memo Formal</span>
                      {layoutPreset === "EXECUTIVE_MEMO" && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                    </button>
                  </div>
                </div>

                {/* Overall Department Routing Summary */}
                <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2">
                  <div className="font-bold text-blue-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <span>{isId ? "Status Trigger Otorisasi" : "Active Routing Trigger"}</span>
                  </div>
                  <div className="text-[11px] text-blue-950">
                    Departemen Target: <b>{activeDeptConfig.deptNameId}</b>
                  </div>
                  <div className="text-[10px] text-stone-500 font-mono">
                    Role: {activeDeptConfig.role}
                  </div>
                  <p className="text-[11px] text-blue-800 leading-tight">
                    {activeDeptConfig.descriptionId}
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
