import React from "react";
import {
  PieChart,
  Users,
  Clock,
  CalendarDays,
  DollarSign,
  Briefcase,
  UserCheck,
  Award,
  Repeat,
  Settings,
} from "lucide-react";
import type { HrTabMeta } from "@/components/hris/IsometricHero";

export const HR_TAB_CONFIG: Record<string, HrTabMeta> = {
  dashboard: {
    tag: "Overview",
    titleLight: "People",
    titleBold: "Intelligence",
    subtitle: "Live team composition, daily shifts, and performance pulse.",
    accentColor: "#F25730",
    glowClass: "from-[#FF7852]/30 via-amber-300/20 to-emerald-300/20",
    iconBg: "from-[#F25730] to-[#FF7852]",
    icon: React.createElement(PieChart, { className: "w-6 h-6 text-white" }),
  },
  directory: {
    tag: "Directory",
    titleLight: "Active",
    titleBold: "Workforce",
    subtitle: "Team profiles, division roles, and master compensation.",
    accentColor: "#10B981",
    glowClass: "from-emerald-400/30 via-teal-300/20 to-sky-300/20",
    iconBg: "from-emerald-500 to-teal-600",
    icon: React.createElement(Users, { className: "w-6 h-6 text-white" }),
  },
  attendance: {
    tag: "Attendance",
    titleLight: "Live Shifts &",
    titleBold: "Overtime",
    subtitle: "Real-time GPS clock logs and shift verification.",
    accentColor: "#0EA5E9",
    glowClass: "from-sky-400/30 via-blue-300/20 to-emerald-300/20",
    iconBg: "from-sky-500 to-blue-600",
    icon: React.createElement(Clock, { className: "w-6 h-6 text-white" }),
  },
  leave: {
    tag: "Time Off",
    titleLight: "Annual",
    titleBold: "Leave Hub",
    subtitle: "Paid leave balances and manager approvals.",
    accentColor: "#F59E0B",
    glowClass: "from-amber-400/30 via-orange-300/20 to-[#FF7852]/20",
    iconBg: "from-amber-500 to-orange-500",
    icon: React.createElement(CalendarDays, { className: "w-6 h-6 text-white" }),
  },
  payroll: {
    tag: "Payroll",
    titleLight: "Remuneration",
    titleBold: "& PRq Studio",
    subtitle: "Monthly payroll requisitions, tax, and digital payslips.",
    accentColor: "#10B981",
    glowClass: "from-emerald-400/30 via-teal-300/20 to-[#FF7852]/20",
    iconBg: "from-[#059669] to-[#0D9488]",
    icon: React.createElement(DollarSign, { className: "w-6 h-6 text-white" }),
  },
  vacancies: {
    tag: "Recruitment",
    titleLight: "Open",
    titleBold: "Positions",
    subtitle: "Job openings synced with the public careers portal.",
    accentColor: "#F43F5E",
    glowClass: "from-rose-400/30 via-[#FF7852]/20 to-amber-300/20",
    iconBg: "from-rose-500 to-pink-600",
    icon: React.createElement(Briefcase, { className: "w-6 h-6 text-white" }),
  },
  candidates: {
    tag: "Talent Funnel",
    titleLight: "Candidate",
    titleBold: "Pipeline",
    subtitle: "Applicant stages, offering letters, and 1-click onboarding.",
    accentColor: "#14B8A6",
    glowClass: "from-teal-400/30 via-emerald-300/20 to-sky-300/20",
    iconBg: "from-teal-500 to-emerald-600",
    icon: React.createElement(UserCheck, { className: "w-6 h-6 text-white" }),
  },
  kpi: {
    tag: "Performance",
    titleLight: "360° KPI",
    titleBold: "Appraisals",
    subtitle: "Five-dimension competency scoring and growth reviews.",
    accentColor: "#F97316",
    glowClass: "from-orange-400/30 via-[#FF7852]/25 to-amber-300/20",
    iconBg: "from-orange-500 to-[#F25730]",
    icon: React.createElement(Award, { className: "w-6 h-6 text-white" }),
  },
  handover: {
    tag: "Transitions",
    titleLight: "Employee",
    titleBold: "Offboarding",
    subtitle: "Exit clearance checklists and automated access revocation.",
    accentColor: "#D97706",
    glowClass: "from-amber-400/30 via-orange-300/20 to-rose-300/20",
    iconBg: "from-amber-600 to-orange-600",
    icon: React.createElement(Repeat, { className: "w-6 h-6 text-white" }),
  },
  settings: {
    tag: "Portal CMS",
    titleLight: "Brand &",
    titleBold: "Privacy",
    subtitle: "Careers portal customization and data retention controls.",
    accentColor: "#0EA5E9",
    glowClass: "from-sky-400/25 via-emerald-300/20 to-cyan-300/20",
    iconBg: "from-[#0284C7] to-[#2563EB]",
    icon: React.createElement(Settings, { className: "w-6 h-6 text-white" }),
  },
};

export const HR_TAB_REQUIRED_KEYS: Record<string, string[]> = {
  dashboard: [
    "users",
    "jobs",
    "applications",
    "attendances",
    "leaves",
    "salaries",
    "payrollRequisitions",
    "kpis",
    "handovers",
  ],
  directory: ["users", "salaries", "kpis"],
  attendance: ["attendances", "users", "projects"],
  leave: ["leaves", "users"],
  payroll: ["users", "salaries", "payslips", "payrollRequisitions"],
  vacancies: ["jobs"],
  candidates: ["applications", "jobs"],
  kpi: ["kpis", "users"],
  handover: ["handovers", "users"],
  settings: ["cmsData"],
};

export const ALL_HR_DATA_KEYS = [
  "users",
  "jobs",
  "applications",
  "kpis",
  "handovers",
  "attendances",
  "leaves",
  "payslips",
  "salaries",
  "payrollRequisitions",
  "projects",
  "cmsData",
];

// Shared Jakarta timezone formatters for HRIS & SelfService
export const jakartaLiveClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export const jakartaIsoPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const jakartaDisplayDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "Asia/Jakarta",
});

export const jakartaDisplayTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

export function getTodayJakartaDateStr(): string {
  try {
    const parts = jakartaIsoPartsFormatter.formatToParts(new Date());
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    return `${year}-${month}-${day}`;
  } catch {
    const dt = new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}
