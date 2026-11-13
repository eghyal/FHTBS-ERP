import React from "react";
import { FileText, ClipboardList, Banknote } from "lucide-react";
import { TargetDepartment } from "@/types/workspace";

// Preset Templates that illustrate the Canva concept
export const TEMPLATE_PRESETS = [
  {
    id: "PURCHASING_MEMO",
    titleId: "Procurement & Sparepart Memo",
    titleEn: "Procurement & Sparepart Memo",
    type: "MEMORANDUM",
    targetDept: "PURCHASING" as TargetDepartment,
    descriptionId:
      "Features Official Letterhead, Vendor Address, Material Table & Purchasing Signature",
    descriptionEn:
      "Features Official Letterhead, Vendor Address, Material Table & Purchasing Signature",
    defaultBlocks: [
      {
        id: "b1",
        type: "OFFICIAL_LETTERHEAD" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "CV. BATU EMAS GROUP",
        subtitle:
          "PREMIER MANUFACTURER & SUPPLIER OF PAVING BLOCKS, CONCRETE BRICKS & PRECAST CONCRETE",
        addressData: {
          companyName: "CV. BATU EMAS GROUP",
          division: "Main Plant & Banyuwangi Head Office",
          streetAddress:
            "Dusun Petahunan, Jajag, Gambiran, Banyuwangi Regency, East Java 68486",
          phone: "0811-1111-3993",
          email: "pavingjoss@gmail.com",
        },
        style: "OFFICIAL" as const,
        alignment: "CENTER" as const,
      },
      {
        id: "b2",
        type: "HEADER" as const,
        category: "BODY_TEXT" as const,
        title: "SPARE PARTS PROCUREMENT REQUEST MEMORANDUM",
        content: `NO: MEMO/PURCH/${new Date().getFullYear()}/001`,
        alignment: "CENTER" as const,
      },
      {
        id: "b3",
        type: "RECIPIENT_ADDRESS" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "ADDRESSED TO PARTNER / VENDOR (TO)",
        addressData: {
          companyName: "Attention: PT Mitra Mesin Hidrolik Surabaya",
          division: "B2B Sales & Supply Chain Division",
          contactPerson: "Attn: Mr. Haryanto (Sales Representative)",
          streetAddress: "Gresik Industrial Estate Block C-12, East Java",
          phone: "+62 811-9876-5432",
        },
      },
      {
        id: "b4",
        type: "TEXT" as const,
        category: "BODY_TEXT" as const,
        content:
          "In connection with the routine maintenance of Hydraulic Press Line #2, we hereby request the procurement of critical spare parts according to the requirement matrix below to prevent downtime risks on our production schedule.",
      },
      {
        id: "b5",
        type: "TABLE" as const,
        category: "BODY_TEXT" as const,
        title: "Procurement Component Requirement Matrix",
        tableData: {
          headers: [
            "No",
            "Part / Component Name",
            "Specification / Brand",
            "Qty",
            "Urgency",
          ],
          rows: [
            [
              "1",
              "Solenoid Directional Valve",
              "Yuken DSG-03-3C2-D24-50",
              "2 Pcs",
              "Critical",
            ],
            [
              "2",
              "Hydraulic Filter Element",
              "Return Line 10 Micron",
              "4 Pcs",
              "Normal",
            ],
            [
              "3",
              "Main Cylinder Seal Kit",
              "Polyurethane 140x160x15",
              "2 Set",
              "Critical",
            ],
          ],
        },
      },
      {
        id: "b6",
        type: "CALLOUT" as const,
        category: "BODY_TEXT" as const,
        style: "WARNING" as const,
        title: "DELIVERY TERMS & SPECIFICATIONS",
        content:
          "Goods must be accompanied by a manufacturer's Certificate of Analysis (CoA) and delivered directly to the Raw Material Warehouse within 3 working days after PO authorization.",
      },
      {
        id: "b7",
        type: "SIGNATURE_COLUMN" as const,
        category: "SIGNATURE_COLUMN" as const,
        title: "Purchasing Department Authorization Column",
        subtitle: "Purchasing Manager Approval Signature",
        targetDepartment: "PURCHASING" as TargetDepartment,
        targetRole: "PURCHASING_MANAGER" as const,
        signatoryTitle: "Purchasing Manager",
        notes:
          "This document is automatically routed to the Purchasing Department for review and authorization.",
        isTriggerActive: true,
      },
      {
        id: "b8-footer",
        type: "FOOTER" as const,
        category: "FOOTER_TEMPLATE" as const,
        footerVariant: "ERP_STANDARD" as const,
        footerLeftText:
          "This document is computationally issued and validated. Valid without physical signature.",
        footerRightText: "MEMORANDUM",
        subtitle: "OFFICIAL WORKSPACE DOCUMENT",
        title:
          "This document is computationally issued and validated. Valid without physical signature.",
        content: "MEMORANDUM",
        alignment: "LEFT" as const,
      },
    ],
  },
  {
    id: "PRODUCTION_POLICY",
    titleId: "Plant Operating Instructions & Policy",
    titleEn: "Plant Operating Instructions & Policy",
    type: "INTERNAL_POLICY",
    targetDept: "PRODUCTION" as TargetDepartment,
    descriptionId:
      "Features Letterhead, Site Location, Operating Steps & Production Signature",
    descriptionEn:
      "Features Letterhead, Site Location, Operating Steps & Production Signature",
    defaultBlocks: [
      {
        id: "b1",
        type: "OFFICIAL_LETTERHEAD" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "CV. BATU EMAS GROUP",
        subtitle: "PLANT OPERATIONS & ENGINEERING DIVISION",
        addressData: {
          companyName: "CV. BATU EMAS GROUP",
          streetAddress: "Dusun Petahunan, Jajag, Gambiran, Banyuwangi 68486",
          phone: "0811-1111-3993",
          email: "pavingjoss@gmail.com",
        },
        style: "OFFICIAL" as const,
        alignment: "CENTER" as const,
      },
      {
        id: "b2",
        type: "HEADER" as const,
        category: "BODY_TEXT" as const,
        title: "STANDARD OPERATING PROCEDURE: QUALITY CONTROL PAVING K-400",
        content: `NO: SOP/PROD/${new Date().getFullYear()}/012`,
        alignment: "CENTER" as const,
      },
      {
        id: "b3",
        type: "PROJECT_SITE_ADDRESS" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "WORK LOCATION & BATCHING PLANT",
        addressData: {
          companyName: "Banyuwangi Main Batching Plant",
          siteLocation: "Automated Press Machine Line #1",
          contactPerson: "Shift Supervisor: Mr. Mulyono",
          streetAddress: "K-400 / K-500 Heavy Duty Paving Production Area",
        },
      },
      {
        id: "b4",
        type: "LIST_POINTS" as const,
        category: "BODY_TEXT" as const,
        title: "Production Quality Standard Procedures:",
        listItems: [
          "1. Test moisture content of silica sand and aggregates before batch mixing begins.",
          "2. Maintain water-cement ratio within a maximum tolerance of 0.32.",
          "3. Perform physical sample weighing every 500 pressed paving/brick units.",
          "4. Record travel tag lot numbers (WOT) on the QR process control sheet.",
        ],
      },
      {
        id: "b5",
        type: "SIGNATURE_COLUMN" as const,
        category: "SIGNATURE_COLUMN" as const,
        title: "Production Department Authorization Column",
        subtitle: "Production Manager Approval",
        targetDepartment: "PRODUCTION" as TargetDepartment,
        targetRole: "PRODUCTION_MANAGER" as const,
        signatoryTitle: "Production Manager",
        notes:
          "This document is automatically routed to the Production Department for review and approval.",
        isTriggerActive: true,
      },
      {
        id: "b6-footer",
        type: "FOOTER" as const,
        category: "FOOTER_TEMPLATE" as const,
        footerVariant: "ERP_STANDARD" as const,
        footerLeftText:
          "This document is computationally issued and validated. Valid without physical signature.",
        footerRightText: "INTERNAL POLICY",
        subtitle: "OFFICIAL WORKSPACE DOCUMENT",
        title:
          "This document is computationally issued and validated. Valid without physical signature.",
        content: "INTERNAL POLICY",
        alignment: "LEFT" as const,
      },
    ],
  },
  {
    id: "FINANCE_DISBURSEMENT",
    titleId: "Budget Authorization & Finance Release",
    titleEn: "Budget Authorization & Finance Release",
    type: "AUTHORIZATION_LETTER",
    targetDept: "FINANCE" as TargetDepartment,
    descriptionId:
      "Features Letterhead, Sender Address, Budget Callout & Finance Signature",
    descriptionEn:
      "Features Letterhead, Sender Address, Budget Callout & Finance Signature",
    defaultBlocks: [
      {
        id: "b1",
        type: "OFFICIAL_LETTERHEAD" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "CV. BATU EMAS GROUP",
        subtitle: "HEAD OFFICE & FINANCIAL TREASURY",
        addressData: {
          companyName: "CV. BATU EMAS GROUP",
          streetAddress: "Dusun Petahunan, Jajag, Gambiran, Banyuwangi 68486",
          phone: "0811-1111-3993",
          email: "pavingjoss@gmail.com",
        },
        style: "OFFICIAL" as const,
        alignment: "CENTER" as const,
      },
      {
        id: "b2",
        type: "HEADER" as const,
        category: "BODY_TEXT" as const,
        title: "WORKSHOP BUDGET DISBURSEMENT AUTHORIZATION LETTER",
        content: `NO: FIN/DISBURSE/${new Date().getFullYear()}/045`,
        alignment: "CENTER" as const,
      },
      {
        id: "b3",
        type: "SENDER_ADDRESS" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "BUDGET REQUESTING DIVISION",
        addressData: {
          companyName: "CV. Batu Emas Group",
          division: "Maintenance & Workshop Department",
          contactPerson: "Ir. Hendra Gunawan",
          streetAddress: "Banyuwangi Plant Workshop Building",
          phone: "Ext. 102",
        },
      },
      {
        id: "b4",
        type: "CALLOUT" as const,
        category: "BODY_TEXT" as const,
        style: "INFO" as const,
        title: "OPERATIONAL BUDGET ALLOCATION SUMMARY",
        content:
          "Total requested budget of IDR 14,500,000 (Fourteen Million Five Hundred Thousand Rupiah) for emergency batching plant conveyor gearbox repair.",
      },
      {
        id: "b5",
        type: "SIGNATURE_COLUMN" as const,
        category: "SIGNATURE_COLUMN" as const,
        title: "Finance Department Authorization Column",
        subtitle: "Finance Manager Approval",
        targetDepartment: "FINANCE" as TargetDepartment,
        targetRole: "FINANCE_MANAGER" as const,
        signatoryTitle: "Finance & Accounting Manager",
        notes:
          "This document is automatically routed to the Finance Department for budget verification & authorization.",
        isTriggerActive: true,
      },
      {
        id: "b6-footer",
        type: "FOOTER" as const,
        category: "FOOTER_TEMPLATE" as const,
        footerVariant: "ERP_STANDARD" as const,
        footerLeftText:
          "This document is computationally issued and validated. Valid without physical signature.",
        footerRightText: "AUTHORIZATION LETTER",
        subtitle: "OFFICIAL WORKSPACE DOCUMENT",
        title:
          "This document is computationally issued and validated. Valid without physical signature.",
        content: "AUTHORIZATION LETTER",
        alignment: "LEFT" as const,
      },
    ],
  },
];

export const TEMPLATE_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  PURCHASING_MEMO: FileText,
  PRODUCTION_POLICY: ClipboardList,
  FINANCE_DISBURSEMENT: Banknote,
};

export const TEMPLATE_ACCENTS: Record<string, { chip: string; hover: string }> =
  {
    PURCHASING_MEMO: {
      chip: "bg-stone-100 text-stone-800",
      hover: "hover:border-stone-400 hover:bg-stone-50/60",
    },
    PRODUCTION_POLICY: {
      chip: "bg-stone-100 text-stone-800",
      hover: "hover:border-stone-400 hover:bg-stone-50/60",
    },
    FINANCE_DISBURSEMENT: {
      chip: "bg-stone-100 text-stone-800",
      hover: "hover:border-stone-400 hover:bg-stone-50/60",
    },
  };

export const STATUS_META: Record<string, { labelId: string; cls: string }> = {
  DRAFT: { labelId: "Draft", cls: "bg-stone-100 text-stone-700 border-stone-200" },
  PENDING_APPROVAL: {
    labelId: "Pending Approval",
    cls: "bg-amber-50 text-amber-800 border-amber-200",
  },
  APPROVED: {
    labelId: "Approved",
    cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  REVISION_REQUIRED: {
    labelId: "Needs Revision",
    cls: "bg-rose-50 text-rose-800 border-rose-200",
  },
  ARCHIVED: {
    labelId: "Archived",
    cls: "bg-stone-200 text-stone-700 border-stone-300",
  },
};

export function relativeTime(iso: string, _isId: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${mins < 60 ? mins : hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-US");
}
