import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface WhatIfSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function WhatIfSimulatorModal({ isOpen, onClose, onSuccess }: WhatIfSimulatorModalProps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const isId = language === "id";

  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [workOnSaturday, setWorkOnSaturday] = useState(false);
  const [extraShiftCount, setExtraShiftCount] = useState(0);

  const [isSimulating, setIsSimulating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any | null>(null);

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await apiFetch("/api/schedule/simulate", {
        method: "POST",
        body: JSON.stringify({
          hours_per_day: Number(hoursPerDay),
          work_on_saturday: Boolean(workOnSaturday),
          extra_shift_count: Number(extraShiftCount),
        }),
      }, user?.username);

      if (res.ok && res.data) {
        setSimulationResult(res.data);
        showToast(isId ? "Simulasi selesai dihitung." : "Simulation completed.", "info");
      } else {
        showToast(res.error || "Gagal menjalankan simulasi", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Kesalahan simulasi", "error");
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCommitBaseline = async () => {
    if (!simulationResult) return;
    setIsCommitting(true);
    try {
      const res = await apiFetch("/api/schedule/baseline", {
        method: "POST",
        body: JSON.stringify({
          snapshot_json: simulationResult,
          confidence_score: simulationResult.overallConfidenceScore || 85,
        }),
      }, user?.username);

      if (res.ok) {
        showToast(
          isId
            ? "Skenario berhasil disahkan menjadi Baseline Schedule v1 resmi!"
            : "Scenario successfully locked as official Baseline Schedule v1!",
          "success"
        );
        onSuccess();
        onClose();
      } else {
        showToast(res.error || "Gagal mengesahkan baseline", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Gagal commit baseline", "error");
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="4xl"
      title={
        <div className="flex items-center gap-2">
          <span className="font-black text-stone-900 text-sm uppercase tracking-wide">
            {isId ? "Work Calendar & Shift Simulator (What-If Engine v2)" : "Work Calendar & Shift Simulator (What-If Engine v2)"}
          </span>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Simulator Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-stone-50 border border-stone-200 rounded-xl">
          <div>
            <label className="text-[10px] font-bold text-stone-700 block mb-1">
              {isId ? "Jam Kerja / Hari (Effective Hours)" : "Work Hours / Day"}
            </label>
            <select
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(Number(e.target.value))}
              className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-bold outline-none"
            >
              <option value={8}>8 Jam / Hari (Shift Normal)</option>
              <option value={9}>9 Jam / Hari (+1 Jam Lembur)</option>
              <option value={10}>10 Jam / Hari (+2 Jam Lembur)</option>
              <option value={12}>12 Jam / Hari (Shift Intensif)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-stone-700 block mb-1">
              {isId ? "Operasional Hari Sabtu" : "Saturday Operational"}
            </label>
            <select
              value={workOnSaturday ? "YES" : "NO"}
              onChange={(e) => setWorkOnSaturday(e.target.value === "YES")}
              className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-bold outline-none"
            >
              <option value="NO">{isId ? "Sabtu Libur (5 Hari Kerja)" : "Off (5 Working Days)"}</option>
              <option value="YES">{isId ? "Sabtu Masuk (+1 Hari Kerja/Mg)" : "Work (+1 Day/Wk)"}</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-stone-700 block mb-1">
              {isId ? "Shift Tambahan (Extra Shift)" : "Extra Shift Count"}
            </label>
            <select
              value={extraShiftCount}
              onChange={(e) => setExtraShiftCount(Number(e.target.value))}
              className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-bold outline-none"
            >
              <option value={0}>0 Shift (Single Shift)</option>
              <option value={1}>+1 Shift Malam</option>
              <option value={2}>+2 Shift Penuh (24 Jam)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleRunSimulation}
            disabled={isSimulating}
            variant="primary"
            className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold px-4 py-2 shadow-xs transition-colors"
          >
            {isSimulating ? (isId ? "Menghitung Skenario..." : "Simulating...") : (isId ? "Hitung Ulang Skenario" : "Run What-If Simulation")}
          </Button>
        </div>

        {/* Results Stream */}
        {simulationResult && (
          <div className="space-y-4 pt-2 border-t border-stone-100">
            {/* KPI Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                <span className="text-[10px] font-bold text-stone-400 uppercase block">Schedule Confidence</span>
                <span className="text-xl font-black text-stone-900 font-mono">
                  {simulationResult.overallConfidenceScore}%
                </span>
              </div>

              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                <span className="text-[10px] font-bold text-stone-400 uppercase block">Total Contention Delay</span>
                <span className="text-xl font-black text-stone-900 font-mono">
                  {simulationResult.totalContentionDelayHours} Jam
                </span>
              </div>

              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                <span className="text-[10px] font-bold text-stone-400 uppercase block">Proyek On-Track</span>
                <span className="text-xl font-black text-emerald-600 font-mono">
                  {simulationResult.projects?.filter((p: any) => p.riskLevel === "ON_TRACK").length} / {simulationResult.projects?.length}
                </span>
              </div>
            </div>

            {/* Project Comparison Table */}
            <div className="overflow-x-auto border border-stone-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 font-bold uppercase text-[10px] text-stone-500">
                    <th className="p-2.5 pl-4">Proyek / SPK</th>
                    <th className="p-2.5">Target Deadline</th>
                    <th className="p-2.5">Simulasi Selesai (ETC)</th>
                    <th className="p-2.5 text-center">Deviasi Hari</th>
                    <th className="p-2.5 text-center">Status Risiko</th>
                    <th className="p-2.5 pr-4">Rekomendasi Pemulihan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {simulationResult.projects?.map((p: any) => (
                    <tr key={p.projectId} className="hover:bg-stone-50/50">
                      <td className="p-2.5 pl-4 font-bold text-stone-900">
                        {p.projectName}
                        <span className="block text-[10px] text-stone-400 font-mono">{p.spkNumber}</span>
                      </td>

                      <td className="p-2.5 font-mono text-stone-600">{p.targetDueDate}</td>

                      <td className="p-2.5 font-mono font-bold text-stone-900">
                        {new Date(p.estimatedCompletionDate).toLocaleDateString("id-ID")}
                      </td>

                      <td className="p-2.5 text-center font-mono font-bold">
                        <span className={cn(p.varianceDaysVsDeadline >= 0 ? "text-emerald-600" : "text-rose-600")}>
                          {p.varianceDaysVsDeadline >= 0 ? `+${p.varianceDaysVsDeadline}` : p.varianceDaysVsDeadline} Hari
                        </span>
                      </td>

                      <td className="p-2.5 text-center">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[9px] font-black uppercase border",
                            p.riskLevel === "ON_TRACK"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : p.riskLevel === "AT_RISK"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          )}
                        >
                          {p.riskLevel}
                        </span>
                      </td>

                      <td className="p-2.5 pr-4 text-[11px] text-stone-600">
                        {p.recommendedMitigations?.[0] || "Pertahankan laju proses saat ini."}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Commit Button */}
            <div className="flex items-center justify-between pt-3 border-t border-stone-200">
              <span className="text-[11px] text-stone-500 italic">
                {isId ? "*Skenario di atas murni simulasi dan tidak mengubah jadwal operasional sampai disahkan." : "*Simulations are stateless until locked as baseline."}
              </span>

              <Button
                onClick={handleCommitBaseline}
                disabled={isCommitting}
                variant="primary"
                className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black px-5 py-2.5 shadow-xs"
              >
                {isCommitting ? (isId ? "Mengesahkan..." : "Locking...") : (isId ? "Sahkan Sebagai Baseline Schedule v1" : "Lock as Official Baseline v1")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
