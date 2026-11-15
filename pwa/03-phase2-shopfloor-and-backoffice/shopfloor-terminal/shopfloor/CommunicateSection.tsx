import React, { useState, useCallback, memo } from "react";
import { Send, Pin } from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

interface ShopFloorCommunicateSectionProps {
  projectId: string;
  enrichedProcesses: any[];
  wots: any[];
  itemsCatalog: any[];
  threads: any[];
  floorRequests: any[];
  handovers: any[];
  onRefreshCommunications: () => void;
  user: any;
}

export const ShopFloorCommunicateSection = memo(function ShopFloorCommunicateSection({
  projectId,
  enrichedProcesses,
  wots,
  itemsCatalog,
  threads,
  floorRequests,
  handovers,
  onRefreshCommunications,
  user,
}: ShopFloorCommunicateSectionProps) {
  const { showToast } = useToast();
  const [commTab, setCommTab] = useState<"THREADS" | "FLOOR_REQUEST" | "SHIFT_HANDOVER">("THREADS");

  // Thread Form
  const [threadBopId, setThreadBopId] = useState<string>("");
  const [threadWotId, setThreadWotId] = useState<string>("");
  const [threadMessage, setThreadMessage] = useState<string>("");
  const [threadIsPinned, setThreadIsPinned] = useState<boolean>(false);
  const [isPostingThread, setIsPostingThread] = useState<boolean>(false);

  // Floor Request Form
  const [frType, setFrType] = useState<string>("MATERIAL");
  const [frCategory, setFrCategory] = useState<string>("URGENT");
  const [frBopId, setFrBopId] = useState<string>("");
  const [frItemName, setFrItemName] = useState<string>("");
  const [frQty, setFrQty] = useState<number>(1);
  const [frUnit, setFrUnit] = useState<string>("PCS");
  const [frReason, setFrReason] = useState<string>("");
  const [frAutoPr, setFrAutoPr] = useState<boolean>(true);
  const [isSubmittingFr, setIsSubmittingFr] = useState<boolean>(false);

  // Shift Handover Form
  const [handoverShift, setHandoverShift] = useState<string>("SHIFT_1");
  const [incomingLead, setIncomingLead] = useState<string>("");
  const [handoverSummary, setHandoverSummary] = useState<string>("");
  const [handoverAlerts, setHandoverAlerts] = useState<string>("");
  const [isSubmittingHandover, setIsSubmittingHandover] = useState<boolean>(false);

  const handlePostThread = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!threadMessage.trim()) return;
      setIsPostingThread(true);
      try {
        const stepObj = enrichedProcesses.find((p) => p.id === threadBopId);
        const wotObj = wots.find((w) => w.id === threadWotId);
        const res = await apiFetch(
          `/api/production/projects/${projectId}/threads`,
          {
            method: "POST",
            body: JSON.stringify({
              bop_id: threadBopId || null,
              process_name: stepObj?.process_name || "General Shop Floor",
              wot_id: threadWotId || null,
              wot_number: wotObj?.wot_number || wotObj?.lot_number || null,
              author: user?.name || user?.username || "Operator",
              role: user?.role || "PRODUCTION",
              message: threadMessage.trim(),
              is_pinned: threadIsPinned,
            }),
          },
          user?.username
        );
        if (res.ok) {
          setThreadMessage("");
          setThreadIsPinned(false);
          onRefreshCommunications();
          showToast("Floor note posted", "success");
        }
      } catch (err: any) {
        showToast(err.message, "error");
      } finally {
        setIsPostingThread(false);
      }
    },
    [
      threadMessage,
      enrichedProcesses,
      threadBopId,
      wots,
      threadWotId,
      projectId,
      user,
      threadIsPinned,
      onRefreshCommunications,
      showToast,
    ]
  );

  const handleTogglePinThread = useCallback(
    async (threadId: string) => {
      try {
        const res = await apiFetch(
          `/api/production/threads/${threadId}/pin`,
          { method: "PUT" },
          user?.username
        );
        if (res.ok) {
          onRefreshCommunications();
        }
      } catch (e) {}
    },
    [user?.username, onRefreshCommunications]
  );

  const handleCreateFloorRequest = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!frItemName.trim()) {
        showToast("Specify material or tooling name", "error");
        return;
      }
      setIsSubmittingFr(true);
      try {
        const stepObj = enrichedProcesses.find((p) => p.id === frBopId);
        const matchedItem = itemsCatalog.find(
          (i: any) =>
            String(i.name || "").toLowerCase() === frItemName.trim().toLowerCase() ||
            String(i.item_code || "").toLowerCase() === frItemName.trim().toLowerCase()
        );
        const res = await apiFetch(
          `/api/floor-requests`,
          {
            method: "POST",
            body: JSON.stringify({
              project_id: projectId,
              process_id: frBopId || null,
              station_id: stepObj?.station_id || enrichedProcesses[0]?.station_id || "UNASSIGNED",
              type: frType,
              category: frCategory,
              title: `${frType}: ${frItemName.trim()}`,
              item_id: matchedItem?.id || undefined,
              item_name: frItemName.trim(),
              qty_required: frQty,
              unit: frUnit,
              reason: frReason || "Requested from Shop Floor Communication Console",
              description: frReason || "Requested from Shop Floor Communication Console",
              requested_by: user?.name || user?.username || "Shop Floor Operator",
              auto_pr: frAutoPr,
            }),
          },
          user?.username
        );
        if (res.ok) {
          const genPrNum = res.data?.generated_pr_number;
          const reservedStock = Number(res.data?.reserved_from_stock_qty || 0);
          showToast(
            genPrNum
              ? `Floor Request dispatched & Auto-PR ${genPrNum} synced to Procurement!`
              : reservedStock > 0
              ? `Floor Request fulfilled from Warehouse Free Stock (${reservedStock} ${frUnit} reserved)!`
              : res.data?.message || "Floor Request sent to Warehouse & Procurement!",
            "success"
          );
          setFrItemName("");
          setFrReason("");
          onRefreshCommunications();
        } else {
          showToast(res.error || "Failed to dispatch Floor Request", "error");
        }
      } catch (err: any) {
        showToast(err.message, "error");
      } finally {
        setIsSubmittingFr(false);
      }
    },
    [
      frItemName,
      enrichedProcesses,
      frBopId,
      itemsCatalog,
      projectId,
      frType,
      frCategory,
      frQty,
      frUnit,
      frReason,
      user,
      frAutoPr,
      onRefreshCommunications,
      showToast,
    ]
  );

  const handleCreateShiftHandover = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!handoverSummary.trim()) return;
      setIsSubmittingHandover(true);
      try {
        const res = await apiFetch(
          `/api/production/projects/${projectId}/shift-handover`,
          {
            method: "POST",
            body: JSON.stringify({
              shift: handoverShift,
              outgoing_lead: user?.name || user?.username || "Shift Lead",
              incoming_lead: incomingLead || "Incoming Shift Supervisor",
              summary: handoverSummary.trim(),
              pinned_alerts: handoverAlerts.trim(),
            }),
          },
          user?.username
        );
        if (res.ok) {
          setHandoverSummary("");
          setHandoverAlerts("");
          setIncomingLead("");
          onRefreshCommunications();
          showToast("Shift handover logged", "success");
        }
      } catch (err: any) {
        showToast(err.message, "error");
      } finally {
        setIsSubmittingHandover(false);
      }
    },
    [
      handoverSummary,
      projectId,
      handoverShift,
      user,
      incomingLead,
      handoverAlerts,
      onRefreshCommunications,
      showToast,
    ]
  );

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h2 className="text-base font-bold text-stone-900 tracking-tight">
            Floor Logs &amp; Shift Handover
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Process notes, material requests, and shift handovers.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl border border-stone-200">
          {(
            [
              { id: "THREADS", label: `Threads (${threads.length})` },
              { id: "FLOOR_REQUEST", label: `Material Requests (${floorRequests.length})` },
              { id: "SHIFT_HANDOVER", label: `Shift Handover (${handovers.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCommTab(tab.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0",
                commTab === tab.id
                  ? "bg-white text-stone-900 shadow-2xs"
                  : "text-stone-600 hover:text-stone-900"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {commTab === "THREADS" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handlePostThread}
            className="lg:col-span-5 p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3 h-fit"
          >
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Post Contextual Process / WOT Note
            </h3>
            <Select
              label="Link to Process Step"
              value={threadBopId}
              onChange={(e) => setThreadBopId(e.target.value)}
            >
              <option value="">General Project Floor</option>
              {enrichedProcesses.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.step_sequence} {p.process_name}
                </option>
              ))}
            </Select>
            <Select
              label="Link to WOT Batch (Optional)"
              value={threadWotId}
              onChange={(e) => setThreadWotId(e.target.value)}
              className="font-mono font-bold"
            >
              <option value="">All WOT Batches</option>
              {wots.map((w: any) => (
                <option key={w.id} value={w.id}>
                  {w.wot_number || w.lot_number}
                </option>
              ))}
            </Select>
            <Textarea
              label="Message / Technical Observation *"
              rows={3}
              value={threadMessage}
              onChange={(e) => setThreadMessage(e.target.value)}
              placeholder="Enter operator note, dimensional check result, or engineering clarification..."
              required
            />
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-stone-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={threadIsPinned}
                  onChange={(e) => setThreadIsPinned(e.target.checked)}
                  className="rounded border-stone-300"
                />
                <span>Pin as Priority Floor Alert</span>
              </label>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                lockKey={`post-thread-${projectId}`}
                disabled={isPostingThread}
                leftIcon={<Send />}
              >
                Post Note
              </Button>
            </div>
          </form>

          <div className="lg:col-span-7 space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {threads.length === 0 ? (
              <div className="p-8 border border-stone-200 rounded-xl bg-stone-50 text-center text-xs text-stone-600">
                No contextual process notes posted yet. Use the form on the left to log floor observations or pin alerts.
              </div>
            ) : (
              threads.map((th: any) => (
                <div
                  key={th.id}
                  className={cn(
                    "p-3.5 rounded-xl border space-y-1.5",
                    th.is_pinned
                      ? "bg-amber-50/60 border-amber-300"
                      : "bg-white border-stone-200"
                  )}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-stone-500">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900">{th.author}</span>
                      <span>·</span>
                      <span>{th.process_name || "General Floor"}</span>
                      {th.wot_number && (
                        <>
                          <span>·</span>
                          <span className="text-stone-800 font-bold">{th.wot_number}</span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTogglePinThread(th.id)}
                      className={cn(
                        "p-1 rounded hover:bg-stone-100",
                        th.is_pinned ? "text-amber-700" : "text-stone-400"
                      )}
                      title="Pin / Unpin Alert"
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-stone-800">{th.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {commTab === "FLOOR_REQUEST" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateFloorRequest}
            className="lg:col-span-5 p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3 h-fit"
          >
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Direct Material &amp; Tooling Floor Request
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Request Type"
                value={frType}
                onChange={(e) => setFrType(e.target.value)}
              >
                <option value="MATERIAL">Raw Material / BOM SKU</option>
                <option value="TOOLING">Tooling / Consumable</option>
              </Select>
              <Select
                label="Urgency"
                value={frCategory}
                onChange={(e) => setFrCategory(e.target.value)}
              >
                <option value="NORMAL">Normal Replenishment</option>
                <option value="URGENT">Urgent Floor Shortage</option>
                <option value="CRITICAL">Critical Line Stop</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Input
                label="Item / Tooling Name *"
                type="text"
                list={`floor-catalog-${projectId}`}
                value={frItemName}
                onChange={(e) => setFrItemName(e.target.value)}
                placeholder="e.g. M12 High-Tensile Bolts / 3mm Fiber Laser Nozzle"
                required
              />
              <datalist id={`floor-catalog-${projectId}`}>
                {itemsCatalog.map((item: any) => (
                  <option key={item.id} value={item.name}>
                    {item.item_code} · Free Stock: {item.free_stock ?? item.available_qty ?? 0} {item.uom}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Quantity Required"
                type="number"
                min={1}
                value={frQty}
                onChange={(e) => setFrQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="font-mono font-bold tabular-nums"
              />
              <Input
                label="Unit (UOM)"
                type="text"
                value={frUnit}
                onChange={(e) => setFrUnit(e.target.value)}
                className="font-mono font-bold"
              />
            </div>
            <Input
              label="Reason / Station Delivery Note"
              type="text"
              value={frReason}
              onChange={(e) => setFrReason(e.target.value)}
              placeholder="e.g. Needed at Station 3 for WOT batch #2"
            />
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-stone-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={frAutoPr}
                  onChange={(e) => setFrAutoPr(e.target.checked)}
                  className="rounded border-stone-300"
                />
                <span>Auto-sync Shortage to Procurement PR</span>
              </label>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                lockKey={`dispatch-fr-${projectId}`}
                disabled={isSubmittingFr}
              >
                {isSubmittingFr ? "Sending..." : "Dispatch Request"}
              </Button>
            </div>
          </form>

          <div className="lg:col-span-7 space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {floorRequests.length === 0 ? (
              <div className="p-8 border border-stone-200 rounded-xl bg-stone-50 text-center text-xs text-stone-600">
                No material or tooling floor requests submitted for this project yet.
              </div>
            ) : (
              floorRequests.map((fr: any) => (
                <div
                  key={fr.id}
                  className="p-3.5 rounded-xl border border-stone-200 bg-white flex items-center justify-between gap-4"
                >
                  <div className="space-y-0.5">
                    <div className="text-[11px] font-mono tabular-nums text-stone-500">
                      <strong className="text-stone-900">{fr.request_code || fr.id}</strong> ·{" "}
                      {fr.type} · {fr.category}
                    </div>
                    <div className="text-xs font-bold text-stone-900 font-mono tabular-nums">
                      {fr.title || fr.item_name} (Qty: {fr.qty_required || 1} {fr.unit || "UNIT"})
                    </div>
                    <div className="text-[11px] text-stone-500">{fr.reason || fr.description}</div>
                  </div>
                  <span className="text-xs font-mono font-bold text-stone-800 shrink-0 tabular-nums">
                    {fr.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {commTab === "SHIFT_HANDOVER" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateShiftHandover}
            className="lg:col-span-5 p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3 h-fit"
          >
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Log Shift Handover &amp; Pinned Alerts
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Outgoing Shift"
                value={handoverShift}
                onChange={(e) => setHandoverShift(e.target.value)}
              >
                <option value="SHIFT_1">Shift 1 (Morning)</option>
                <option value="SHIFT_2">Shift 2 (Afternoon)</option>
                <option value="SHIFT_3">Shift 3 (Night)</option>
              </Select>
              <Input
                label="Incoming Shift Lead"
                type="text"
                value={incomingLead}
                onChange={(e) => setIncomingLead(e.target.value)}
                placeholder="e.g. Supervisor Shift 2"
              />
            </div>
            <Textarea
              label="Shift Execution Summary *"
              rows={3}
              value={handoverSummary}
              onChange={(e) => setHandoverSummary(e.target.value)}
              placeholder="Summarize completed WOT batches, current active station status, and target for next shift..."
              required
            />
            <Input
              label="Pinned Safety / Quality Alerts for Next Shift"
              type="text"
              value={handoverAlerts}
              onChange={(e) => setHandoverAlerts(e.target.value)}
              placeholder="e.g. Check torque calibration on Station 3 fixture before starting WOT-002"
            />
            <div className="flex items-center justify-end">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                lockKey={`shift-handover-${projectId}`}
                disabled={isSubmittingHandover}
              >
                {isSubmittingHandover ? "Logging..." : "Submit Shift Handover"}
              </Button>
            </div>
          </form>

          <div className="lg:col-span-7 space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {handovers.length === 0 ? (
              <div className="p-8 border border-stone-200 rounded-xl bg-stone-50 text-center text-xs text-stone-600">
                No shift handover logs recorded yet.
              </div>
            ) : (
              handovers.map((sh: any) => (
                <div
                  key={sh.id}
                  className="p-4 rounded-xl border border-stone-200 bg-white space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-stone-500">
                    <span>
                      <strong className="text-stone-900">{sh.shift}</strong> · Outgoing:{" "}
                      {sh.outgoing_lead} → Incoming: {sh.incoming_lead}
                    </span>
                    <span>{new Date(sh.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-stone-800">{sh.summary}</p>
                  {sh.pinned_alerts && (
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-900">
                      Pinned Alert: {sh.pinned_alerts}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});
