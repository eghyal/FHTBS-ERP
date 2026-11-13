import React, { useState, useMemo } from "react";
import {
  Repeat,
  Plus,
  CheckSquare,
  Square,
  UserX,
  CheckCircle2,
  Search,
  ArrowRight,
  ShieldCheck,
  Calendar,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { apiFetch } from "@/utils/api";

interface HrHandoverTabProps {
  handovers: any[];
  users: any[];
  currentUser: any;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onRefresh: () => void;
}

export const HrHandoverTab: React.FC<HrHandoverTabProps> = React.memo(
  ({ handovers, users, currentUser, showToast, onRefresh }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [selectedHandoverId, setSelectedHandoverId] = useState<string | null>(
      null,
    );

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [resigningUser, setResigningUser] = useState("");
    const [successorUser, setSuccessorUser] = useState("");
    const [targetDate, setTargetDate] = useState(() =>
      new Date().toISOString().slice(0, 10),
    );
    const [notes, setNotes] = useState("");
    const [checklistText, setChecklistText] = useState(
      "Return factory ID badge, PPE & safety gear\nHandover active SOP documents & project files\nRevoke ERP & email credentials\nFinal exit interview & payroll clearance",
    );
    const [isSaving, setIsSaving] = useState(false);

    const filteredHandovers = useMemo(() => {
      return (handovers || []).filter((h) => {
        if (statusFilter !== "ALL" && h.status !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const mRes = String(h.resigning_name || h.resigning_username || "")
            .toLowerCase()
            .includes(q);
          const mSuc = String(h.successor_name || h.successor_username || "")
            .toLowerCase()
            .includes(q);
          if (!mRes && !mSuc) return false;
        }
        return true;
      });
    }, [handovers, statusFilter, searchQuery]);

    const activeHandover = useMemo(() => {
      if (selectedHandoverId) {
        const found = filteredHandovers.find(
          (h) => String(h.id) === String(selectedHandoverId),
        );
        if (found) return found;
      }
      return filteredHandovers[0] || null;
    }, [filteredHandovers, selectedHandoverId]);

    const parseChecklist = (raw: any): { task: string; done: boolean }[] => {
      if (!raw) return [];
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const handleCreateHandover = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!resigningUser || !successorUser || !targetDate) {
        showToast(
          "Please select resigning staff, successor, and target date",
          "error",
        );
        return;
      }
      setIsSaving(true);
      try {
        const items = checklistText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((task) => ({ task, done: false }));

        const res = await apiFetch(
          "/api/hr/handovers",
          {
            method: "POST",
            body: JSON.stringify({
              resigning_username: resigningUser,
              successor_username: successorUser,
              target_last_date: targetDate,
              handover_notes: notes,
              checklist_json: JSON.stringify(items),
            }),
          },
          currentUser?.username,
        );

        if (res.ok) {
          showToast("Offboarding & Handover tracker initialized", "success");
          setIsModalOpen(false);
          onRefresh();
        } else {
          showToast(
            res.error || "Failed to create handover document",
            "error",
          );
        }
      } catch (err) {
        showToast("Error creating handover tracker", "error");
      } finally {
        setIsSaving(false);
      }
    };

    const handleToggleCheckItem = async (handover: any, idx: number) => {
      const list = parseChecklist(handover.checklist_json);
      if (!list[idx]) return;
      list[idx].done = !list[idx].done;

      const allDone = list.length > 0 && list.every((i) => i.done);
      const nextStatus = allDone
        ? "COMPLETED"
        : list.some((i) => i.done)
          ? "IN_PROGRESS"
          : "PENDING";

      try {
        const res = await apiFetch(
          `/api/hr/handovers/${handover.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              status: nextStatus,
              handover_notes: handover.handover_notes,
              checklist_json: JSON.stringify(list),
            }),
          },
          currentUser?.username,
        );
        if (res.ok) {
          if (nextStatus === "COMPLETED") {
            showToast(
              `Handover 100% completed! Account @${handover.resigning_username} and Production ManPower automatically deactivated.`,
              "success",
            );
          } else {
            showToast("Checklist progress saved", "info");
          }
          onRefresh();
        }
      } catch (e) {
        showToast("Failed to update checklist item", "error");
      }
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-200">
        {/* LEFT COLUMN (5 COLS): TRANSITION BRIDGE NAVIGATOR */}
        <div className="lg:col-span-5 space-y-4">
          <div className="hris-glass-panel p-5 rounded-[28px] space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200/60 flex items-center justify-center">
                  <Repeat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#121318]">
                    Transition Bridges
                  </h3>
                  <p className="text-[11px] font-medium text-[#8E929F]">
                    {filteredHandovers.length} active or completed handovers
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setResigningUser(users[0]?.username || "");
                  setSuccessorUser(
                    users[1]?.username || users[0]?.username || "",
                  );
                  setIsModalOpen(true);
                }}
                className="h-9 px-3.5 bg-[#121318] hover:bg-[#1E2028] text-white text-xs font-bold rounded-2xl flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>Initiate</span>
              </button>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#8E929F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search departing or successor..."
                  className="w-full h-9 pl-9 pr-3 bg-white/85 border border-white rounded-xl text-xs font-bold text-[#121318] outline-none"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-3 bg-white/85 border border-white rounded-xl text-xs font-bold text-[#32353E] outline-none cursor-pointer"
              >
                <option value="ALL">All</option>
                <option value="PENDING">PENDING</option>
                <option value="IN_PROGRESS">IN PROGRESS</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>
          </div>

          {/* Selectable Transition Bridge Cards */}
          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1 custom-scrollbar">
            {filteredHandovers.map((h) => {
              const list = parseChecklist(h.checklist_json);
              const doneCount = list.filter((i) => i.done).length;
              const pct =
                list.length > 0
                  ? Math.round((doneCount / list.length) * 100)
                  : 0;
              const isSelected = activeHandover?.id === h.id;

              return (
                <div
                  key={h.id}
                  onClick={() => setSelectedHandoverId(String(h.id))}
                  className={`p-5 rounded-[26px] transition-all cursor-pointer space-y-3 ${
                    isSelected
                      ? "bg-[#121318] text-white shadow-[0_18px_36px_rgba(18,19,24,0.16)]"
                      : "hris-glass-card hover:bg-white/95 text-[#121318]"
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span
                      className={`font-mono ${
                        isSelected ? "text-white/60" : "text-[#8E929F]"
                      }`}
                    >
                      {h.id} · Exit {h.target_last_date}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        h.status === "COMPLETED"
                          ? isSelected
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : isSelected
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {h.status} · {pct}%
                    </span>
                  </div>

                  {/* Visual Bridge: Outgoing -> Successor */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="min-w-0">
                      <span
                        className={`text-[10px] font-bold uppercase block ${
                          isSelected ? "text-rose-300" : "text-rose-600"
                        }`}
                      >
                        Departing
                      </span>
                      <p className="text-sm font-extrabold truncate">
                        {h.resigning_name || h.resigning_username}
                      </p>
                    </div>

                    <ArrowRight
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? "text-amber-400" : "text-[#8E929F]"
                      }`}
                    />

                    <div className="min-w-0 text-right">
                      <span
                        className={`text-[10px] font-bold uppercase block ${
                          isSelected ? "text-emerald-300" : "text-emerald-600"
                        }`}
                      >
                        Successor
                      </span>
                      <p className="text-sm font-extrabold truncate">
                        {h.successor_name || h.successor_username}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`w-full h-1.5 rounded-full overflow-hidden ${
                      isSelected ? "bg-white/20" : "bg-stone-200"
                    }`}
                  >
                    <div
                      className={`h-full rounded-full ${
                        h.status === "COMPLETED"
                          ? "bg-emerald-500"
                          : "bg-amber-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN (7 COLS): INTERACTIVE CLEARANCE & ASSET STUDIO */}
        <div className="lg:col-span-7 lg:sticky lg:top-20">
          {activeHandover ? (
            (() => {
              const list = parseChecklist(activeHandover.checklist_json);
              const doneCount = list.filter((i) => i.done).length;
              const pct =
                list.length > 0
                  ? Math.round((doneCount / list.length) * 100)
                  : 0;
              return (
                <div className="hris-glass-panel p-7 sm:p-8 rounded-[32px] space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/60 pb-5">
                    <div>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200/60">
                        <Calendar className="w-3 h-3" />
                        Effective Exit Date: {activeHandover.target_last_date}
                      </span>
                      <h2 className="text-2xl font-extrabold text-[#121318] tracking-tight mt-2">
                        Clearance &amp; Handover Protocol
                      </h2>
                    </div>

                    <div className="text-right">
                      <span className="text-3xl font-extrabold text-[#121318] tabular-nums">
                        {pct}%
                      </span>
                      <span className="block text-[11px] font-semibold text-[#8E929F]">
                        {doneCount} of {list.length} items verified
                      </span>
                    </div>
                  </div>

                  {/* Visual Bridge Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200/60">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 block">
                        Departing Personnel
                      </span>
                      <h4 className="text-base font-extrabold text-[#121318] mt-1">
                        {activeHandover.resigning_name ||
                          activeHandover.resigning_username}
                      </h4>
                      <p className="text-xs font-medium text-[#646876]">
                        @{activeHandover.resigning_username}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/60">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 block">
                        Designated Successor
                      </span>
                      <h4 className="text-base font-extrabold text-[#121318] mt-1">
                        {activeHandover.successor_name ||
                          activeHandover.successor_username}
                      </h4>
                      <p className="text-xs font-medium text-[#646876]">
                        @{activeHandover.successor_username}
                      </p>
                    </div>
                  </div>

                  {/* Interactive Step-by-Step Checklist */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#8E929F]">
                      Mandatory Clearance Tasks (Click to Toggle)
                    </h4>
                    {list.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          handleToggleCheckItem(activeHandover, idx)
                        }
                        className={`w-full p-4 rounded-2xl border flex items-center justify-between gap-3 text-left transition-all cursor-pointer ${
                          item.done
                            ? "bg-emerald-50/60 border-emerald-200/80 text-[#646876]"
                            : "bg-white/90 hover:bg-white border-white text-[#121318] shadow-2xs"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {item.done ? (
                            <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0" />
                          ) : (
                            <Square className="w-5 h-5 text-[#8E929F] shrink-0" />
                          )}
                          <span
                            className={`text-xs sm:text-sm font-bold ${
                              item.done ? "line-through" : ""
                            }`}
                          >
                            {item.task}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                            item.done
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-stone-100 text-[#8E929F]"
                          }`}
                        >
                          {item.done ? "Cleared" : "Pending"}
                        </span>
                      </button>
                    ))}
                  </div>

                  {activeHandover.status === "COMPLETED" ? (
                    <div className="p-4 rounded-2xl bg-[#121318] text-white flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <UserX className="w-5 h-5 text-rose-400" />
                        <div>
                          <p className="text-xs font-extrabold">
                            Account @{activeHandover.resigning_username} &amp;
                            Production ManPower Auto-Deactivated
                          </p>
                          <p className="text-[11px] text-white/70">
                            100% clearance verified and synced with ERP security.
                          </p>
                        </div>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-white/70 border border-white flex items-center gap-2.5 text-xs font-semibold text-[#646876]">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Completing 100% of this checklist will automatically
                        deactivate @{activeHandover.resigning_username} in ERP
                        and ManPower.
                      </span>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="hris-glass-panel p-14 rounded-[32px] text-center">
              <Repeat className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-sm font-extrabold text-[#121318]">
                Select a transition bridge on the left to manage its clearance
                checklist.
              </p>
            </div>
          )}
        </div>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Initiate Employee Offboarding & Handover"
          description="Assign a successor and clearance checklist. Account access revokes automatically when 100% completed."
          maxWidth="lg"
          uiTheme="hris"
        >
          <form
            onSubmit={handleCreateHandover}
            className="space-y-4 text-left font-bold"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Resigning / Departing Employee"
                required
                value={resigningUser}
                onChange={(e) => setResigningUser(e.target.value)}
              >
                {(users || []).map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.name || u.username} (@{u.username})
                  </option>
                ))}
              </Select>

              <Select
                label="Designated Successor"
                required
                value={successorUser}
                onChange={(e) => setSuccessorUser(e.target.value)}
              >
                {(users || []).map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.name || u.username} (@{u.username})
                  </option>
                ))}
              </Select>
            </div>

            <Input
              type="date"
              label="Target Effective Exit Date"
              required
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="font-mono"
            />

            <Textarea
              label="Clearance & Handover Checklist (One item per line)"
              rows={4}
              value={checklistText}
              onChange={(e) => setChecklistText(e.target.value)}
            />

            <Input
              type="text"
              label="Transition Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional handover instructions..."
            />

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
                Create Handover Tracker
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  },
);
