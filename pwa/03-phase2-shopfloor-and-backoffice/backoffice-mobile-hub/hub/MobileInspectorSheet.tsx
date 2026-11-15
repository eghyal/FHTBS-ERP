import React from "react";
import {
  Check,
  Eye,
  EyeOff,
  Key,
  Mail,
  MessageSquare,
  Monitor,
  Phone,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getDailyAuthKey } from "@/utils/auth";
import { formatIDR } from "@/lib/utils";
import type { InspectorItemType } from "../monitorTypes";

interface MobileInspectorSheetProps {
  selectedItem: {
    type: InspectorItemType;
    data: any;
  } | null;
  setSelectedItem: (item: { type: InspectorItemType; data: any } | null) => void;
  user: any;
  isManager: boolean;
  enteredPin: string;
  setEnteredPin: (pin: string) => void;
  showPinHint: boolean;
  setShowPinHint: React.Dispatch<React.SetStateAction<boolean>>;
  isActionSubmitting: boolean;
  revisionNote: string;
  setRevisionNote: (note: string) => void;
  showRevisionInput: boolean;
  setShowRevisionInput: (show: boolean) => void;
  handleAuthorizePR: (pr: any) => void;
  handleRevisePR: (pr: any) => void;
  handleAuthorizePO: (po: any) => void;
  handleRevisePO: (po: any) => void;
  handleAuthorizeQuotation: (quo: any) => void;
  handleReviseQuotation: (quo: any) => void;
  handleAuthorizeDelivery: (dn: any) => void;
  handleReviseDelivery: (dn: any) => void;
  openDesktopNotice: (title: string, desc: string) => void;
  navigate: (path: string) => void;
}

export const MobileInspectorSheet: React.FC<MobileInspectorSheetProps> = React.memo(({
  selectedItem,
  setSelectedItem,
  user,
  isManager,
  enteredPin,
  setEnteredPin,
  showPinHint,
  setShowPinHint,
  isActionSubmitting,
  revisionNote,
  setRevisionNote,
  showRevisionInput,
  setShowRevisionInput,
  handleAuthorizePR,
  handleRevisePR,
  handleAuthorizePO,
  handleRevisePO,
  handleAuthorizeQuotation,
  handleReviseQuotation,
  handleAuthorizeDelivery,
  handleReviseDelivery,
  openDesktopNotice,
  navigate,
}) => {
  const renderDailyPinVerificationBox = () => {
    if (!user) return null;
    const todayPin = getDailyAuthKey(user.username);
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
            <Key className="w-3.5 h-3.5 text-stone-700" />
            <span>6-Digit Daily Authorization PIN</span>
          </div>
          <button
            type="button"
            onClick={() => setShowPinHint((v) => !v)}
            className="text-[11px] font-bold text-stone-900 hover:text-stone-700 inline-flex items-center gap-1 cursor-pointer"
          >
            {showPinHint ? (
              <>
                <EyeOff className="w-3 h-3" />
                <span>Hide My PIN</span>
              </>
            ) : (
              <>
                <Eye className="w-3 h-3" />
                <span>View Today's PIN</span>
              </>
            )}
          </button>
        </div>

        {showPinHint && (
          <div className="flex items-center justify-between bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs">
            <span className="text-stone-500">Your Personal Daily PIN:</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black tracking-widest text-stone-900">
                {todayPin}
              </span>
              <button
                type="button"
                onClick={() => setEnteredPin(todayPin)}
                className="px-2 py-0.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-[10px] font-bold cursor-pointer"
              >
                Use PIN
              </button>
            </div>
          </div>
        )}

        <div>
          <input
            type="text"
            maxLength={6}
            autoCapitalize="characters"
            value={enteredPin}
            onChange={(e) => setEnteredPin(e.target.value.toUpperCase())}
            placeholder="ENTER 6-CHAR DAILY PIN"
            className="no-base-style w-full min-h-[42px] px-3.5 bg-white border border-stone-300 rounded-xl text-center font-mono text-sm font-black tracking-[0.25em] text-stone-900 placeholder:tracking-normal placeholder:font-sans placeholder:font-medium placeholder:text-stone-400 focus:border-stone-700 outline-none uppercase"
          />
          <p className="text-[10px] text-stone-500 mt-1 text-center">
            6-digit Daily PIN required to authorize.
          </p>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {selectedItem && (
        <div className="fixed inset-0 z-[140] flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs"
            onClick={() => setSelectedItem(null)}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg bg-white rounded-t-3xl shadow-2xl border-t border-stone-200 max-h-[88vh] overflow-y-auto p-5 pb-8 space-y-4"
          >
            {/* Drag Handle */}
            <div className="w-10 h-1.5 bg-stone-300 rounded-full mx-auto -mt-1 mb-2" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">
                  {selectedItem.type} INSPECTOR
                </div>
                <h3 className="text-base font-bold text-stone-900 mt-0.5">
                  {selectedItem.type === "PR"
                    ? selectedItem.data.pr_number ||
                      `Purchase Requisition #${selectedItem.data.id}`
                    : selectedItem.type === "PO"
                      ? selectedItem.data.po_number ||
                        `Purchase Order #${selectedItem.data.id}`
                      : selectedItem.type === "QUOTATION"
                        ? selectedItem.data.quotation_number ||
                          `Quotation #${selectedItem.data.id}`
                        : selectedItem.type === "DELIVERY"
                          ? selectedItem.data.dn_number ||
                            selectedItem.data.delivery_number ||
                            `Delivery Note #${selectedItem.data.id}`
                          : selectedItem.data.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. PURCHASE REQUISITION (PR) DETAILS & PIN APPROVAL */}
            {selectedItem.type === "PR" && (
              <div className="space-y-4">
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Project / NTP</span>
                    <span className="font-bold text-stone-900">
                      {selectedItem.data.project_name ||
                        selectedItem.data.project_id ||
                        "General Operations"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Requested By</span>
                    <span className="font-semibold text-stone-800">
                      {selectedItem.data.requested_by || "Engineering Staff"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Urgency / Category</span>
                    <span className="font-mono font-bold text-stone-800">
                      {selectedItem.data.urgency || "NORMAL"} ·{" "}
                      {selectedItem.data.category || "MATERIAL"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Current Status</span>
                    <span className="font-mono font-bold text-amber-700">
                      {selectedItem.data.status || "DRAFTED"}
                    </span>
                  </div>
                  {selectedItem.data.remarks && (
                    <div className="pt-2 border-t border-stone-200/70">
                      <span className="text-stone-500 block mb-0.5">
                        Remarks / Notes:
                      </span>
                      <span className="text-stone-800 font-medium">
                        {selectedItem.data.remarks}
                      </span>
                    </div>
                  )}
                </div>

                {isManager &&
                  (selectedItem.data.status === "DRAFTED" ||
                    selectedItem.data.status === "PENDING") && (
                    <div className="space-y-3">
                      {renderDailyPinVerificationBox()}

                      {!showRevisionInput ? (
                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            disabled={isActionSubmitting}
                            onClick={() => handleAuthorizePR(selectedItem.data)}
                            className="min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            <span>Approve & Authorize</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRevisionInput(true)}
                            className="min-h-[44px] rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <span>Request Revision</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                          <textarea
                            value={revisionNote}
                            onChange={(e) => setRevisionNote(e.target.value)}
                            placeholder="Enter PR revision instructions..."
                            rows={2}
                            className="no-base-style w-full p-2.5 bg-white border border-stone-200 rounded-xl text-xs text-stone-900 outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={isActionSubmitting}
                              onClick={() => handleRevisePR(selectedItem.data)}
                              className="flex-1 min-h-[40px] rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer"
                            >
                              Submit Revision
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowRevisionInput(false)}
                              className="min-h-[40px] px-3 rounded-xl bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            )}

            {/* 2. PURCHASE ORDER (PO) DETAILS & PIN APPROVAL */}
            {selectedItem.type === "PO" && (
              <div className="space-y-4">
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Supplier / Vendor</span>
                    <span className="font-bold text-stone-900">
                      {selectedItem.data.supplier_name || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Payment Terms</span>
                    <span className="font-semibold text-stone-800">
                      {selectedItem.data.payment_terms || "Net 30 Days"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Current Status</span>
                    <span className="font-mono font-bold text-amber-700">
                      {selectedItem.data.status || "DRAFTED"}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-stone-200/70 flex justify-between items-baseline">
                    <span className="font-semibold text-stone-600">
                      Total PO Value
                    </span>
                    <span className="text-base font-bold font-mono tabular-nums text-stone-900">
                      {formatIDR(
                        Number(
                          selectedItem.data.grand_total ||
                            selectedItem.data.dpp ||
                            selectedItem.data.total_amount ||
                            0,
                        ),
                      )}
                    </span>
                  </div>
                </div>

                {isManager &&
                  (selectedItem.data.status === "DRAFTED" ||
                    selectedItem.data.status === "PENDING" ||
                    selectedItem.data.status === "DRAFT") && (
                    <div className="space-y-3">
                      {renderDailyPinVerificationBox()}

                      {!showRevisionInput ? (
                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            disabled={isActionSubmitting}
                            onClick={() => handleAuthorizePO(selectedItem.data)}
                            className="min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            <span>Approve & Issue PO</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRevisionInput(true)}
                            className="min-h-[44px] rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <span>Request Revision</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                          <textarea
                            value={revisionNote}
                            onChange={(e) => setRevisionNote(e.target.value)}
                            placeholder="Enter PO revision notes for Purchasing..."
                            rows={2}
                            className="no-base-style w-full p-2.5 bg-white border border-stone-200 rounded-xl text-xs text-stone-900 outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={isActionSubmitting}
                              onClick={() => handleRevisePO(selectedItem.data)}
                              className="flex-1 min-h-[40px] rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer"
                            >
                              Submit Revision
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowRevisionInput(false)}
                              className="min-h-[40px] px-3 rounded-xl bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    openDesktopNotice(
                      "Purchase Orders Studio",
                      "Full multi-column PO creation and receiving tables require Desktop mode.",
                    );
                  }}
                  className="w-full min-h-[42px] rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Monitor className="w-3.5 h-3.5 text-stone-500" />
                  <span>Desktop PO Table Options</span>
                </button>
              </div>
            )}

            {/* 3. QUOTATION DETAILS & PIN APPROVAL */}
            {selectedItem.type === "QUOTATION" && (
              <div className="space-y-4">
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Customer</span>
                    <span className="font-bold text-stone-900">
                      {selectedItem.data.customer_name ||
                        selectedItem.data.customer_name_manual ||
                        "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Subject / Title</span>
                    <span className="font-semibold text-stone-800 text-right max-w-[60%] truncate">
                      {selectedItem.data.title || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Current Status</span>
                    <span className="font-mono font-bold text-amber-700">
                      {selectedItem.data.status || "DRAFT"}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-stone-200/70 flex justify-between items-baseline">
                    <span className="font-semibold text-stone-600">
                      Commercial Value
                    </span>
                    <span className="text-base font-bold font-mono tabular-nums text-stone-900">
                      {formatIDR(
                        Number(
                          selectedItem.data.grand_total ||
                            selectedItem.data.total_amount ||
                            selectedItem.data.amount ||
                            0,
                        ),
                      )}
                    </span>
                  </div>
                </div>

                {isManager &&
                  (selectedItem.data.status === "PENDING" ||
                    selectedItem.data.status === "DRAFT") && (
                    <div className="space-y-3">
                      {renderDailyPinVerificationBox()}

                      {!showRevisionInput ? (
                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            disabled={isActionSubmitting}
                            onClick={() =>
                              handleAuthorizeQuotation(selectedItem.data)
                            }
                            className="min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            <span>Approve Quotation</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRevisionInput(true)}
                            className="min-h-[44px] rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <span>Request Revision</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                          <textarea
                            value={revisionNote}
                            onChange={(e) => setRevisionNote(e.target.value)}
                            placeholder="Enter quotation revision instructions..."
                            rows={2}
                            className="no-base-style w-full p-2.5 bg-white border border-stone-200 rounded-xl text-xs text-stone-900 outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={isActionSubmitting}
                              onClick={() =>
                                handleReviseQuotation(selectedItem.data)
                              }
                              className="flex-1 min-h-[40px] rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer"
                            >
                              Submit Revision
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowRevisionInput(false)}
                              className="min-h-[40px] px-3 rounded-xl bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    openDesktopNotice(
                      "Quotation Editor Studio",
                      "Creating or editing multi-item quotation spreadsheets requires Desktop mode.",
                    );
                  }}
                  className="w-full min-h-[42px] rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Monitor className="w-3.5 h-3.5 text-stone-500" />
                  <span>Desktop Quotation Editor</span>
                </button>
              </div>
            )}

            {/* 4. DELIVERY NOTE (DN) DETAILS & PIN APPROVAL */}
            {selectedItem.type === "DELIVERY" && (
              <div className="space-y-4">
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Customer / Project</span>
                    <span className="font-bold text-stone-900">
                      {selectedItem.data.customer_name ||
                        selectedItem.data.project_name ||
                        "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Vehicle / Police No</span>
                    <span className="font-mono font-semibold text-stone-800">
                      {selectedItem.data.police_number || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Delivery Status</span>
                    <span className="font-mono font-bold text-amber-700">
                      {selectedItem.data.status || "DRAFT"}
                    </span>
                  </div>
                </div>

                {isManager &&
                  (selectedItem.data.status === "DRAFT" ||
                    selectedItem.data.status === "DRAFTED" ||
                    selectedItem.data.status === "REVISION") && (
                    <div className="space-y-3">
                      {renderDailyPinVerificationBox()}

                      {!showRevisionInput ? (
                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            disabled={isActionSubmitting}
                            onClick={() =>
                              handleAuthorizeDelivery(selectedItem.data)
                            }
                            className="min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            <span>Authorize Delivery</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRevisionInput(true)}
                            className="min-h-[44px] rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <span>Request Revision</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                          <textarea
                            value={revisionNote}
                            onChange={(e) => setRevisionNote(e.target.value)}
                            placeholder="Enter delivery note revision instructions..."
                            rows={2}
                            className="no-base-style w-full p-2.5 bg-white border border-stone-200 rounded-xl text-xs text-stone-900 outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={isActionSubmitting}
                              onClick={() =>
                                handleReviseDelivery(selectedItem.data)
                              }
                              className="flex-1 min-h-[40px] rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer"
                            >
                              Submit Revision
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowRevisionInput(false)}
                              className="min-h-[40px] px-3 rounded-xl bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    openDesktopNotice(
                      "Delivery Manifest Studio",
                      "Creating new outbound delivery manifests and printing A4 documents require Desktop mode.",
                    );
                  }}
                  className="w-full min-h-[42px] rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Monitor className="w-3.5 h-3.5 text-stone-500" />
                  <span>Desktop Delivery Studio</span>
                </button>
              </div>
            )}

            {/* 5. PROJECT DETAILS */}
            {selectedItem.type === "PROJECT" && (
              <div className="space-y-4">
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Project / NTP Code</span>
                    <span className="font-mono font-bold text-stone-900">
                      {selectedItem.data.id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Customer</span>
                    <span className="font-bold text-stone-900">
                      {selectedItem.data.customer || "Internal"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Due Date</span>
                    <span className="font-mono font-semibold text-stone-800">
                      {selectedItem.data.due_date || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Priority</span>
                    <span className="font-mono font-bold text-amber-700">
                      {selectedItem.data.urgency || "NORMAL"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItem(null);
                      openDesktopNotice(
                        "Project WOT & BOM Studio",
                        "Editing project WOT lots, BOM trees, and BOP routing requires Desktop mode.",
                      );
                    }}
                    className="min-h-[42px] rounded-2xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span>Desktop Studio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItem(null);
                      navigate("/forum");
                    }}
                    className="min-h-[42px] rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Team Chat</span>
                  </button>
                </div>
              </div>
            )}

            {/* 6. SKU INVENTORY DETAILS */}
            {selectedItem.type === "SKU" && (
              <div className="space-y-4">
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-500">SKU Code</span>
                    <span className="font-mono font-bold text-stone-900">
                      {selectedItem.data.item_code ||
                        selectedItem.data.code ||
                        selectedItem.data.id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Category</span>
                    <span className="font-semibold text-stone-800">
                      {selectedItem.data.type || "RAW MATERIAL"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Available Stock</span>
                    <span className="text-sm font-mono font-bold tabular-nums text-stone-900">
                      {selectedItem.data.stock ?? 0}{" "}
                      {selectedItem.data.uom ||
                        selectedItem.data.unit ||
                        "Unit"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Minimum Threshold</span>
                    <span className="font-mono text-stone-600">
                      {selectedItem.data.min_stock ?? 0}{" "}
                      {selectedItem.data.uom ||
                        selectedItem.data.unit ||
                        "Unit"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    openDesktopNotice(
                      "Warehouse Master & GRN",
                      "Bulk stock adjustments, GRN receiving tables, and SKU master edits require Desktop mode.",
                    );
                  }}
                  className="w-full min-h-[42px] rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Monitor className="w-3.5 h-3.5 text-stone-500" />
                  <span>Desktop Warehouse Options</span>
                </button>
              </div>
            )}

            {/* 7. CONTACT (CLIENT / VENDOR) 1-TAP CALL & EMAIL */}
            {selectedItem.type === "CONTACT" && (
              <div className="space-y-4">
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Partner Type</span>
                    <span className="font-mono font-bold text-stone-900">
                      {selectedItem.data.contactType}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Contact Person</span>
                    <span className="font-bold text-stone-900">
                      {selectedItem.data.contact_person || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Phone</span>
                    <span className="font-mono text-stone-800">
                      {selectedItem.data.phone || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Email</span>
                    <span className="text-stone-800 truncate max-w-[65%]">
                      {selectedItem.data.email || "-"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {selectedItem.data.phone && (
                    <a
                      href={`tel:${selectedItem.data.phone}`}
                      className="min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Call Now</span>
                    </a>
                  )}
                  {selectedItem.data.email && (
                    <a
                      href={`mailto:${selectedItem.data.email}`}
                      className="min-h-[44px] rounded-2xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Send Email</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* 8. FINANCE METRIC DETAILS */}
            {selectedItem.type === "FINANCE_METRIC" && (
              <div className="space-y-4">
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Category</span>
                    <span className="font-bold text-stone-900">
                      {selectedItem.data.category}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-stone-500">Amount</span>
                    <span className="text-base font-mono font-bold text-stone-900">
                      {formatIDR(Number(selectedItem.data.amount || 0))}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-stone-200/70 text-stone-600">
                    {selectedItem.data.note}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    openDesktopNotice(
                      "Finance & Ledger Studio",
                      "Detailed General Ledger journals, AR aging tables, and invoice billing require Desktop mode.",
                    );
                  }}
                  className="w-full min-h-[42px] rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Monitor className="w-3.5 h-3.5 text-stone-500" />
                  <span>Desktop Accounting Studio</span>
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});
