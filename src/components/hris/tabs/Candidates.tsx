import React, { useState, useMemo } from "react";
import {
  Printer,
  UserPlus,
  Mail,
  Phone,
  CheckCircle2,
  Search,
  ArrowRight,
  Columns,
  LayoutGrid,
  Award,
  ClipboardCheck,
  Briefcase,
  CreditCard,
  Factory,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { formatRupiah } from "@/utils/format";
import { apiFetch } from "@/utils/api";
import { printOfferingLetter } from "@/utils/hrDocuments";
import {
  ERP_DEPARTMENT_OPTIONS,
  normalizeDepartmentToRole,
} from "@/constants/rbac";

interface HrCandidatesTabProps {
  applications: any[];
  currentUser: any;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onRefresh: () => void;
}

const STAGES = [
  {
    id: "APPLIED",
    label: "1. Applied",
    accent: "bg-stone-100 text-stone-700 border-stone-200",
    dot: "bg-stone-400",
  },
  {
    id: "SCREENING",
    label: "2. Screening",
    accent: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dot: "bg-indigo-500",
  },
  {
    id: "INTERVIEW",
    label: "3. Interview",
    accent: "bg-sky-50 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
  },
  {
    id: "OFFER_MADE",
    label: "4. Offer Made",
    accent: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  {
    id: "ACCEPTED",
    label: "5. Accepted",
    accent: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  {
    id: "REJECTED",
    label: "Archived",
    accent: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
  },
];

const PTKP_OPTIONS = [
  "TK/0",
  "TK/1",
  "TK/2",
  "TK/3",
  "K/0",
  "K/1",
  "K/2",
  "K/3",
];

const WORK_CENTERS = [
  { id: "", label: "Non-Production / Office" },
  { id: "WC-CUT", label: "WC-CUT — Cutting & Batching" },
  { id: "WC-FAB", label: "WC-FAB — Molding & Vibro Press" },
  { id: "WC-FIN", label: "WC-FIN — Curing & Finishing" },
  { id: "WC-ASSY", label: "WC-ASSY — Palletizing & Yard" },
  { id: "WC-QC", label: "WC-QC — Quality Control Lab" },
];

export const HrCandidatesTab: React.FC<HrCandidatesTabProps> = React.memo(
  ({ applications, currentUser, showToast, onRefresh }) => {
    const [stageFilter, setStageFilter] = useState("ALL");
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"kanban" | "cards">("kanban");
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    // Interview Scorecard & PKWT Offering Modal State
    const [evalCandidate, setEvalCandidate] = useState<any | null>(null);
    const [evalStatus, setEvalStatus] = useState("INTERVIEW");
    const [evalInterviewDate, setEvalInterviewDate] = useState("");
    const [evalInterviewerName, setEvalInterviewerName] = useState("");
    const [scoreTech, setScoreTech] = useState(4);
    const [scoreComm, setScoreComm] = useState(4);
    const [scoreRel, setScoreRel] = useState(4);
    const [scoreCult, setScoreCult] = useState(4);
    const [evalOfferedBasic, setEvalOfferedBasic] = useState(5000000);
    const [evalOfferedAllowances, setEvalOfferedAllowances] = useState(500000);
    const [evalContractType, setEvalContractType] = useState("PKWT");
    const [evalContractMonths, setEvalContractMonths] = useState(12);
    const [evalPlannedJoinDate, setEvalPlannedJoinDate] = useState("");
    const [evalNikKtp, setEvalNikKtp] = useState("");
    const [evalNpwp, setEvalNpwp] = useState("");
    const [evalPtkp, setEvalPtkp] = useState("TK/0");
    const [evalBankName, setEvalBankName] = useState("");
    const [evalBankAccount, setEvalBankAccount] = useState("");
    const [evalNotes, setEvalNotes] = useState("");
    const [isSavingEval, setIsSavingEval] = useState(false);

    // 1-Click Onboard Modal State
    const [onboardCandidate, setOnboardCandidate] = useState<any | null>(null);
    const [onboardUsername, setOnboardUsername] = useState("");
    const [onboardRole, setOnboardRole] = useState("PRODUCTION");
    const [onboardLevel, setOnboardLevel] = useState("STAFF");
    const [onboardBasicSalary, setOnboardBasicSalary] = useState(5000000);
    const [onboardAllowances, setOnboardAllowances] = useState(500000);
    const [onboardContractType, setOnboardContractType] = useState("PKWT");
    const [onboardContractMonths, setOnboardContractMonths] = useState(12);
    const [onboardJoinDate, setOnboardJoinDate] = useState("");
    const [onboardWorkCenterId, setOnboardWorkCenterId] = useState("");
    const [onboardNikKtp, setOnboardNikKtp] = useState("");
    const [onboardNpwp, setOnboardNpwp] = useState("");
    const [onboardPtkp, setOnboardPtkp] = useState("TK/0");
    const [onboardBankName, setOnboardBankName] = useState("");
    const [onboardBankAccount, setOnboardBankAccount] = useState("");
    const [isOnboarding, setIsOnboarding] = useState(false);

    const filteredApps = useMemo(() => {
      return (applications || []).filter((a) => {
        if (stageFilter !== "ALL" && a.status !== stageFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const mName = String(a.name || "").toLowerCase().includes(q);
          const mJob = String(a.job_title || "").toLowerCase().includes(q);
          const mEmail = String(a.email || "").toLowerCase().includes(q);
          if (!mName && !mJob && !mEmail) return false;
        }
        return true;
      });
    }, [applications, stageFilter, searchQuery]);

    const handleUpdateStage = async (app: any, newStatus: string) => {
      setUpdatingId(app.id);
      try {
        const res = await apiFetch(
          `/api/hr/applications/${app.id}/status`,
          {
            method: "PUT",
            body: JSON.stringify({
              status: newStatus,
              notes: app.notes || `Moved to ${newStatus}`,
            }),
          },
          currentUser?.username,
        );
        if (res.ok) {
          showToast(`Candidate ${app.name} moved to ${newStatus}`, "success");
          onRefresh();
        } else {
          showToast(res.error || "Failed to update candidate stage", "error");
        }
      } catch (e) {
        showToast("Error updating candidate stage", "error");
      } finally {
        setUpdatingId(null);
      }
    };

    const getNextStage = (current: string): string | null => {
      if (current === "APPLIED") return "SCREENING";
      if (current === "SCREENING") return "INTERVIEW";
      if (current === "INTERVIEW") return "OFFER_MADE";
      if (current === "OFFER_MADE") return "ACCEPTED";
      return null;
    };

    const normalizeFiveScale = (val: any, fallback = 4) => {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) return fallback;
      return n > 5
        ? Math.max(1, Math.min(5, Math.round(n / 20)))
        : Math.max(1, Math.min(5, Math.round(n)));
    };

    const handleOpenEvalModal = (app: any) => {
      setEvalCandidate(app);
      setEvalStatus(app.status || "INTERVIEW");
      setEvalInterviewDate(
        app.interview_date || new Date().toISOString().split("T")[0],
      );
      setEvalInterviewerName(
        app.interviewer_name || currentUser?.name || currentUser?.username || "HR Manager",
      );
      setScoreTech(normalizeFiveScale(app.score_technical, 4));
      setScoreComm(normalizeFiveScale(app.score_communication, 4));
      setScoreRel(normalizeFiveScale(app.score_reliability, 4));
      setScoreCult(normalizeFiveScale(app.score_culture_fit, 4));
      setEvalOfferedBasic(
        Number(app.offered_basic_salary || app.job_salary_min || 5000000),
      );
      setEvalOfferedAllowances(Number(app.offered_allowances || 500000));
      setEvalContractType(
        app.contract_type ||
          app.job_employment_type_default ||
          app.job_contract_type ||
          "PKWT",
      );
      setEvalContractMonths(Number(app.contract_duration_months || 12));
      setEvalPlannedJoinDate(
        app.planned_join_date ||
          new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      );
      setEvalNikKtp(app.nik_ktp || "");
      setEvalNpwp(app.npwp || "");
      setEvalPtkp(app.ptkp_status || "TK/0");
      setEvalBankName(app.bank_name || "");
      setEvalBankAccount(app.bank_account_number || "");
      setEvalNotes(app.notes || "");
    };

    const handleSaveEvaluation = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!evalCandidate) return;
      setIsSavingEval(true);
      try {
        const res = await apiFetch(
          `/api/hr/applications/${evalCandidate.id}/evaluation`,
          {
            method: "PUT",
            body: JSON.stringify({
              status: evalStatus,
              interview_date: evalInterviewDate,
              interviewer_name: evalInterviewerName,
              score_technical: scoreTech,
              score_communication: scoreComm,
              score_reliability: scoreRel,
              score_culture_fit: scoreCult,
              offered_basic_salary: evalOfferedBasic,
              offered_allowances: evalOfferedAllowances,
              contract_type: evalContractType,
              contract_duration_months: evalContractMonths,
              planned_join_date: evalPlannedJoinDate,
              nik_ktp: evalNikKtp,
              npwp: evalNpwp,
              ptkp_status: evalPtkp,
              bank_name: evalBankName,
              bank_account_number: evalBankAccount,
              notes: evalNotes,
            }),
          },
          currentUser?.username,
        );

        if (res.ok) {
          showToast(
            `Saved Interview Scorecard & Contract Offering for ${evalCandidate.name}`,
            "success",
          );
          setEvalCandidate(null);
          onRefresh();
        } else {
          showToast(res.error || "Failed to save candidate evaluation", "error");
        }
      } catch (err) {
        showToast("Error saving candidate evaluation", "error");
      } finally {
        setIsSavingEval(false);
      }
    };

    const handleOpenOnboardModal = (app: any) => {
      const suggestedUsername = (
        app.email?.split("@")[0] ||
        app.name?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "staff"
      )
        .trim()
        .toLowerCase();

      const defaultRole = app.job_department
        ? normalizeDepartmentToRole(app.job_department)
        : "PRODUCTION";

      setOnboardCandidate(app);
      setOnboardUsername(suggestedUsername);
      setOnboardRole(defaultRole);
      setOnboardLevel("STAFF");
      setOnboardBasicSalary(
        Number(app.offered_basic_salary || app.job_salary_min || 5000000),
      );
      setOnboardAllowances(Number(app.offered_allowances || 500000));
      setOnboardContractType(
        app.contract_type ||
          app.job_employment_type_default ||
          app.job_contract_type ||
          "PKWT",
      );
      setOnboardContractMonths(Number(app.contract_duration_months || 12));
      setOnboardJoinDate(
        app.planned_join_date || new Date().toISOString().split("T")[0],
      );
      setOnboardWorkCenterId(
        app.target_work_center_id ||
          app.job_work_center_id ||
          (defaultRole === "PRODUCTION" ? "WC-FAB" : ""),
      );
      setOnboardNikKtp(app.nik_ktp || "");
      setOnboardNpwp(app.npwp || "");
      setOnboardPtkp(app.ptkp_status || "TK/0");
      setOnboardBankName(app.bank_name || "");
      setOnboardBankAccount(app.bank_account_number || "");
    };

    const handleConfirmOnboard = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!onboardCandidate) return;
      setIsOnboarding(true);
      try {
        const res = await apiFetch(
          `/api/hr/applications/${onboardCandidate.id}/onboard`,
          {
            method: "POST",
            body: JSON.stringify({
              username: onboardUsername.trim().toLowerCase(),
              role: onboardRole,
              level: onboardLevel,
              basic_salary: onboardBasicSalary,
              allowances: onboardAllowances,
              hourly_rate: Math.round(onboardBasicSalary / 173),
              contract_type: onboardContractType,
              contract_duration_months: onboardContractMonths,
              join_date: onboardJoinDate,
              work_center_id: onboardWorkCenterId || null,
              nik_ktp: onboardNikKtp,
              npwp: onboardNpwp,
              ptkp_status: onboardPtkp,
              bank_name: onboardBankName,
              bank_account_number: onboardBankAccount,
            }),
          },
          currentUser?.username,
        );

        if (res.ok) {
          const nip = res.data?.employee_no || "EMP";
          showToast(
            `Onboarded ${onboardCandidate.name} (${nip}) → Directory, Payroll, ManPower & Initial KPI Baseline!`,
            "success",
          );
          setOnboardCandidate(null);
          onRefresh();
        } else {
          showToast(res.error || "Failed to onboard candidate", "error");
        }
      } catch (err) {
        showToast("Error during candidate onboarding", "error");
      } finally {
        setIsOnboarding(false);
      }
    };

    const computedEvalAverage = Number(
      ((scoreTech + scoreComm + scoreRel + scoreCult) / 4).toFixed(2),
    );

    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        {/* PIPELINE COMMAND BAR */}
        <div className="hris-glass-panel p-4 rounded-[28px] flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStageFilter("ALL")}
              className={`h-9 px-3.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
                stageFilter === "ALL"
                  ? "bg-[#121318] text-white shadow-xs"
                  : "bg-white/80 text-[#646876] hover:bg-white border border-white"
              }`}
            >
              All Funnel ({applications.length})
            </button>
            {STAGES.map((stg) => {
              const count = (applications || []).filter(
                (a) => a.status === stg.id,
              ).length;
              return (
                <button
                  key={stg.id}
                  type="button"
                  onClick={() => setStageFilter(stg.id)}
                  className={`h-9 px-3.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    stageFilter === stg.id
                      ? "bg-[#121318] text-white shadow-xs"
                      : "bg-white/80 text-[#32353E] hover:bg-white border border-white"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${stg.dot}`} />
                  <span>{stg.label}</span>
                  <span className="opacity-70 tabular-nums">({count})</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative flex-1 lg:w-64">
              <Search className="w-4 h-4 text-[#8E929F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search applicant or role..."
                className="w-full h-10 pl-10 pr-4 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#121318] outline-none"
              />
            </div>

            <div className="flex items-center p-1 rounded-2xl bg-stone-200/60 border border-white">
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  viewMode === "kanban"
                    ? "bg-white text-[#121318] shadow-2xs"
                    : "text-[#646876]"
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Kanban</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  viewMode === "cards"
                    ? "bg-white text-[#121318] shadow-2xs"
                    : "text-[#646876]"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>
            </div>
          </div>
        </div>

        {/* 6-LANE KANBAN HIRING PIPELINE BOARD */}
        {viewMode === "kanban" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3.5 items-start">
            {STAGES.filter(
              (s) => stageFilter === "ALL" || stageFilter === s.id,
            ).map((stage) => {
              const laneApps = filteredApps.filter(
                (a) => a.status === stage.id,
              );
              return (
                <div
                  key={stage.id}
                  className="hris-glass-panel p-3.5 rounded-[26px] space-y-3 min-h-[420px] flex flex-col"
                >
                  {/* Lane Header */}
                  <div className="flex items-center justify-between px-1 pb-2 border-b border-stone-200/60">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${stage.dot}`} />
                      <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-[#121318]">
                        {stage.label}
                      </h4>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-white text-[#121318] font-extrabold text-[10px] border border-stone-200/70 tabular-nums">
                      {laneApps.length}
                    </span>
                  </div>

                  {/* Lane Cards */}
                  <div className="space-y-3 flex-1">
                    {laneApps.length === 0 ? (
                      <div className="h-44 rounded-2xl border border-dashed border-stone-300/70 flex items-center justify-center text-[11px] font-medium text-[#8E929F]">
                        Empty stage
                      </div>
                    ) : (
                      laneApps.map((app) => {
                        const isOnboarded = Number(app.token_used) === 1;
                        const nextStage = getNextStage(app.status);
                        const rawOverall = Number(app.interview_overall_score || 0);
                        const overallScore =
                          rawOverall > 5 ? Number((rawOverall / 20).toFixed(1)) : rawOverall;
                        const offeredBasic = Number(app.offered_basic_salary || 0);
                        return (
                          <div
                            key={app.id}
                            className="p-3.5 rounded-2xl bg-white/90 border border-white shadow-xs space-y-2.5 flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-1.5">
                                <div className="min-w-0">
                                  <h5 className="text-xs font-extrabold text-[#121318] truncate">
                                    {app.name}
                                  </h5>
                                  <p className="text-[11px] font-bold text-teal-700 truncate">
                                    {app.job_title}
                                  </p>
                                </div>

                                <select
                                  disabled={updatingId === app.id}
                                  value={app.status}
                                  onChange={(e) =>
                                    handleUpdateStage(app, e.target.value)
                                  }
                                  className="px-1.5 py-1 rounded-lg bg-stone-100 border border-stone-200 text-[10px] font-extrabold text-[#32353E] outline-none cursor-pointer"
                                >
                                  {STAGES.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Scorecard & Offering Badges */}
                              <div className="mt-2 flex flex-wrap items-center gap-1">
                                {overallScore > 0 && (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/70 text-[10px] font-extrabold inline-flex items-center gap-1 tabular-nums">
                                    <Award className="w-2.5 h-2.5" />
                                    {overallScore.toFixed(1)}/5.0
                                  </span>
                                )}
                                {app.contract_type && (
                                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60 text-[10px] font-extrabold">
                                    {app.contract_type}
                                    {app.contract_type === "PKWT" && app.contract_duration_months
                                      ? ` ${app.contract_duration_months}m`
                                      : ""}
                                  </span>
                                )}
                                {offeredBasic > 0 && (
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[10px] font-extrabold tabular-nums">
                                    {formatRupiah(offeredBasic)}
                                  </span>
                                )}
                              </div>

                              <div className="mt-2 space-y-1 text-[11px] text-[#646876] font-medium">
                                <div className="flex items-center gap-1.5 truncate">
                                  <Mail className="w-3 h-3 text-[#8E929F] shrink-0" />
                                  <span className="truncate">{app.email}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Phone className="w-3 h-3 text-[#8E929F] shrink-0" />
                                  <span>{app.phone}</span>
                                </div>
                              </div>

                              {app.nik_ktp && (
                                <div className="mt-1.5 px-2 py-1 rounded-lg bg-stone-50 border border-stone-200/60 text-[10px] font-mono text-stone-600 truncate">
                                  ID: {app.nik_ktp} • {app.ptkp_status || "TK/0"}
                                </div>
                              )}
                            </div>

                            <div className="pt-2 border-t border-stone-100 space-y-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEvalModal(app)}
                                className="w-full py-1.5 px-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200/70 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <ClipboardCheck className="w-3 h-3" />
                                <span>Scorecard &amp; Contract Offer</span>
                              </button>

                              {nextStage && (
                                <button
                                  type="button"
                                  disabled={updatingId === app.id}
                                  onClick={() =>
                                    handleUpdateStage(app, nextStage)
                                  }
                                  className="w-full py-1.5 px-2.5 rounded-xl bg-stone-100 hover:bg-[#121318] text-[#121318] hover:text-white text-[11px] font-bold flex items-center justify-between transition-colors cursor-pointer"
                                >
                                  <span>
                                    Advance to {nextStage.replace("_", " ")}
                                  </span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}

                              {(app.status === "OFFER_MADE" ||
                                app.status === "ACCEPTED") && (
                                <button
                                  type="button"
                                  onClick={() => printOfferingLetter(app)}
                                  className="w-full py-1.5 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/70 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>Offering Letter PDF</span>
                                </button>
                              )}

                              {app.status === "ACCEPTED" &&
                                (isOnboarded ? (
                                  <div className="w-full py-1.5 px-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold flex items-center justify-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Onboarded to ERP ✓</span>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenOnboardModal(app)}
                                    className="w-full py-2 px-3 rounded-xl bg-[#121318] hover:bg-[#1E2028] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                                  >
                                    <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>1-Click Onboard</span>
                                  </button>
                                ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* COMPACT GRID VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredApps.map((app) => {
              const isOnboarded = Number(app.token_used) === 1;
              const rawOverall = Number(app.interview_overall_score || 0);
              const overallScore =
                rawOverall > 5 ? Number((rawOverall / 20).toFixed(1)) : rawOverall;
              const offeredBasic = Number(app.offered_basic_salary || 0);
              return (
                <div
                  key={app.id}
                  className="hris-glass-card p-5 rounded-[26px] flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-[#8E929F]">
                          {app.id}
                        </span>
                        <h4 className="text-base font-extrabold text-[#121318] truncate">
                          {app.name}
                        </h4>
                        <p className="text-xs font-bold text-teal-700 truncate">
                          {app.job_title} ({app.job_department})
                        </p>
                      </div>

                      <select
                        disabled={updatingId === app.id}
                        value={app.status}
                        onChange={(e) => handleUpdateStage(app, e.target.value)}
                        className="px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[10px] font-extrabold uppercase text-[#121318] outline-none cursor-pointer"
                      >
                        {STAGES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {overallScore > 0 && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-extrabold inline-flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          Score: {overallScore.toFixed(2)} / 5.0
                        </span>
                      )}
                      {app.contract_type && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-extrabold">
                          {app.contract_type}
                        </span>
                      )}
                      {offeredBasic > 0 && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-extrabold tabular-nums">
                          Offer: {formatRupiah(offeredBasic)}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-stone-200/50 space-y-1 text-xs text-[#646876] font-medium">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-[#8E929F]" />
                        <span>{app.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#8E929F]" />
                        <span>{app.phone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-stone-200/50 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEvalModal(app)}
                      className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      <span>Scorecard &amp; Offer</span>
                    </button>

                    {(app.status === "OFFER_MADE" ||
                      app.status === "ACCEPTED") && (
                      <button
                        type="button"
                        onClick={() => printOfferingLetter(app)}
                        className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-[#121318] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Offering PDF</span>
                      </button>
                    )}

                    {app.status === "ACCEPTED" &&
                      (isOnboarded ? (
                        <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Onboarded ✓</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenOnboardModal(app)}
                          className="px-3.5 py-1.5 bg-[#121318] hover:bg-[#1E2028] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Onboard to Workforce</span>
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* INTERVIEW SCORECARD & CONTRACT OFFERING MODAL */}
        <Modal
          isOpen={Boolean(evalCandidate)}
          onClose={() => setEvalCandidate(null)}
          title={`Interview Scorecard & Contract Offering — ${evalCandidate?.name}`}
          description={`Position: ${evalCandidate?.job_title || "-"} (${evalCandidate?.job_department || "-"}) • Budget: ${evalCandidate?.job_salary_range || evalCandidate?.job_salary_string || "Negotiable"}`}
          maxWidth="xl"
          uiTheme="hris"
        >
          <form
            onSubmit={handleSaveEvaluation}
            className="space-y-4 text-left font-bold"
          >
            {/* Stage, Interview Date & Assessor */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select
                label="Pipeline Stage"
                value={evalStatus}
                onChange={(e) => setEvalStatus(e.target.value)}
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Input
                type="date"
                label="Interview Date"
                value={evalInterviewDate}
                onChange={(e) => setEvalInterviewDate(e.target.value)}
                className="font-mono"
              />
              <Input
                type="text"
                label="Assessor / Interviewer"
                value={evalInterviewerName}
                onChange={(e) => setEvalInterviewerName(e.target.value)}
                placeholder="e.g. HR Manager / Plant Head"
              />
            </div>

            {/* 4-Pillar Structured Interview Scorecard */}
            <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-sky-950">
                  <Award className="w-4 h-4 text-sky-700" />
                  <span>4-Pillar Competency Scorecard (1–5 Scale)</span>
                </div>
                <Badge variant="info" size="md">
                  Overall Score: {computedEvalAverage.toFixed(2)} / 5.0
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Select
                  label="1. Technical / Skill"
                  value={String(scoreTech)}
                  onChange={(e) => setScoreTech(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} ★
                    </option>
                  ))}
                </Select>
                <Select
                  label="2. Communication"
                  value={String(scoreComm)}
                  onChange={(e) => setScoreComm(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} ★
                    </option>
                  ))}
                </Select>
                <Select
                  label="3. Reliability & HSE"
                  value={String(scoreRel)}
                  onChange={(e) => setScoreRel(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} ★
                    </option>
                  ))}
                </Select>
                <Select
                  label="4. Culture & Attitude"
                  value={String(scoreCult)}
                  onChange={(e) => setScoreCult(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} ★
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Structured PKWT / PKWTT Commercial Offering Package */}
            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-950">
                  <Briefcase className="w-4 h-4 text-amber-700" />
                  <span>Structured Offering Package &amp; Contract Terms</span>
                </div>
                <span className="text-[11px] font-extrabold text-amber-800 tabular-nums">
                  Total Gross:{" "}
                  {formatRupiah(evalOfferedBasic + evalOfferedAllowances)}/mo
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select
                  label="Contract Scheme"
                  value={evalContractType}
                  onChange={(e) => setEvalContractType(e.target.value)}
                >
                  <option value="PKWT">Fixed-Term Contract</option>
                  <option value="PROBATION">Probation (3 Months)</option>
                  <option value="PKWTT">Permanent Employment</option>
                  <option value="HARIAN_LEPAS">Daily Worker</option>
                </Select>
                <Input
                  type="number"
                  label="Duration (Months)"
                  min={1}
                  max={60}
                  disabled={evalContractType === "PKWTT"}
                  value={evalContractMonths}
                  onChange={(e) =>
                    setEvalContractMonths(Math.max(1, Number(e.target.value)))
                  }
                  className="font-mono"
                />
                <Input
                  type="date"
                  label="Planned Join Date"
                  value={evalPlannedJoinDate}
                  onChange={(e) => setEvalPlannedJoinDate(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                    Offered Basic Monthly Salary
                  </label>
                  <CurrencyInput
                    value={evalOfferedBasic}
                    onChange={setEvalOfferedBasic}
                    prefix="Rp "
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                    Offered Fixed Allowances
                  </label>
                  <CurrencyInput
                    value={evalOfferedAllowances}
                    onChange={setEvalOfferedAllowances}
                    prefix="Rp "
                  />
                </div>
              </div>
            </div>

            {/* Pre-Onboarding Legal & Payroll Verification */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                type="text"
                label="National ID (16 Digits)"
                value={evalNikKtp}
                onChange={(e) => setEvalNikKtp(e.target.value)}
                placeholder="3510xxxxxxxxxxxx"
                className="font-mono"
              />
              <Input
                type="text"
                label="Tax ID"
                value={evalNpwp}
                onChange={(e) => setEvalNpwp(e.target.value)}
                placeholder="Optional Tax ID"
                className="font-mono"
              />
              <Select
                label="Tax-Free Threshold (Income Tax)"
                value={evalPtkp}
                onChange={(e) => setEvalPtkp(e.target.value)}
              >
                {PTKP_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                type="text"
                label="Payroll Bank Name"
                value={evalBankName}
                onChange={(e) => setEvalBankName(e.target.value)}
                placeholder="e.g. BCA / Mandiri / BRI"
              />
              <Input
                type="text"
                label="Bank Account Number"
                value={evalBankAccount}
                onChange={(e) => setEvalBankAccount(e.target.value)}
                placeholder="Account number"
                className="font-mono"
              />
            </div>

            <Textarea
              label="HRD Interview Notes & Assessment Summary"
              rows={2}
              value={evalNotes}
              onChange={(e) => setEvalNotes(e.target.value)}
              placeholder="Record key strengths, technical findings, or salary negotiation notes..."
            />

            <div className="pt-3 border-t border-stone-200 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEvalCandidate(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSavingEval}
              >
                Save Scorecard &amp; Offering Package
              </Button>
            </div>
          </form>
        </Modal>

        {/* 1-CLICK ONBOARD TO WORKFORCE MODAL */}
        <Modal
          isOpen={Boolean(onboardCandidate)}
          onClose={() => setOnboardCandidate(null)}
          title={`1-Click Atomic Onboard — ${onboardCandidate?.name}`}
          description="Atomically generates Employee ID, creates ERP User Account, syncs Master Salary & Tax/Bank, registers Shop Floor ManPower + Work Center, seeds Initial KPI Baseline, and updates Vacancy Quota."
          maxWidth="xl"
          uiTheme="hris"
        >
          <form
            onSubmit={handleConfirmOnboard}
            className="space-y-4 text-left font-bold"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                type="text"
                label="Assigned ERP Username"
                required
                value={onboardUsername}
                onChange={(e) => setOnboardUsername(e.target.value)}
                className="font-mono"
              />

              <Select
                label="Department / Role"
                value={onboardRole}
                onChange={(e) => setOnboardRole(e.target.value)}
              >
                {ERP_DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.value === "PRODUCTION"
                      ? "PRODUCTION (Auto-sync ManPower)"
                      : `${d.value} — ${d.label}`}
                  </option>
                ))}
              </Select>

              <Select
                label="Rank Level"
                value={onboardLevel}
                onChange={(e) => setOnboardLevel(e.target.value)}
              >
                <option value="STAFF">STAFF</option>
                <option value="SUPERVISOR">SUPERVISOR</option>
                <option value="MANAGER">MANAGER</option>
              </Select>
            </div>

            {/* Compensation & Contract */}
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-emerald-700" />
                  Master Compensation, Contract &amp; Shop Floor Costing
                </span>
                <span className="text-[11px] font-mono font-extrabold text-emerald-800">
                  COGS Hourly Rate:{" "}
                  {formatRupiah(Math.round(onboardBasicSalary / 173))}/hr
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                    Basic Monthly Salary
                  </label>
                  <CurrencyInput
                    value={onboardBasicSalary}
                    onChange={setOnboardBasicSalary}
                    prefix="Rp "
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                    Fixed Monthly Allowances
                  </label>
                  <CurrencyInput
                    value={onboardAllowances}
                    onChange={setOnboardAllowances}
                    prefix="Rp "
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select
                  label="Contract Scheme"
                  value={onboardContractType}
                  onChange={(e) => setOnboardContractType(e.target.value)}
                >
                  <option value="PKWT">Fixed-Term Contract</option>
                  <option value="PROBATION">Probation</option>
                  <option value="PKWTT">Permanent</option>
                  <option value="HARIAN_LEPAS">Daily Worker</option>
                </Select>

                <Input
                  type="number"
                  label="Duration (Months)"
                  min={1}
                  max={60}
                  disabled={onboardContractType === "PKWTT"}
                  value={onboardContractMonths}
                  onChange={(e) =>
                    setOnboardContractMonths(
                      Math.max(1, Number(e.target.value)),
                    )
                  }
                  className="font-mono"
                />

                <Input
                  type="date"
                  label="Effective Join Date"
                  required
                  value={onboardJoinDate}
                  onChange={(e) => setOnboardJoinDate(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            {/* Legal Identity, Tax Status, Bank & Work Center */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                type="text"
                label="National ID (16 Digits)"
                value={onboardNikKtp}
                onChange={(e) => setOnboardNikKtp(e.target.value)}
                placeholder="3510xxxxxxxxxxxx"
                className="font-mono"
              />
              <Input
                type="text"
                label="Tax ID"
                value={onboardNpwp}
                onChange={(e) => setOnboardNpwp(e.target.value)}
                placeholder="Tax ID"
                className="font-mono"
              />
              <Select
                label="Tax-Free Threshold (Income Tax)"
                value={onboardPtkp}
                onChange={(e) => setOnboardPtkp(e.target.value)}
              >
                {PTKP_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                type="text"
                label="Payroll Bank Name"
                value={onboardBankName}
                onChange={(e) => setOnboardBankName(e.target.value)}
                placeholder="BCA / Mandiri / BRI"
              />
              <Input
                type="text"
                label="Bank Account Number"
                value={onboardBankAccount}
                onChange={(e) => setOnboardBankAccount(e.target.value)}
                placeholder="Payroll Account"
                className="font-mono"
              />
              <Select
                label={
                  <span>
                    <Factory className="w-3 h-3 inline mr-1" />
                    Target Work Center (Work Order)
                  </span>
                }
                value={onboardWorkCenterId}
                onChange={(e) => setOnboardWorkCenterId(e.target.value)}
              >
                {WORK_CENTERS.map((wc) => (
                  <option key={wc.id} value={wc.id}>
                    {wc.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="pt-4 border-t border-stone-200 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOnboardCandidate(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isOnboarding}
              >
                Confirm &amp; Atomic Onboard
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  },
);
