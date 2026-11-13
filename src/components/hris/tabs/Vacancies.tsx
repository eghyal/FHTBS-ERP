import React, { useState, useMemo } from "react";
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Clock,
  DollarSign,
  Search,
  CheckCircle2,
  Sparkles,
  Globe,
  Users,
  Factory,
  Calendar,
  FileCheck2,
  Archive,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { formatRupiah } from "@/utils/format";
import { apiFetch } from "@/utils/api";
import {
  ERP_DEPARTMENT_OPTIONS,
  normalizeDepartmentToRole,
} from "@/constants/rbac";

interface HrVacanciesTabProps {
  jobs: any[];
  currentUser: any;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onRefresh: () => void;
}

const WORK_CENTERS = [
  { id: "WC-CUT", label: "WC-CUT — Cutting & Batching" },
  { id: "WC-FAB", label: "WC-FAB — Hydraulic Press & Fabrication" },
  { id: "WC-FIN", label: "WC-FIN — Curing & Surface Finishing" },
  { id: "WC-ASSY", label: "WC-ASSY — Palletizing & Packaging" },
  { id: "WC-QC", label: "WC-QC — Quality Control & Lab" },
];

export const HrVacanciesTab: React.FC<HrVacanciesTabProps> = React.memo(
  ({ jobs, currentUser, showToast, onRefresh }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [deptFilter, setDeptFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingJob, setEditingJob] = useState<any | null>(null);
    const [title, setTitle] = useState("");
    const [department, setDepartment] = useState("PRODUCTION");
    const [location, setLocation] = useState("Head Office / Plant");
    const [type, setType] = useState("Full-time");
    const [status, setStatus] = useState("OPEN");
    const [headcountQuota, setHeadcountQuota] = useState(2);
    const [hiredCount, setHiredCount] = useState(0);
    const [salaryMin, setSalaryMin] = useState(5000000);
    const [salaryMax, setSalaryMax] = useState(7500000);
    const [salaryString, setSalaryString] = useState(
      "Rp 5.000.000 - Rp 7.500.000",
    );
    const [employmentTypeDefault, setEmploymentTypeDefault] = useState("PKWT");
    const [targetWorkCenterId, setTargetWorkCenterId] = useState("WC-FAB");
    const [closingDate, setClosingDate] = useState("");
    const [description, setDescription] = useState("");
    const [requirementsText, setRequirementsText] = useState("");
    const [benefitsText, setBenefitsText] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const filteredJobs = useMemo(() => {
      return (jobs || []).filter((j) => {
        if (
          deptFilter !== "ALL" &&
          normalizeDepartmentToRole(j.department) !== deptFilter
        )
          return false;
        if (statusFilter !== "ALL" && (j.status || "OPEN") !== statusFilter)
          return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const mTitle = String(j.title || "").toLowerCase().includes(q);
          const mDept = String(j.department || "").toLowerCase().includes(q);
          const mLoc = String(j.location || "").toLowerCase().includes(q);
          if (!mTitle && !mDept && !mLoc) return false;
        }
        return true;
      });
    }, [jobs, deptFilter, statusFilter, searchQuery]);

    const activeJob = useMemo(() => {
      if (selectedJobId) {
        const found = filteredJobs.find((j) => String(j.id) === String(selectedJobId));
        if (found) return found;
      }
      return filteredJobs[0] || null;
    }, [filteredJobs, selectedJobId]);

    const parseJsonList = (raw: any): string[] => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [String(raw)];
      } catch {
        return String(raw)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    };

    const syncSalaryDisplay = (minVal: number, maxVal: number) => {
      if (minVal > 0 && maxVal > minVal) {
        setSalaryString(
          `Rp ${minVal.toLocaleString("en-US")} - Rp ${maxVal.toLocaleString("en-US")}`,
        );
      } else if (minVal > 0) {
        setSalaryString(`Rp ${minVal.toLocaleString("en-US")}`);
      }
    };

    const handleOpenCreate = () => {
      setEditingJob(null);
      setTitle("");
      setDepartment("PRODUCTION");
      setLocation("Head Office / Plant");
      setType("Full-time");
      setStatus("OPEN");
      setHeadcountQuota(2);
      setHiredCount(0);
      setSalaryMin(5000000);
      setSalaryMax(7500000);
      setSalaryString("Rp 5.000.000 - Rp 7.500.000");
      setEmploymentTypeDefault("PKWT");
      setTargetWorkCenterId("WC-FAB");
      const defaultClose = new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .split("T")[0];
      setClosingDate(defaultClose);
      setDescription("");
      setRequirementsText(
        "Minimum 1 year experience in related field\nDisciplined and strong team player",
      );
      setBenefitsText(
        "Health & Social Security Insurance\nKPI Incentives & Measured Overtime",
      );
      setIsModalOpen(true);
    };

    const handleOpenEdit = (job: any) => {
      setEditingJob(job);
      setTitle(job.title || "");
      setDepartment(normalizeDepartmentToRole(job.department || "PRODUCTION"));
      setLocation(job.location || "Head Office");
      setType(job.type || "Full-time");
      setStatus(job.status || "OPEN");
      setHeadcountQuota(Math.max(1, Number(job.headcount_quota) || 1));
      setHiredCount(Math.max(0, Number(job.hired_count) || 0));
      const sMin = Number(job.salary_min) || 5000000;
      const sMax = Number(job.salary_max) || Math.max(sMin, 7000000);
      setSalaryMin(sMin);
      setSalaryMax(sMax);
      setSalaryString(
        job.salary_string ||
          `Rp ${sMin.toLocaleString("en-US")} - Rp ${sMax.toLocaleString("en-US")}`,
      );
      setEmploymentTypeDefault(job.employment_type_default || "PKWT");
      setTargetWorkCenterId(job.target_work_center_id || "WC-FAB");
      setClosingDate(job.closing_date || "");
      setDescription(job.description || "");
      setRequirementsText(parseJsonList(job.requirements).join("\n"));
      setBenefitsText(parseJsonList(job.benefits).join("\n"));
      setIsModalOpen(true);
    };

    const handleSaveJob = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim() || !description.trim()) {
        showToast("Job title and description are required", "error");
        return;
      }
      setIsSaving(true);
      try {
        const reqArr = requirementsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        const benArr = benefitsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);

        const endpoint = editingJob
          ? `/api/hr/jobs/${editingJob.id}`
          : "/api/hr/jobs";
        const method = editingJob ? "PUT" : "POST";

        const res = await apiFetch(
          endpoint,
          {
            method,
            body: JSON.stringify({
              title: title.trim(),
              department,
              location,
              type,
              status,
              headcount_quota: Math.max(1, Number(headcountQuota) || 1),
              hired_count: Math.max(0, Number(hiredCount) || 0),
              salary_min: salaryMin,
              salary_max: Math.max(salaryMin, salaryMax),
              salary_string: salaryString,
              employment_type_default: employmentTypeDefault,
              target_work_center_id:
                department === "PRODUCTION" ? targetWorkCenterId : null,
              closing_date: closingDate || null,
              description: description.trim(),
              requirements: JSON.stringify(reqArr),
              benefits: JSON.stringify(benArr),
              pamphlet_bg_color: "#1c1917",
              pamphlet_accent_color: "#292524",
            }),
          },
          currentUser?.username,
        );

        if (res.ok) {
          showToast(
            editingJob ? "Job vacancy updated" : "New job vacancy published",
            "success",
          );
          setIsModalOpen(false);
          onRefresh();
        } else {
          showToast(res.error || "Failed to save job vacancy", "error");
        }
      } catch (err) {
        showToast("Error saving job vacancy", "error");
      } finally {
        setIsSaving(false);
      }
    };

    const handleArchiveJob = async (id: string) => {
      try {
        const res = await apiFetch(
          `/api/hr/jobs/${id}`,
          { method: "DELETE" },
          currentUser?.username,
        );
        if (res.ok) {
          showToast("Job vacancy archived", "success");
          onRefresh();
        }
      } catch (e) {
        showToast("Failed to archive job vacancy", "error");
      }
    };

    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        {/* EDITORIAL SPLIT-SCREEN JOB BOARD: LEFT LIST (5 COLS) + RIGHT LIVE ROLE INSPECTOR (7 COLS) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT 5 COLS: POSITION INDEX & FILTERS */}
          <div className="lg:col-span-5 space-y-4">
            <div className="hris-glass-panel p-5 rounded-[28px] space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200/60 flex items-center justify-center">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-[#121318]">
                      Open Requisitions
                    </h3>
                    <p className="text-[11px] font-medium text-[#8E929F]">
                      {filteredJobs.length} of {jobs.length} roles listed
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenCreate}
                  className="h-9 px-3.5 bg-[#F25730] hover:bg-[#e04720] text-white text-xs font-bold rounded-2xl flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Post Role</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-[#8E929F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search role title or plant location..."
                  className="w-full h-10 pl-10 pr-4 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#121318] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="h-9 px-3 bg-white/85 border border-white rounded-xl text-xs font-bold text-[#32353E] outline-none cursor-pointer"
                >
                  <option value="ALL">All Divisions</option>
                  {ERP_DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.value} — {d.label}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 px-3 bg-white/85 border border-white rounded-xl text-xs font-bold text-[#32353E] outline-none cursor-pointer"
                >
                  <option value="ALL">All Status</option>
                  <option value="OPEN">OPEN</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
            </div>

            {/* Selectable Job List */}
            {filteredJobs.length === 0 ? (
              <div className="hris-glass-panel p-10 rounded-[28px] text-center">
                <Briefcase className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-[#646876]">
                  No job vacancies match your filter.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1 custom-scrollbar">
                {filteredJobs.map((job) => {
                  const isSelected = activeJob?.id === job.id;
                  const quota = Math.max(1, Number(job.headcount_quota) || 1);
                  const hired = Math.max(0, Number(job.hired_count) || 0);
                  const quotaPct = Math.min(100, Math.round((hired / quota) * 100));
                  return (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJobId(String(job.id))}
                      className={`p-5 rounded-[26px] transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#121318] text-white shadow-[0_18px_36px_rgba(18,19,24,0.16)]"
                          : "hris-glass-card hover:bg-white/95 text-[#121318]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                              isSelected
                                ? "bg-white/15 text-white"
                                : "bg-stone-100 text-[#32353E]"
                            }`}
                          >
                            {job.department}
                          </span>
                          {job.employment_type_default && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                isSelected
                                  ? "bg-amber-400/20 text-amber-300"
                                  : "bg-amber-50 text-amber-800 border border-amber-200/70"
                              }`}
                            >
                              {job.employment_type_default}
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            job.status === "OPEN"
                              ? isSelected
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-stone-200/70 text-stone-500"
                          }`}
                        >
                          {job.status || "OPEN"}
                        </span>
                      </div>

                      <h4 className="text-base font-extrabold tracking-tight mt-2.5">
                        {job.title}
                      </h4>

                      <div
                        className={`mt-2.5 flex flex-wrap items-center gap-3 text-xs font-medium ${
                          isSelected ? "text-white/75" : "text-[#646876]"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {job.location || "Head Office"}
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Users className="w-3.5 h-3.5" />
                          {hired}/{quota} Hired
                        </span>
                      </div>

                      {/* Headcount Quota Progress Bar */}
                      <div className="mt-3 space-y-1">
                        <div
                          className={`w-full h-1.5 rounded-full overflow-hidden ${
                            isSelected ? "bg-white/15" : "bg-stone-200/80"
                          }`}
                        >
                          <div
                            className={`h-full rounded-full transition-all ${
                              hired >= quota
                                ? "bg-rose-500"
                                : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.max(quotaPct, hired > 0 ? 12 : 0)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT 7 COLS: LIVE ROLE INSPECTOR & SPECIFICATION PAMPHLET */}
          <div className="lg:col-span-7 lg:sticky lg:top-20">
            {activeJob ? (
              <div className="hris-glass-panel p-7 sm:p-8 rounded-[32px] relative overflow-hidden space-y-6">
                <div className="absolute -right-14 -top-14 w-56 h-56 rounded-full bg-gradient-to-bl from-rose-300/20 via-amber-200/15 to-transparent blur-3xl pointer-events-none" />

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-stone-200/60 pb-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60 text-[11px] font-extrabold uppercase tracking-wider">
                        {activeJob.department}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/70 text-[11px] font-extrabold uppercase">
                        {activeJob.employment_type_default || "PKWT"}
                      </span>
                      {activeJob.target_work_center_id && (
                        <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200/70 text-[11px] font-mono font-bold inline-flex items-center gap-1">
                          <Factory className="w-3 h-3" />
                          {activeJob.target_work_center_id}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#646876]">
                        <Globe className="w-3.5 h-3.5 text-emerald-600" />
                        Synced to /careers
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-[#121318] tracking-tight">
                      {activeJob.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-[#646876]">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-[#F25730]" />
                        {activeJob.location || "Head Office"}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-sky-600" />
                        {activeJob.type || "Full-time"}
                      </span>
                      {activeJob.closing_date && (
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-amber-600" />
                          Closes: {activeJob.closing_date}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(activeJob)}
                      className="px-4 py-2 rounded-2xl bg-[#121318] hover:bg-[#1E2028] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Pencil className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Edit Role</span>
                    </button>
                    <Button
                      type="button"
                      variant="amber_soft"
                      size="sm"
                      onClick={() => handleArchiveJob(activeJob.id)}
                      leftIcon={<Archive className="w-3.5 h-3.5" />}
                      title="Archive Vacancy"
                    >
                      Archive
                    </Button>
                  </div>
                </div>

                {/* Compensation & Headcount Quota Banner */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-7 p-4 rounded-2xl bg-gradient-to-r from-[#1E2028] to-[#121318] text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                        <DollarSign className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 block">
                          Approved Salary Budget Band
                        </span>
                        <span className="text-sm sm:text-base font-extrabold tabular-nums font-mono">
                          {Number(activeJob.salary_min) > 0
                            ? `${formatRupiah(activeJob.salary_min)} – ${formatRupiah(activeJob.salary_max || activeJob.salary_min)}`
                            : activeJob.salary_string || "Competitive"}
                        </span>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-white/10 text-[11px] font-bold">
                      {activeJob.status || "OPEN"}
                    </span>
                  </div>

                  <div className="md:col-span-5 p-4 rounded-2xl bg-white/85 border border-white flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#646876] flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        Headcount Quota Control
                      </span>
                      <span className="text-xs font-black font-mono text-[#121318]">
                        {Number(activeJob.hired_count || 0)} / {Math.max(1, Number(activeJob.headcount_quota || 1))} Hired
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-stone-200/80 overflow-hidden my-2">
                      <div
                        className={`h-full rounded-full transition-all ${
                          Number(activeJob.hired_count || 0) >=
                          Math.max(1, Number(activeJob.headcount_quota || 1))
                            ? "bg-rose-500"
                            : "bg-emerald-500"
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (Number(activeJob.hired_count || 0) /
                                Math.max(1, Number(activeJob.headcount_quota || 1))) *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-[#8E929F]">
                      {Number(activeJob.hired_count || 0) >=
                      Math.max(1, Number(activeJob.headcount_quota || 1))
                        ? "Quota fulfilled — Auto-closed on /careers"
                        : `${Math.max(1, Number(activeJob.headcount_quota || 1)) - Number(activeJob.hired_count || 0)} remaining slot(s) before auto-close`}
                    </span>
                  </div>
                </div>

                {/* Role Description */}
                <div className="space-y-2">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#8E929F]">
                    Role Overview &amp; Mandate
                  </h4>
                  <p className="text-sm text-[#32353E] leading-relaxed bg-white/75 p-4 rounded-2xl border border-white">
                    {activeJob.description}
                  </p>
                </div>

                {/* Requirements & Benefits Split */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-white/80 border border-white space-y-2.5">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#121318] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Qualifications</span>
                    </h4>
                    <ul className="space-y-1.5 text-xs text-[#646876] font-medium">
                      {parseJsonList(activeJob.requirements).length === 0 ? (
                        <li>Standard position qualifications apply.</li>
                      ) : (
                        parseJsonList(activeJob.requirements).map(
                          (req, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                              <span>{req}</span>
                            </li>
                          ),
                        )
                      )}
                    </ul>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/80 border border-white space-y-2.5">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#121318] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#F25730]" />
                      <span>Perks &amp; Benefits</span>
                    </h4>
                    <ul className="space-y-1.5 text-xs text-[#646876] font-medium">
                      {parseJsonList(activeJob.benefits).length === 0 ? (
                        <li>Competitive salary &amp; Social Security coverage.</li>
                      ) : (
                        parseJsonList(activeJob.benefits).map((ben, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#F25730] mt-1.5 shrink-0" />
                            <span>{ben}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="hris-glass-panel p-14 rounded-[32px] text-center">
                <Briefcase className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                <p className="text-sm font-extrabold text-[#121318]">
                  Select a vacancy on the left to inspect its full specification.
                </p>
              </div>
            )}
          </div>
        </div>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingJob ? "Edit Job Vacancy & Quota" : "Post New Job Vacancy & Budget"}
          description="Published OPEN positions with available headcount quota appear directly on the public /careers portal."
          maxWidth="xl"
          uiTheme="hris"
        >
          <form
            onSubmit={handleSaveJob}
            className="space-y-4 text-left font-bold"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                type="text"
                label="Position Title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Hydraulic Machine Operator"
              />

              <Select
                label="Department / Division"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                {ERP_DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.value} — {d.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Input
                type="number"
                label="Headcount Quota"
                min={1}
                max={100}
                required
                value={headcountQuota}
                onChange={(e) =>
                  setHeadcountQuota(Math.max(1, Number(e.target.value) || 1))
                }
                className="font-mono"
              />

              <Select
                label="Contract Scheme"
                value={employmentTypeDefault}
                onChange={(e) => setEmploymentTypeDefault(e.target.value)}
              >
                <option value="PKWT">Fixed-Term Contract</option>
                <option value="PKWTT">Permanent</option>
                <option value="PROBATION">Probation (3 Mos)</option>
                <option value="HARIAN_LEPAS">Daily Worker</option>
              </Select>

              <Input
                type="date"
                label="Closing Date"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                className="font-mono"
              />

              <Select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="OPEN">OPEN</option>
                <option value="CLOSED">CLOSED</option>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                type="text"
                label="Plant / Office Location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />

              <Select
                label="Work Schedule Type"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="Full-time">Full-time</option>
                <option value="Contract">Contract</option>
                <option value="Shift Worker">Shift Worker</option>
              </Select>

              <Select
                label="Target Work Center (MES)"
                disabled={department !== "PRODUCTION"}
                value={department === "PRODUCTION" ? targetWorkCenterId : ""}
                onChange={(e) => setTargetWorkCenterId(e.target.value)}
              >
                {department !== "PRODUCTION" ? (
                  <option value="">Non-Production Role</option>
                ) : (
                  WORK_CENTERS.map((wc) => (
                    <option key={wc.id} value={wc.id}>
                      {wc.label}
                    </option>
                  ))
                )}
              </Select>
            </div>

            <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-stone-600 flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                  Structured Monthly Salary Budget (Used as Default Offering)
                </span>
                <span className="text-[11px] font-mono text-stone-500">
                  {salaryString}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                    Minimum Base Salary (Rp)
                  </label>
                  <CurrencyInput
                    value={salaryMin}
                    onChange={(val) => {
                      setSalaryMin(val);
                      const nextMax = Math.max(val, salaryMax);
                      setSalaryMax(nextMax);
                      syncSalaryDisplay(val, nextMax);
                    }}
                    prefix="Rp "
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                    Maximum Base Salary (Rp)
                  </label>
                  <CurrencyInput
                    value={salaryMax}
                    onChange={(val) => {
                      setSalaryMax(val);
                      syncSalaryDisplay(salaryMin, val);
                    }}
                    prefix="Rp "
                  />
                </div>
              </div>
            </div>

            <Textarea
              label="Role Description"
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Textarea
                label="Requirements (One per line)"
                rows={3}
                value={requirementsText}
                onChange={(e) => setRequirementsText(e.target.value)}
              />

              <Textarea
                label="Benefits (One per line)"
                rows={3}
                value={benefitsText}
                onChange={(e) => setBenefitsText(e.target.value)}
              />
            </div>

            <div className="pt-4 border-t border-stone-200 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSaving}
              >
                Save Vacancy
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  },
);
