import React, { useState, useEffect } from "react";
import { Sliders, Check, Loader2, Save } from "lucide-react";
import { ICPConfig } from "@/types/scout";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";

interface ScoutICPModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
}

export function ScoutICPModal({ isOpen, onClose, onSaveSuccess }: ScoutICPModalProps) {
  const { user } = useAuth();
  const [icp, setIcp] = useState<ICPConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      apiFetch("/api/sales/scout/icp", {}, user?.username)
        .then((res) => {
          if (res.ok && res.data?.success && res.data?.data) {
            setIcp(res.data.data);
          }
        })
        .catch((err) => console.error("Failed to load ICP config:", err))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, user?.username]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!icp || isSaving) return;

    setIsSaving(true);
    try {
      const res = await apiFetch(
        "/api/sales/scout/icp",
        {
          method: "PATCH",
          body: JSON.stringify({
            icp_config: {
              target_industries: icp.target_industries || [],
              target_buyer_personas: icp.target_buyer_personas || [],
              priority_products: icp.priority_products || [],
              scoring_weights: icp.scoring_weights || {},
              company_name: icp.company_name || "Enterprise Commerce & Operations",
            },
          }),
        },
        user?.username
      );
      if (res.ok && res.data?.success) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2000);
        if (onSaveSuccess) onSaveSuccess();
      }
    } catch (err) {
      console.error("Failed to update ICP config:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700">
            <Sliders className="w-4 h-4 text-stone-700" />
          </div>
          <div>
            <div className="text-sm sm:text-base font-bold text-stone-900 tracking-tight leading-none">
              Ideal Customer Profile (ICP) Configuration
            </div>
            <span className="text-[11px] text-stone-500 font-normal mt-1 inline-block">
              Reference benchmark for qualification matching and scoring
            </span>
          </div>
        </div>
      }
    >
      {isLoading ? (
        <div className="p-12 text-center text-stone-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-stone-500" />
          <span className="text-xs">Loading ICP configuration...</span>
        </div>
      ) : !icp ? (
        <div className="p-8 text-center text-stone-500 text-xs">
          Could not load ICP configuration. Please check your connection.
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Target Industries"
            value={icp.target_industries?.join(", ") || ""}
            onChange={(e) =>
              setIcp({
                ...icp,
                target_industries: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder="e.g. General Contractors, Property Developers, Commercial Facilities..."
            helperText="Separate industry names with commas"
          />

          <Input
            label="Target Buyer Personas & Decision Makers"
            value={icp.target_buyer_personas?.join(", ") || ""}
            onChange={(e) =>
              setIcp({
                ...icp,
                target_buyer_personas: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder="e.g. Project Manager, Procurement Lead, Operations Director..."
          />

          <Input
            label="Priority Product Categories"
            value={icp.priority_products?.join(", ") || ""}
            onChange={(e) =>
              setIcp({
                ...icp,
                priority_products: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder="e.g. Heavy Duty Paving, Interlocking Pavers, Kerb Stones..."
          />

          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2 text-xs">
            <span className="font-semibold text-stone-700 block">Scoring Weight Benchmark:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-stone-600 text-[11px]">
              <div className="flex justify-between">
                <span>Behavioral Intent:</span>
                <span className="font-mono tabular-nums font-semibold">35%</span>
              </div>
              <div className="flex justify-between">
                <span>Profile Fit / ICP:</span>
                <span className="font-mono tabular-nums font-semibold">30%</span>
              </div>
              <div className="flex justify-between">
                <span>Engagement Track:</span>
                <span className="font-mono tabular-nums font-semibold">20%</span>
              </div>
              <div className="flex justify-between">
                <span>Freshness:</span>
                <span className="font-mono tabular-nums font-semibold">15%</span>
              </div>
            </div>
          </div>

          <div className="pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100">
            {savedSuccess ? (
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Configuration saved
              </span>
            ) : (
              <span className="text-[11px] text-stone-400">
                Applied to subsequent lead evaluations
              </span>
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSaving}
                leftIcon={<Save className="w-3.5 h-3.5" />}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

