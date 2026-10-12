import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";

interface AdjustmentConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projects?: { id: string; name: string }[];
}

export function AdjustmentConsoleModal({ isOpen, onClose, onSuccess, projects = [] }: AdjustmentConsoleModalProps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const isId = language === "id";

  const [adjType, setAdjType] = useState<string>("PRIORITY_INSERT");
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [severity, setSeverity] = useState("HIGH");
  const [adjustmentDetails, setAdjustmentDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitAdjustment = async (approveDirectly = false) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch("/api/adjustments", {
        method: "POST",
        body: JSON.stringify({
          type: adjType,
          project_id: projectId || undefined,
          severity,
          impact_details: {
            notes: adjustmentDetails.trim(),
            triggered_by: user?.name || user?.username,
          },
        }),
      }, user?.username);

      if (res.ok && res.data?.adjustmentId) {
        if (approveDirectly) {
          const appRes = await apiFetch(`/api/adjustments/${res.data.adjustmentId}/approve`, {
            method: "POST",
          }, user?.username);

          if (appRes.ok) {
            showToast(
              isId
                ? `Adjustment disetujui! Baseline Schedule diperbarui ke versi v${appRes.data.newVersion}.`
                : `Adjustment approved! Baseline Schedule updated to v${appRes.data.newVersion}.`,
              "success"
            );
          }
        } else {
          showToast(
            isId ? "Sesi penyesuaian (Adjustment) disimpan sebagai Draft." : "Adjustment saved as Draft.",
            "success"
          );
        }
        onSuccess();
        onClose();
      } else {
        showToast(res.error || "Gagal membuat adjustment", "error");
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
          <span className="font-black text-stone-900 text-sm uppercase tracking-wide">
            {isId ? "Konsol Adjustment & Re-Baselining Produksi (FR-4)" : "Production Adjustment & Re-Baselining Console"}
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-stone-600 leading-relaxed">
          {isId
            ? "Mekanisme resmi untuk memproses penyisipan proyek prioritas tinggi, dampak NDP, atau delay material. Menyetujui adjustment akan menerbitkan Schedule Baseline revisi (v2, v3...) dan menghitung ulang seluruh deviasi secara transparan."
            : "Formal mechanism for high-priority insertions, NDP ripples, and material delays. Approval generates a revised schedule baseline with updated variances."}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-stone-700 block mb-1">
              {isId ? "Tipe Adjustment *" : "Adjustment Type *"}
            </label>
            <select
              value={adjType}
              onChange={(e) => setAdjType(e.target.value)}
              className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none"
            >
              <option value="PRIORITY_INSERT">Penyisipan Proyek Prioritas Tinggi</option>
              <option value="NDP">Dampak Gangguan Mesin (NDP)</option>
              <option value="LINE_STOP">Interupsi Line Stop</option>
              <option value="MATERIAL_DELAY">Keterlambatan Wave Material</option>
              <option value="SCOPE_CHANGE">Perubahan Scope / Revisi BOP</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-stone-700 block mb-1">
              {isId ? "Tingkat Keparahan (Severity)" : "Severity"}
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none"
            >
              <option value="LOW">Low (Deviasi &le; 1 Hari)</option>
              <option value="MEDIUM">Medium (Deviasi 2-3 Hari)</option>
              <option value="HIGH">High (Kritis terhadap Deadline)</option>
              <option value="CRITICAL">Critical (Stop Line Total)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-stone-700 block mb-1">
            {isId ? "Proyek Terkait (Opsional)" : "Related Project (Optional)"}
          </label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none"
          >
            <option value="">-- Seluruh Lini / Multi-Proyek --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-stone-700 block mb-1">
            {isId ? "Justifikasi & Catatan Penyesuaian *" : "Justification & Notes *"}
          </label>
          <textarea
            rows={3}
            value={adjustmentDetails}
            onChange={(e) => setAdjustmentDetails(e.target.value)}
            placeholder={isId ? "Jelaskan alasan penyisipan atau mitigasi yang diterapkan..." : "Explain reason for insertion or countermeasures..."}
            className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl outline-none"
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-stone-100">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="rounded-xl text-xs font-bold border-stone-200"
          >
            {isId ? "Batal" : "Cancel"}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmitAdjustment(false)}
              variant="secondary"
              className="bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold px-4 py-2"
            >
              Simpan Draft
            </Button>

            <Button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmitAdjustment(true)}
              variant="primary"
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black px-5 py-2 shadow-xs transition-colors"
            >
              {isSubmitting ? (isId ? "Memproses..." : "Processing...") : (isId ? "Approve & Re-Baseline" : "Approve & Re-Baseline")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
