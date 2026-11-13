import React from "react";
import { Wrench, Package } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type ShopFloorControlTab =
  | "NDP_CASCADE"
  | "MACHINE_REROUTE"
  | "LOT_SPLIT"
  | "QC_REWORK"
  | "SHIFT_BOOST";

interface ShopFloorControlSectionProps {
  controlTab: ShopFloorControlTab;
  setControlTab: (tab: ShopFloorControlTab) => void;
  enrichedProcesses: any[];
  availableMachines: any[];
  bom: any[];
  wots: any[];
  activeNdps: any[];
  lastCascadeResult: any;
  // NDP Cascade form
  ndpVector: "MACHINE_BREAKDOWN" | "MATERIAL_NG";
  setNdpVector: (v: "MACHINE_BREAKDOWN" | "MATERIAL_NG") => void;
  ndpBopId: string;
  setNdpBopId: (v: string) => void;
  ndpDownHours: number;
  setNdpDownHours: (v: number) => void;
  ndpMachineId: string;
  setNdpMachineId: (v: string) => void;
  ndpSelectedBomId: string;
  setNdpSelectedBomId: (v: string) => void;
  ndpNgQty: number;
  setNdpNgQty: (v: number) => void;
  ndpDescription: string;
  setNdpDescription: (v: string) => void;
  isSubmittingNdp: boolean;
  handleTriggerCascadingNdp: (e: React.FormEvent) => void;
  handleResolveNdp: (ndp: any) => void;
  // Machine Reroute form
  rerouteBopId: string;
  setRerouteBopId: (v: string) => void;
  rerouteMachineId: string;
  setRerouteMachineId: (v: string) => void;
  rerouteNotes: string;
  setRerouteNotes: (v: string) => void;
  rerouteResolveNdp: boolean;
  setRerouteResolveNdp: (v: boolean) => void;
  isSubmittingReroute: boolean;
  handleMachineReroute: (e: React.FormEvent) => void;
  // Lot Split form
  splitWotId: string;
  setSplitWotId: (v: string) => void;
  splitQty: number;
  setSplitQty: (v: number) => void;
  splitTargetBopId: string;
  setSplitTargetBopId: (v: string) => void;
  isSubmittingSplit: boolean;
  handleSplitWot: (e: React.FormEvent) => void;
  // QC Rework form
  qcActionType: "QC_HOLD" | "REWORK_LOOP";
  setQcActionType: (v: "QC_HOLD" | "REWORK_LOOP") => void;
  qcBopId: string;
  setQcBopId: (v: string) => void;
  qcQty: number;
  setQcQty: (v: number) => void;
  qcReason: string;
  setQcReason: (v: string) => void;
  isSubmittingQc: boolean;
  handleQcRework: (e: React.FormEvent) => void;
  // Shift Boost form
  boostBopId: string;
  setBoostBopId: (v: string) => void;
  boostHours: number;
  setBoostHours: (v: number) => void;
  boostReason: string;
  setBoostReason: (v: string) => void;
  isSubmittingBoost: boolean;
  handleShiftBoost: (e: React.FormEvent) => void;
}

export const ShopFloorControlSection: React.FC<ShopFloorControlSectionProps> = React.memo(({
  controlTab,
  setControlTab,
  enrichedProcesses,
  availableMachines,
  bom,
  wots,
  activeNdps,
  lastCascadeResult,
  ndpVector,
  setNdpVector,
  ndpBopId,
  setNdpBopId,
  ndpDownHours,
  setNdpDownHours,
  ndpMachineId,
  setNdpMachineId,
  ndpSelectedBomId,
  setNdpSelectedBomId,
  ndpNgQty,
  setNdpNgQty,
  ndpDescription,
  setNdpDescription,
  isSubmittingNdp,
  handleTriggerCascadingNdp,
  handleResolveNdp,
  rerouteBopId,
  setRerouteBopId,
  rerouteMachineId,
  setRerouteMachineId,
  rerouteNotes,
  setRerouteNotes,
  rerouteResolveNdp,
  setRerouteResolveNdp,
  isSubmittingReroute,
  handleMachineReroute,
  splitWotId,
  setSplitWotId,
  splitQty,
  setSplitQty,
  splitTargetBopId,
  setSplitTargetBopId,
  isSubmittingSplit,
  handleSplitWot,
  qcActionType,
  setQcActionType,
  qcBopId,
  setQcBopId,
  qcQty,
  setQcQty,
  qcReason,
  setQcReason,
  isSubmittingQc,
  handleQcRework,
  boostBopId,
  setBoostBopId,
  boostHours,
  setBoostHours,
  boostReason,
  setBoostReason,
  isSubmittingBoost,
  handleShiftBoost,
}) => {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h2 className="text-base font-bold text-stone-900">Recovery &amp; Line Controls</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            NDP alerts, machine failover, WOT sub-lot split, QC rework, and overtime boost.
          </p>
        </div>

        {/* Tactical Control Mode Selector */}
        <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl border border-stone-200 overflow-x-auto">
          {(
            [
              { id: "NDP_CASCADE", label: "Cross-Project NDP" },
              { id: "MACHINE_REROUTE", label: "Machine Failover" },
              { id: "LOT_SPLIT", label: "Split WOT Lot" },
              { id: "QC_REWORK", label: "QC Hold & Rework" },
              { id: "SHIFT_BOOST", label: "Overtime Boost" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setControlTab(tab.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0",
                controlTab === tab.id
                  ? "bg-white text-stone-900 shadow-2xs"
                  : "text-stone-600 hover:text-stone-900"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Control Action Form (7 Cols) */}
        <div className="lg:col-span-7">
          {controlTab === "NDP_CASCADE" && (
            <form
              onSubmit={handleTriggerCascadingNdp}
              className="p-5 rounded-xl bg-stone-50 border border-stone-200 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                  Issue Cross-Project Cascading NDP (Notice to Down Process)
                </h3>
                <span className="text-[11px] font-mono text-rose-700 font-bold">
                  Dual-Vector Propagation
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNdpVector("MACHINE_BREAKDOWN")}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all",
                    ndpVector === "MACHINE_BREAKDOWN"
                      ? "bg-white border-rose-600 text-stone-900 shadow-2xs"
                      : "bg-white/60 border-stone-200 text-stone-600 hover:text-stone-900"
                  )}
                >
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-rose-600" />
                    <span>Machine Breakdown</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">
                    Halts this process and shared machine assignments.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setNdpVector("MATERIAL_NG")}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all",
                    ndpVector === "MATERIAL_NG"
                      ? "bg-white border-rose-600 text-stone-900 shadow-2xs"
                      : "bg-white/60 border-stone-200 text-stone-600 hover:text-stone-900"
                  )}
                >
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-rose-600" />
                    <span>Material SKU NG</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">
                    Flags defective BOM material and halts affected processes.
                  </p>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Affected Process Step *
                  </label>
                  <select
                    value={ndpBopId}
                    onChange={(e) => setNdpBopId(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-900"
                  >
                    {enrichedProcesses.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.step_sequence} {p.process_name} ({p.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Estimated Down Duration (Hours)
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={ndpDownHours}
                    onChange={(e) =>
                      setNdpDownHours(Math.max(0.5, parseFloat(e.target.value) || 4))
                    }
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-stone-900 tabular-nums"
                  />
                </div>
              </div>

              {ndpVector === "MACHINE_BREAKDOWN" ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Downed Machine Asset (Cascades to All Projects Sharing This Machine)
                  </label>
                  <select
                    value={ndpMachineId}
                    onChange={(e) => setNdpMachineId(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-900"
                  >
                    <option value="">-- Current Process Station / Machine --</option>
                    {availableMachines.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        [{m.item_code}] {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-stone-700 block">
                      Defective Dispatched BOM Material SKU *
                    </label>
                    <select
                      value={ndpSelectedBomId}
                      onChange={(e) => setNdpSelectedBomId(e.target.value)}
                      className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-900"
                    >
                      {bom.length === 0 ? (
                        <option value="">General Dispatched Raw Material</option>
                      ) : (
                        bom.map((b: any) => (
                          <option key={b.id} value={b.id}>
                            [{b.item_code || b.id}] {b.item_name} (Req: {b.required_qty || b.qty}{" "}
                            {b.uom || "UNIT"})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-700 block">
                      NG Quantity Found
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={ndpNgQty}
                      onChange={(e) =>
                        setNdpNgQty(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-stone-900 tabular-nums"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  Root Cause / Defect Description *
                </label>
                <input
                  type="text"
                  value={ndpDescription}
                  onChange={(e) => setNdpDescription(e.target.value)}
                  placeholder={
                    ndpVector === "MACHINE_BREAKDOWN"
                      ? "e.g. Spindle thermal overload / laser optics fault..."
                      : "e.g. Dispatched steel plate batch has surface crack / out-of-spec thickness..."
                  }
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs text-stone-900"
                  required
                />
              </div>

              <div className="flex items-center justify-end">
                <Button
                  type="submit"
                  disabled={isSubmittingNdp}
                  className="h-9 px-5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold whitespace-nowrap shrink-0"
                >
                  {isSubmittingNdp
                    ? "Issuing & Cascading NDP..."
                    : ndpVector === "MACHINE_BREAKDOWN"
                    ? "Trigger Machine Breakdown NDP (Cross-Project)"
                    : "Trigger Material SKU NG NDP (Cross-Project)"}
                </Button>
              </div>
            </form>
          )}

          {controlTab === "MACHINE_REROUTE" && (
            <form
              onSubmit={handleMachineReroute}
              className="p-5 rounded-xl bg-stone-50 border border-stone-200 space-y-4"
            >
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                Machine Reroute &amp; Failover Switch
              </h3>
              <p className="text-xs text-stone-600">
                Reassign a paused or bottlenecked process step to a backup machine or manual workstation and automatically resume execution.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Target Process Step
                  </label>
                  <select
                    value={rerouteBopId}
                    onChange={(e) => setRerouteBopId(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-900"
                  >
                    {enrichedProcesses.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.step_sequence} {p.process_name} ({p.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Backup / Failover Machine
                  </label>
                  <select
                    value={rerouteMachineId}
                    onChange={(e) => setRerouteMachineId(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-900"
                  >
                    <option value="">Manual / General Backup Workstation</option>
                    {availableMachines.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        [{m.item_code}] {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  Failover Notes
                </label>
                <input
                  type="text"
                  value={rerouteNotes}
                  onChange={(e) => setRerouteNotes(e.target.value)}
                  placeholder="e.g. Switched to backup workstation to bypass downed unit"
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs text-stone-900"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-stone-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rerouteResolveNdp}
                    onChange={(e) => setRerouteResolveNdp(e.target.checked)}
                    className="rounded border-stone-300"
                  />
                  <span>Auto-resolve active NDP on this process &amp; resume</span>
                </label>
                <Button
                  type="submit"
                  disabled={isSubmittingReroute}
                  className="h-9 px-5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-bold"
                >
                  {isSubmittingReroute ? "Rerouting..." : "Execute Failover Reroute"}
                </Button>
              </div>
            </form>
          )}

          {controlTab === "LOT_SPLIT" && (
            <form
              onSubmit={handleSplitWot}
              className="p-5 rounded-xl bg-stone-50 border border-stone-200 space-y-4"
            >
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                WOT Sub-Lot Split &amp; Partial Handover
              </h3>
              <p className="text-xs text-stone-600">
                Split an active WOT batch into a child WOT sub-lot so completed partial units can immediately advance to the next downstream process.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Parent WOT Sub-Lot
                  </label>
                  <select
                    value={splitWotId}
                    onChange={(e) => setSplitWotId(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-stone-900"
                  >
                    {wots.map((w: any) => (
                      <option key={w.id} value={w.id}>
                        {w.wot_number || w.lot_number} (Qty: {w.qty})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Split Transfer Qty
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={splitQty}
                    onChange={(e) =>
                      setSplitQty(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-stone-900 tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Target Downstream Process
                  </label>
                  <select
                    value={splitTargetBopId}
                    onChange={(e) => setSplitTargetBopId(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-900"
                  >
                    {enrichedProcesses.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.step_sequence} {p.process_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <Button
                  type="submit"
                  disabled={isSubmittingSplit || wots.length === 0}
                  className="h-9 px-5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-bold"
                >
                  {isSubmittingSplit ? "Splitting WOT..." : "Split WOT & Advance Child Lot"}
                </Button>
              </div>
            </form>
          )}

          {controlTab === "QC_REWORK" && (
            <form
              onSubmit={handleQcRework}
              className="p-5 rounded-xl bg-stone-50 border border-stone-200 space-y-4"
            >
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                Quality Hold &amp; Rework Loop Trigger
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Action Type
                  </label>
                  <select
                    value={qcActionType}
                    onChange={(e) =>
                      setQcActionType(e.target.value as "QC_HOLD" | "REWORK_LOOP")
                    }
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-900"
                  >
                    <option value="REWORK_LOOP">Trigger Rework Loop</option>
                    <option value="QC_HOLD">Place on Quality Hold (Quarantine)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Target Process Step
                  </label>
                  <select
                    value={qcBopId}
                    onChange={(e) => setQcBopId(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-900"
                  >
                    {enrichedProcesses.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.step_sequence} {p.process_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Affected Units Qty
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={qcQty}
                    onChange={(e) =>
                      setQcQty(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-stone-900 tabular-nums"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  QC Non-Conformance / Rework Instruction *
                </label>
                <input
                  type="text"
                  value={qcReason}
                  onChange={(e) => setQcReason(e.target.value)}
                  placeholder="e.g. Weld porosity detected on seam B — grind and re-weld before coating"
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs text-stone-900"
                  required
                />
              </div>
              <div className="flex items-center justify-end">
                <Button
                  type="submit"
                  disabled={isSubmittingQc}
                  className="h-9 px-5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold"
                >
                  {isSubmittingQc ? "Recording..." : "Execute QC Hold / Rework Loop"}
                </Button>
              </div>
            </form>
          )}

          {controlTab === "SHIFT_BOOST" && (
            <form
              onSubmit={handleShiftBoost}
              className="p-5 rounded-xl bg-stone-50 border border-stone-200 space-y-4"
            >
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                Inline Overtime &amp; Shift Boost Injection
              </h3>
              <p className="text-xs text-stone-600">
                Inject extra overtime shift hours into the active schedule to recover from NDP downtime or compress bottleneck cycle times.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Target Bottleneck Process
                  </label>
                  <select
                    value={boostBopId}
                    onChange={(e) => setBoostBopId(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-900"
                  >
                    {enrichedProcesses.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.step_sequence} {p.process_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Overtime Shift Boost Hours
                  </label>
                  <select
                    value={boostHours}
                    onChange={(e) => setBoostHours(Number(e.target.value) || 4)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-stone-900"
                  >
                    <option value={2}>+2 Hours Inline Overtime</option>
                    <option value={4}>+4 Hours Half-Shift Boost</option>
                    <option value={8}>+8 Hours Extra Full Shift</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  Authorization Reason
                </label>
                <input
                  type="text"
                  value={boostReason}
                  onChange={(e) => setBoostReason(e.target.value)}
                  placeholder="e.g. Recover NTP deadline buffer after station downtime"
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs text-stone-900"
                />
              </div>
              <div className="flex items-center justify-end">
                <Button
                  type="submit"
                  disabled={isSubmittingBoost}
                  className="h-9 px-5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-bold"
                >
                  {isSubmittingBoost
                    ? "Injecting Boost..."
                    : `Inject +${boostHours}h Shift Boost`}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Active NDPs & Cross-Project Cascade Log (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
              Active NDPs &amp; Cross-Project Cascaded Stops ({activeNdps.length})
            </h3>
          </div>

          {lastCascadeResult && lastCascadeResult.cascaded_count > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1.5">
              <div className="font-bold">
                Cross-Project Cascade Executed ({lastCascadeResult.cascaded_count} Intersecting Processes Halted)
              </div>
              <div className="space-y-1 text-[11px] font-mono">
                {lastCascadeResult.cascaded_impacts.map((imp: any, i: number) => (
                  <div key={i}>
                    • {imp.project_name}: {imp.process_name} — {imp.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeNdps.length === 0 ? (
            <div className="p-6 border border-stone-200 rounded-xl bg-stone-50 text-center text-xs text-stone-600">
              Zero active NDPs. All workstations and dispatched material batches are operating nominally.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {activeNdps.map((ndp: any) => (
                <div
                  key={ndp.id}
                  className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="font-bold text-rose-700">
                      {ndp.ndp_code || ndp.ndp_number} · {ndp.reason_category}
                    </span>
                    <span className="text-stone-500">
                      {ndp.cascade_scope || "SINGLE_PROCESS"}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-stone-900">
                    {ndp.description || ndp.reason_detail}
                  </div>
                  {ndp.affected_item_code && (
                    <div className="text-[11px] font-mono text-rose-800">
                      Affected Material SKU: [{ndp.affected_item_code}] {ndp.affected_item_name} (NG Qty: {ndp.ng_qty || 1})
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] font-mono text-stone-500">
                      Est. Down: {ndp.estimated_down_hours || 8}h
                    </span>
                    {ndp.status === "ACTIVE" && (
                      <Button
                        onClick={() => handleResolveNdp(ndp)}
                        size="sm"
                        className="h-7 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold"
                      >
                        Resolve &amp; Resume
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
