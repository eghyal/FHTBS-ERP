import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";

interface StopLineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  stations?: { id: string; name: string }[];
}

export function StopLineModal({ isOpen, onClose, onSuccess, stations = [] }: StopLineModalProps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const isId = language === "id";

  const [stationId, setStationId] = useState(stations[0]?.id || "ST-01");
  const [scope, setScope] = useState<"STATION" | "LINE" | "FACTORY">("STATION");
  const [reasonCode, setReasonCode] = useState("MACHINE_BREAKDOWN");
  const [reasonText, setReasonText] = useState("");
  const [estResumeHours, setEstResumeHours] = useState(4);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await apiFetch("/api/production/stop-line", {
        method: "POST",
        body: JSON.stringify({
          station_id: stationId,
          scope,
          reason_code: reasonCode,
          reason_text: reasonText.trim() || undefined,
          est_resume_hours: Number(estResumeHours) || 4,
        }),
      }, user?.username);

      if (res.ok) {
        showToast(
          isId
            ? `STOP LINE dideklarasikan pada stasiun ${stationId}. WOT terkait telah diatur ON_HOLD.`
            : `STOP LINE declared at ${stationId}. Interrupted WOTs set to ON_HOLD.`,
          "success"
        );
        onSuccess();
        onClose();
      } else {
        showToast(res.error || "Gagal mendeklarasikan Stop Line", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Terjadi kesalahan sistem", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
          <span className="font-black text-stone-900 text-sm uppercase tracking-wide">
            {isId ? "Deklarasikan Stop Line (Interupsi Produksi)" : "Declare Stop Line (Line Interruption)"}
          </span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-stone-600 leading-relaxed">
          {isId
            ? "Mendeklarasikan Stop Line akan menghentikan waktu produktif stasiun, menandai seluruh WOT terkait sebagai ON_HOLD, dan mencatat akumulasi lost manhours ke audit trail."
            : "Declaring a Stop Line pauses productive station hours, flags related WOTs as ON_HOLD, and logs accumulated lost manhours."}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-stone-700 block mb-1">
              {isId ? "Stasiun Terdampak *" : "Target Station *"}
            </label>
            <input
              type="text"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              placeholder="e.g. ST-01 / Cutting"
              required
              className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-stone-700 block mb-1">
              {isId ? "Cakupan (Scope) *" : "Scope *"}
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as any)}
              className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none"
            >
              <option value="STATION">{isId ? "Stasiun Tertentu" : "Single Station"}</option>
              <option value="LINE">{isId ? "Seluruh Lini (Line)" : "Entire Line"}</option>
              <option value="FACTORY">{isId ? "Pabrik Penuh (Factory)" : "Entire Factory"}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-stone-700 block mb-1">
              {isId ? "Kode Alasan Gangguan *" : "Interruption Reason *"}
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none"
            >
              <option value="MACHINE_BREAKDOWN">Kerusakan Mesin / Breakdown</option>
              <option value="POWER_OUTAGE">Pemadaman Listrik / Daya</option>
              <option value="MATERIAL_SHORTAGE">Material Habis / Shortage</option>
              <option value="QC_HOLD">Pemeriksaan Kualitas (QC Hold)</option>
              <option value="SAFETY_INCIDENT">Insiden K3 / Safety Incident</option>
              <option value="MANAGEMENT_DECISION">Keputusan Manajemen</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-stone-700 block mb-1">
              {isId ? "Est. Durasi Downtime (Jam) *" : "Est. Downtime (Hours) *"}
            </label>
            <input
              type="number"
              min="1"
              max="72"
              value={estResumeHours}
              onChange={(e) => setEstResumeHours(Number(e.target.value) || 1)}
              required
              className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-stone-700 block mb-1">
            {isId ? "Uraian & Kronologi Gangguan" : "Interruption Details & Notes"}
          </label>
          <textarea
            rows={3}
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder={isId ? "Ketikkan penyebab dan tindakan darurat yang diambil..." : "Explain cause and emergency countermeasures..."}
            className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="rounded-xl text-xs font-bold border-stone-200"
          >
            {isId ? "Batal" : "Cancel"}
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting}
            variant="primary"
            className="bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-black px-5 py-2.5 shadow-xs"
          >
            {isSubmitting ? (isId ? "Memproses..." : "Declaring...") : (isId ? "Deklarasikan Stop Line" : "Declare Stop Line")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
