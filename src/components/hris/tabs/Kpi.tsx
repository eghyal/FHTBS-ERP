import React, { useState, useMemo } from "react";
import { Award, Plus, Star, Search, Trophy, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { apiFetch } from "@/utils/api";

interface HrKpiTabProps {
  kpis: any[];
  users: any[];
  currentUser: any;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onRefresh: () => void;
}

export const HrKpiTab: React.FC<HrKpiTabProps> = React.memo(
  ({ kpis, users, currentUser, showToast, onRefresh }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [periodFilter, setPeriodFilter] = useState("ALL");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [empUsername, setEmpUsername] = useState("");
    const [periodName, setPeriodName] = useState("Q4 2026");
    const [comm, setComm] = useState(4);
    const [prod, setProd] = useState(4);
    const [rel, setRel] = useState(4);
    const [lead, setLead] = useState(4);
    const [tech, setTech] = useState(4);
    const [notes, setNotes] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const uniquePeriods = useMemo(() => {
      const s = new Set<string>();
      (kpis || []).forEach((k) => {
        if (k.period_name) s.add(k.period_name);
      });
      return Array.from(s);
    }, [kpis]);

    const filteredKpis = useMemo(() => {
      return (kpis || []).filter((k) => {
        if (periodFilter !== "ALL" && k.period_name !== periodFilter)
          return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const mName = String(k.employee_name || "")
            .toLowerCase()
            .includes(q);
          const mUser = String(k.employee_username || "")
            .toLowerCase()
            .includes(q);
          if (!mName && !mUser) return false;
        }
        return true;
      });
    }, [kpis, periodFilter, searchQuery]);

    // Top 3 Performers Podium
    const topPerformers = useMemo(() => {
      return [...filteredKpis]
        .sort((a, b) => Number(b.overall_score || 0) - Number(a.overall_score || 0))
        .slice(0, 3);
    }, [filteredKpis]);

    // Organization 5-Axis Averages
    const axisAverages = useMemo(() => {
      if (filteredKpis.length === 0) {
        return [
          { label: "Communication", avg: 4.5 },
          { label: "Productivity", avg: 4.6 },
          { label: "Reliability", avg: 4.7 },
          { label: "Leadership", avg: 4.3 },
          { label: "Technical", avg: 4.6 },
        ];
      }
      const n = filteredKpis.length;
      const sum = (key: string) =>
        filteredKpis.reduce((acc, k) => acc + Number(k[key] || 0), 0) / n;
      return [
        { label: "Communication", avg: sum("score_communication") },
        { label: "Productivity", avg: sum("score_productivity") },
        { label: "Reliability", avg: sum("score_reliability") },
        { label: "Leadership", avg: sum("score_leadership") },
        { label: "Technical", avg: sum("score_technical") },
      ];
    }, [filteredKpis]);

    const handleSubmitKpi = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!empUsername || !periodName) {
        showToast("Please select an employee and period", "error");
        return;
      }
      setIsSaving(true);
      try {
        const res = await apiFetch(
          "/api/hr/kpis",
          {
            method: "POST",
            body: JSON.stringify({
              employee_username: empUsername,
              period_name: periodName,
              score_communication: comm,
              score_productivity: prod,
              score_reliability: rel,
              score_leadership: lead,
              score_technical: tech,
              evaluation_notes: notes,
            }),
          },
          currentUser?.username,
        );

        if (res.ok) {
          showToast(
            "360° KPI Evaluation recorded and linked to Payroll bonus engine",
            "success",
          );
          setIsModalOpen(false);
          onRefresh();
        } else {
          showToast(res.error || "Failed to submit KPI evaluation", "error");
        }
      } catch (err) {
        showToast("Error submitting KPI evaluation", "error");
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* TOP SECTION: CHAMPIONS PODIUM SPOTLIGHT (7 COLS) + 5-AXIS BENCHMARK RADAR BARS (5 COLS) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Champions Podium */}
          <div className="lg:col-span-7 hris-glass-panel p-6 rounded-[28px] flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#121318] tracking-tight">
                    Top Performers Podium
                  </h3>
                  <p className="text-xs font-medium text-[#8E929F]">
                    Scores ≥ 4.0 qualify for PRq Performance Bonus
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEmpUsername(users[0]?.username || "");
                  setNotes("");
                  setIsModalOpen(true);
                }}
                className="h-10 px-4 bg-[#F25730] hover:bg-[#e04720] text-white text-xs font-bold rounded-2xl flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Appraisal</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {topPerformers.map((k, idx) => (
                <div
                  key={`podium-${k.id}`}
                  className={`p-4 rounded-3xl border flex flex-col justify-between relative overflow-hidden ${
                    idx === 0
                      ? "bg-gradient-to-b from-amber-50/90 to-white border-amber-300/80 shadow-sm"
                      : "bg-white/80 border-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        idx === 0
                          ? "bg-amber-500 text-white"
                          : "bg-stone-100 text-[#646876]"
                      }`}
                    >
                      Rank #{idx + 1}
                    </span>
                    <span className="text-[10px] font-bold text-[#8E929F]">
                      {k.period_name}
                    </span>
                  </div>

                  <div className="my-3">
                    <h4 className="text-sm font-extrabold text-[#121318] truncate">
                      {k.employee_name || k.employee_username}
                    </h4>
                    <p className="text-[11px] font-medium text-[#8E929F]">
                      @{k.employee_username}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-stone-200/60 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-[#8E929F]">
                      Overall
                    </span>
                    <span className="text-base font-extrabold text-amber-600 tabular-nums flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      {Number(k.overall_score || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 5-Axis Org Competency Benchmark */}
          <div className="lg:col-span-5 hris-glass-panel p-6 rounded-[28px] flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#F25730] flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  5-Axis Competency Benchmark
                </span>
                <h3 className="text-base font-extrabold text-[#121318] mt-0.5">
                  Workforce Skill Distribution
                </h3>
              </div>
              <span className="text-xs font-extrabold text-[#121318] bg-white/80 px-3 py-1 rounded-full border border-white tabular-nums">
                {filteredKpis.length} Reviews
              </span>
            </div>

            <div className="space-y-3">
              {axisAverages.map((ax) => {
                const pct = Math.min(100, Math.round((ax.avg / 5) * 100));
                return (
                  <div key={ax.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#32353E]">
                        {ax.label}
                      </span>
                      <span className="font-extrabold text-[#121318] tabular-nums">
                        {ax.avg.toFixed(1)} / 5.0
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/80 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#FF7852] to-amber-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* HORIZONTAL 5-AXIS SCORECARD MATRIX */}
        <div className="hris-glass-panel p-5 rounded-[28px] space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8E929F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search appraisal scorecards by employee..."
                className="w-full h-10 pl-10 pr-4 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#121318] outline-none"
              />
            </div>

            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="h-10 px-4 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#32353E] outline-none cursor-pointer"
            >
              <option value="ALL">All Evaluation Periods ({kpis.length})</option>
              {uniquePeriods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {filteredKpis.map((k) => {
              const axes = [
                { label: "Communication", val: Number(k.score_communication || 0) },
                { label: "Productivity", val: Number(k.score_productivity || 0) },
                { label: "Reliability", val: Number(k.score_reliability || 0) },
                { label: "Leadership", val: Number(k.score_leadership || 0) },
                { label: "Technical", val: Number(k.score_technical || 0) },
              ];
              return (
                <div
                  key={k.id}
                  className="p-5 rounded-[24px] bg-white/85 border border-white shadow-2xs flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5"
                >
                  {/* Employee & Period */}
                  <div className="flex items-center gap-3.5 min-w-[220px]">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/70 text-amber-700 font-extrabold text-sm flex items-center justify-center uppercase shrink-0">
                      {String(k.employee_name || k.employee_username || "U").slice(
                        0,
                        2,
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#F25730]">
                        {k.period_name}
                      </span>
                      <h4 className="text-base font-extrabold text-[#121318]">
                        {k.employee_name || k.employee_username}
                      </h4>
                      <p className="text-xs font-medium text-[#8E929F]">
                        @{k.employee_username} · By{" "}
                        {k.evaluator_name || k.evaluator_username}
                      </p>
                    </div>
                  </div>

                  {/* 5-Axis Horizontal Bars */}
                  <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {axes.map((dim) => (
                      <div
                        key={dim.label}
                        className="p-2.5 rounded-2xl bg-stone-50/90 border border-stone-200/60 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-[#646876] truncate">
                            {dim.label}
                          </span>
                          <span className="text-[#121318] font-extrabold tabular-nums">
                            {dim.val}/5
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-stone-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${(dim.val / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Overall Score & Feedback */}
                  <div className="flex items-center justify-between xl:justify-end gap-4 w-full xl:w-auto shrink-0 pt-3 xl:pt-0 border-t xl:border-t-0 border-stone-200/50">
                    {k.evaluation_notes && (
                      <p className="text-xs text-[#646876] italic max-w-[220px] line-clamp-2">
                        “{k.evaluation_notes}”
                      </p>
                    )}
                    <div className="px-4 py-2 rounded-2xl bg-amber-50 text-amber-800 border border-amber-200 font-extrabold text-base tabular-nums flex items-center gap-1.5 shrink-0">
                      <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                      <span>{Number(k.overall_score || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Submit 360° Employee KPI Appraisal"
          description="Scores >= 4.0 automatically qualify for KPI Performance Bonus in Payroll Requisition."
          maxWidth="4xl"
          uiTheme="hris"
          footer={
            <div className="flex flex-wrap justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="hris-kpi-form"
                variant="primary"
                isLoading={isSaving}
              >
                Save KPI Appraisal
              </Button>
            </div>
          }
        >
          <form
            id="hris-kpi-form"
            onSubmit={handleSubmitKpi}
            className="space-y-4 text-left font-bold"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Employee"
                required
                value={empUsername}
                onChange={(e) => setEmpUsername(e.target.value)}
              >
                {(users || []).map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.name || u.username} (@{u.username})
                  </option>
                ))}
              </Select>

              <Input
                type="text"
                label="Evaluation Period"
                required
                value={periodName}
                onChange={(e) => setPeriodName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: "Communication", val: comm, set: setComm },
                { label: "Productivity", val: prod, set: setProd },
                { label: "Reliability", val: rel, set: setRel },
                { label: "Leadership", val: lead, set: setLead },
                { label: "Technical", val: tech, set: setTech },
              ].map((d) => (
                <Input
                  key={d.label}
                  type="number"
                  label={d.label}
                  min="1"
                  max="5"
                  step="0.5"
                  value={d.val}
                  onChange={(e) => d.set(Number(e.target.value))}
                  className="font-mono"
                />
              ))}
            </div>

            <Textarea
              label="Evaluator Feedback & Notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document key achievements or areas for improvement..."
            />

          </form>
        </Modal>
      </div>
    );
  },
);
