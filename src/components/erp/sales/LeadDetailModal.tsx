import React, { useState } from "react";
import {
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  SendHorizontal,
  ThumbsUp,
  Flag,
  FileText,
  Building2,
  Phone,
  Mail,
  Trash2,
} from "lucide-react";
import { PotentialCustomer, PotentialCustomerStatus } from "@/types/scout";
import { formatIDR } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";

interface LeadScoutDetailModalProps {
  customer: PotentialCustomer | null;
  onClose: () => void;
  onScout: (id: string) => void;
  isScouting: boolean;
  onUpdateStatus: (id: string, status: PotentialCustomerStatus) => void;
  onSaveNotes: (id: string, notes: string) => void;
  onSendOutreach: (id: string, note: string) => void;
  onConvertToQuotation: (customer: PotentialCustomer) => void;
  onFeedback: (reportId: string, flag: "HELPFUL" | "WRONG_INFO", note: string) => void;
  onDeleteProfile: (customer: PotentialCustomer) => void;
}

export function LeadScoutDetailModal({
  customer,
  onClose,
  onUpdateStatus,
  onSaveNotes,
  onSendOutreach,
  onConvertToQuotation,
  onFeedback,
  onDeleteProfile,
}: LeadScoutDetailModalProps) {
  if (!customer) return null;

  const [activeTab, setActiveTab] = useState<"INTELLIGENCE" | "CART_ACTIVITY" | "OUTREACH">("INTELLIGENCE");
  const [copiedPointIndex, setCopiedPointIndex] = useState<number | null>(null);
  const [salesNoteInput, setSalesNoteInput] = useState(customer.sales_notes || "");
  const [outreachInput, setOutreachInput] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  const handleCopyTalkingPoint = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedPointIndex(idx);
    setTimeout(() => setCopiedPointIndex(null), 1500);
  };

  const handleOutreachSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!outreachInput.trim()) return;
    onSendOutreach(customer.id, outreachInput.trim());
    setOutreachInput("");
  };

  const dimensions = customer.lead_score_breakdown?.dimensions || {
    behavioral_intent: 60,
    profile_fit: 50,
    engagement: 40,
    freshness: 70,
  };

  return (
    <Modal
      isOpen={!!customer}
      onClose={onClose}
      maxWidth="5xl"
      title={
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-700 text-sm shrink-0">
            {customer.avatar_url ? (
              <img
                src={customer.avatar_url}
                alt={customer.customer_name}
                className="w-full h-full rounded-xl object-cover"
              />
            ) : (
              customer.customer_name.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-stone-900 truncate">
                {customer.customer_name}
              </span>
              {customer.lead_grade && (
                <Badge
                  variant={
                    customer.lead_grade === "A"
                      ? "warning"
                      : customer.lead_grade === "B"
                        ? "default"
                        : "outline"
                  }
                >
                  Grade {customer.lead_grade}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 font-normal mt-0.5">
              {customer.company && (
                <span className="flex items-center gap-1 font-medium text-stone-700">
                  <Building2 className="w-3 h-3 text-stone-400" />
                  {customer.company}
                </span>
              )}
              {customer.phone && (
                <span className="flex items-center gap-1 text-stone-500 font-mono tabular-nums">
                  <Phone className="w-3 h-3 text-stone-400" />
                  {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="flex items-center gap-1 text-stone-500 truncate">
                  <Mail className="w-3 h-3 text-stone-400" />
                  {customer.email}
                </span>
              )}
            </div>
          </div>
        </div>
      }
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="danger_soft"
              size="sm"
              onClick={() => onDeleteProfile(customer)}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete Profile
            </Button>
            <span className="hidden sm:inline text-xs text-stone-400 font-mono tabular-nums">
              Registered: {new Date(customer.created_at).toLocaleDateString("en-US")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => onConvertToQuotation(customer)}
              leftIcon={<FileText className="w-3.5 h-3.5" />}
            >
              Convert to Quotation
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Tab Navigation */}
        <div className="flex border-b border-stone-200 gap-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("INTELLIGENCE")}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "INTELLIGENCE"
                ? "border-stone-900 text-stone-900"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            Intelligence Report
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("CART_ACTIVITY")}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "CART_ACTIVITY"
                ? "border-stone-900 text-stone-900"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            Cart & Activity ({customer.cart_snapshot?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("OUTREACH")}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "OUTREACH"
                ? "border-stone-900 text-stone-900"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            Follow-Up & Notes
          </button>
        </div>

        {activeTab === "INTELLIGENCE" && (
          <div className="space-y-5">
            {/* Score & Dimensions Card */}
            <div className="bg-stone-50 rounded-xl border border-stone-200 p-4 sm:p-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div className="md:border-r border-stone-200 md:pr-4">
                  <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
                    Potential Score
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-stone-900">
                      {customer.potential_score || 0}
                    </span>
                    <span className="text-xs font-semibold text-stone-400 font-mono tabular-nums">/ 100</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    {customer.profiling_consent ? (
                      <Badge variant="success" icon={<ShieldCheck className="w-3 h-3" />}>
                        Consent Verified
                      </Badge>
                    ) : (
                      <Badge variant="default" icon={<ShieldAlert className="w-3 h-3 text-stone-400" />}>
                        First-Party Data Only
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-stone-600 mb-1">
                      <span>Behavioral Intent (35%)</span>
                      <span className="font-mono tabular-nums font-semibold">{dimensions.behavioral_intent}%</span>
                    </div>
                    <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-stone-900 h-full rounded-full transition-all"
                        style={{ width: `${dimensions.behavioral_intent}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-stone-600 mb-1">
                      <span>Profile Fit / ICP (30%)</span>
                      <span className="font-mono tabular-nums font-semibold">{dimensions.profile_fit}%</span>
                    </div>
                    <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-600 h-full rounded-full transition-all"
                        style={{ width: `${dimensions.profile_fit}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-stone-600 mb-1">
                      <span>Engagement Track (20%)</span>
                      <span className="font-mono tabular-nums font-semibold">{dimensions.engagement}%</span>
                    </div>
                    <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-600 h-full rounded-full transition-all"
                        style={{ width: `${dimensions.engagement}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-stone-600 mb-1">
                      <span>Freshness (15%)</span>
                      <span className="font-mono tabular-nums font-semibold">{dimensions.freshness}%</span>
                    </div>
                    <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all"
                        style={{ width: `${dimensions.freshness}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Executive Summary */}
            <div className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-2">
                Executive Summary
              </span>
              <p className="text-xs sm:text-sm text-stone-800 leading-relaxed">
                {customer.scout_summary ||
                  "No analysis generated yet. Run Scout Analysis to profile this lead based on corporate data and catalog activity."}
              </p>

              {customer.scout_recommendations && (
                <div className="mt-3.5 p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs text-stone-700">
                  <span className="font-semibold block mb-1 text-stone-900">Recommended Sales Approach:</span>
                  <p className="leading-relaxed">{customer.scout_recommendations}</p>
                </div>
              )}
            </div>

            {/* Key Talking Points */}
            {customer.key_talking_points && customer.key_talking_points.length > 0 && (
              <div className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 shadow-2xs">
                <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-3">
                  Key Negotiation Talking Points
                </span>
                <div className="space-y-2">
                  {customer.key_talking_points.map((tp, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-stone-50 rounded-lg border border-stone-200/80 flex items-start justify-between gap-3 text-xs"
                    >
                      <span className="text-stone-800 leading-relaxed font-medium">
                        · {tp}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyTalkingPoint(tp, idx)}
                        className="p-1 text-stone-400 hover:text-stone-700 rounded transition-colors shrink-0 cursor-pointer"
                        title="Copy to clipboard"
                      >
                        {copiedPointIndex === idx ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verified Sources */}
            {customer.sources_json && customer.sources_json.length > 0 && (
              <div className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 shadow-2xs">
                <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-3">
                  Verified Public Sources
                </span>
                <div className="space-y-2 text-xs">
                  {customer.sources_json.map((src, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-stone-50 rounded-lg border border-stone-200 flex items-start justify-between gap-3"
                    >
                      <div>
                        <span className="font-semibold text-stone-900 block">{src.title}</span>
                        <span className="text-stone-500 text-[11px] block mt-0.5">{src.claim}</span>
                      </div>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-amber-700 hover:bg-amber-50 rounded transition-colors shrink-0"
                        title="Open public reference"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feedback Loop */}
            <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
              <span>Was this intelligence assessment accurate?</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    onFeedback(customer.id, "HELPFUL", "Accurate information");
                    setFeedbackSent(true);
                  }}
                  disabled={feedbackSent}
                  leftIcon={<ThumbsUp className="w-3 h-3 text-emerald-600" />}
                >
                  Accurate
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    onFeedback(customer.id, "WRONG_INFO", "Information needs correction");
                    setFeedbackSent(true);
                  }}
                  disabled={feedbackSent}
                  leftIcon={<Flag className="w-3 h-3 text-rose-600" />}
                >
                  Correction Needed
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "CART_ACTIVITY" && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                  Cart Snapshot ({customer.cart_snapshot?.length || 0} Items)
                </span>
                <span className="font-mono tabular-nums font-semibold text-stone-900 text-sm">
                  Total: {formatIDR(customer.cart_total_value)}
                </span>
              </div>

              <div className="divide-y divide-stone-100">
                {!customer.cart_snapshot || customer.cart_snapshot.length === 0 ? (
                  <p className="text-xs text-stone-400 py-4 text-center">
                    No active items recorded in shopping cart.
                  </p>
                ) : (
                  customer.cart_snapshot.map((item, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-stone-900 block">{item.name}</span>
                        <span className="text-[11px] text-stone-500 font-mono tabular-nums">
                          {item.item_code} · {item.qty} {item.uom} x {formatIDR(item.price)}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-stone-900">
                        {formatIDR(item.total)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-3">
                Recorded Web Activities (Catalog, Shop, Careers)
              </span>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {!customer.activities || customer.activities.length === 0 ? (
                  <p className="text-xs text-stone-400 py-3 text-center">
                    No web session activity recorded for this customer.
                  </p>
                ) : (
                  customer.activities.map((act) => (
                    <div
                      key={act.id}
                      className="p-2.5 bg-stone-50 rounded-lg border border-stone-100 flex items-start justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-stone-800 block">{act.title}</span>
                        <div className="flex items-center gap-2 text-[10px] text-stone-400 mt-0.5">
                          <span className="font-semibold uppercase text-amber-700">{act.module}</span>
                          <span>·</span>
                          <span className="font-mono tabular-nums">{new Date(act.created_at).toLocaleString("en-US")}</span>
                        </div>
                      </div>
                      {act.page_url && (
                        <span className="font-mono text-[10px] text-stone-400 truncate max-w-[140px]">
                          {act.page_url}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "OUTREACH" && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-2">
                Pipeline Status
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {(["NEW_INTENT", "SCOUTED", "CONTACTED", "CONVERTED", "DROPPED"] as PotentialCustomerStatus[]).map(
                  (st) => (
                    <Button
                      key={st}
                      type="button"
                      size="xs"
                      variant={customer.status === st ? "primary" : "secondary"}
                      onClick={() => onUpdateStatus(customer.id, st)}
                    >
                      {st === "NEW_INTENT"
                        ? "New Intent"
                        : st === "SCOUTED"
                          ? "Profiled"
                          : st === "CONTACTED"
                            ? "Contacted"
                            : st === "CONVERTED"
                              ? "Converted"
                              : "Dropped"}
                    </Button>
                  )
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 shadow-2xs space-y-3">
              <Textarea
                label="Internal Sales Notes"
                rows={3}
                value={salesNoteInput}
                onChange={(e) => setSalesNoteInput(e.target.value)}
                placeholder="Record project specifications, budgetary considerations, or meeting summaries..."
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => onSaveNotes(customer.id, salesNoteInput)}
              >
                Save Sales Notes
              </Button>
            </div>

            <div className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 shadow-2xs space-y-3">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
                Log Outreach Activity
              </span>
              <form onSubmit={handleOutreachSubmit} className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="text"
                    value={outreachInput}
                    onChange={(e) => setOutreachInput(e.target.value)}
                    placeholder="e.g. Sent introductory quotation and catalog via WhatsApp..."
                  />
                </div>
                <Button
                  type="submit"
                  variant="success"
                  size="sm"
                  leftIcon={<SendHorizontal className="w-3.5 h-3.5" />}
                >
                  Log
                </Button>
              </form>

              <div className="space-y-2 mt-3 max-h-40 overflow-y-auto pr-1">
                {customer.outreach?.map((out) => (
                  <div
                    key={out.id}
                    className="p-2.5 bg-stone-50 rounded-lg border border-stone-100 flex items-start justify-between text-xs"
                  >
                    <div>
                      <span className="text-stone-800 font-medium block">{out.custom_note}</span>
                      <span className="text-[10px] text-stone-400">
                        {out.channel} · By {out.sent_by} · {new Date(out.sent_at).toLocaleString("en-US")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

