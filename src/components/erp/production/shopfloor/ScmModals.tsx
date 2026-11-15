import React from "react";
import { AlertTriangle, Package, Sliders } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { WotGenealogyModal } from "@/components/erp/production/GenealogyModal";
import { cn } from "@/lib/utils";
import type { ScmReadinessState } from "@/pages/erp/production/hub/shopFloorTypes";

interface ShopFloorScmModalsProps {
  project: any;
  totalTargetQty: number;
  enrichedProcesses: any[];
  itemsCatalog: any[];
  scmReadiness: ScmReadinessState | null;
  reservationGateError: {
    message: string;
    shortages: any[];
    can_issue_from_warehouse?: boolean;
    can_partial_wave_issue?: boolean;
  } | null;
  setReservationGateError: (val: any) => void;
  setPendingGateTransition: (val: any) => void;
  isIssuingScmMaterial: boolean;
  handleIssueMaterialToFloor: (
    mode: "FULL_WAVE" | "PARTIAL_WAVE",
    bomId?: string
  ) => Promise<void>;
  showScmStudioModal: boolean;
  setShowScmStudioModal: (val: boolean) => void;
  subTargetBomItem: any | null;
  setSubTargetBomItem: (val: any | null) => void;
  subSelectedItemId: string;
  setSubSelectedItemId: (val: string) => void;
  subQtyInput: number;
  setSubQtyInput: (val: number) => void;
  subNotesInput: string;
  setSubNotesInput: (val: string) => void;
  isSubmittingConcession: boolean;
  handleEngineeringConcession: (
    bomId: string,
    action: "SUBSTITUTE_MATERIAL" | "DEFER_FITMENT" | "RESOLVE_DEFERRED_FITMENT",
    extra?: any
  ) => Promise<void>;
  handleAssignPointOfUse: (bomId: string, bopProcessId: string) => Promise<void>;
  selectedWotForGenealogy: any | null;
  setSelectedWotForGenealogy: (val: any | null) => void;
}

export const ShopFloorScmModals: React.FC<ShopFloorScmModalsProps> = React.memo(({
  project,
  totalTargetQty,
  enrichedProcesses,
  itemsCatalog,
  scmReadiness,
  reservationGateError,
  setReservationGateError,
  setPendingGateTransition,
  isIssuingScmMaterial,
  handleIssueMaterialToFloor,
  showScmStudioModal,
  setShowScmStudioModal,
  subTargetBomItem,
  setSubTargetBomItem,
  subSelectedItemId,
  setSubSelectedItemId,
  subQtyInput,
  setSubQtyInput,
  subNotesInput,
  setSubNotesInput,
  isSubmittingConcession,
  handleEngineeringConcession,
  handleAssignPointOfUse,
  selectedWotForGenealogy,
  setSelectedWotForGenealogy,
}) => {
  return (
    <>
      {/* MODAL: SCM WAREHOUSE MATERIAL SUPPLY & POINT-OF-USE GATE */}
      <Modal
        isOpen={Boolean(reservationGateError)}
        onClose={() => {
          setReservationGateError(null);
          setPendingGateTransition(null);
        }}
        title="SCM Point-of-Use & Wave Quota Interlock"
        maxWidth="3xl"
      >
        {reservationGateError && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                <span>Material Stock Ceiling Reached for This Process</span>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                {reservationGateError.message}
              </p>
              {reservationGateError.shortages.length > 0 && (
                <div className="p-2.5 rounded-lg bg-white border border-rose-200 space-y-2 text-[11px] font-mono tabular-nums text-stone-800">
                  {reservationGateError.shortages.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1.5 border-b border-stone-100 last:border-none last:pb-0"
                    >
                      <div>
                        <span className="font-bold text-stone-900">
                          [{s.item_code || "BOM"}] {s.item_name}
                        </span>
                        {s.bop_process_name && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[10px]">
                            POU: {s.bop_process_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-rose-700 font-bold">
                          Floor: {s.supplied_to_floor_qty ?? 0}/{s.required_qty} · Warehouse:{" "}
                          {s.available_in_warehouse_to_issue ?? s.available_stock ?? 0}
                        </span>
                        {s.bom_id && (
                          <button
                            type="button"
                            onClick={() =>
                              handleEngineeringConcession(s.bom_id!, "DEFER_FITMENT", {
                                concession_notes:
                                  "Deferred Fitment — Must be fulfilled prior to Final QC & FGR",
                              })
                            }
                            className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold border border-amber-300 cursor-pointer"
                          >
                            Defer Fitment
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReservationGateError(null);
                  setPendingGateTransition(null);
                }}
                className="h-9 px-3.5 text-xs"
              >
                Close
              </Button>
              {(reservationGateError.can_partial_wave_issue ||
                scmReadiness?.can_partial_wave_issue) && (
                <Button
                  type="button"
                  disabled={isIssuingScmMaterial}
                  onClick={() => handleIssueMaterialToFloor("PARTIAL_WAVE")}
                  className="h-9 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-bold"
                >
                  <Package className="w-3.5 h-3.5 mr-1.5" />
                  {isIssuingScmMaterial
                    ? "Issuing Wave..."
                    : "Supply Partial Wave from Warehouse"}
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                leftIcon={<Sliders />}
                onClick={() => {
                  setReservationGateError(null);
                  setShowScmStudioModal(true);
                }}
              >
                Open SCM Wave &amp; Concession Studio
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: ADAPTIVE STAGGERED SCM & WAVE ORCHESTRA STUDIO */}
      <Modal
        isOpen={showScmStudioModal}
        onClose={() => {
          setShowScmStudioModal(false);
          setSubTargetBomItem(null);
        }}
        title="SCM Point-of-Use, Wave & Concession Studio"
        maxWidth="7xl"
      >
        <div className="space-y-4">
          {scmReadiness?.process_producible_quotas && (
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                  Production Quota Ceiling by BOP Process Step (Point-of-Use Matrix)
                </span>
                {scmReadiness.can_partial_wave_issue && (
                  <Button
                    type="button"
                    size="xs"
                    disabled={isIssuingScmMaterial}
                    onClick={() => handleIssueMaterialToFloor("PARTIAL_WAVE")}
                    className="h-7 px-3 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-[11px] font-bold"
                  >
                    <Package className="w-3 h-3 mr-1" />
                    {isIssuingScmMaterial
                      ? "Issuing Wave..."
                      : "Issue Available Warehouse Stock (Partial Wave)"}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {enrichedProcesses.map((proc: any) => {
                  const q = scmReadiness.process_producible_quotas?.[proc.id];
                  if (!q) return null;
                  return (
                    <div
                      key={proc.id}
                      className={cn(
                        "p-2.5 rounded-lg border text-xs space-y-1",
                        !q.is_pou_unlocked
                          ? "bg-rose-50/70 border-rose-300"
                          : q.wave_ceiling_active
                          ? "bg-amber-50/70 border-amber-300"
                          : "bg-white border-stone-200"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-bold text-stone-900 truncate">
                          #{proc.step_sequence} {proc.process_name}
                        </span>
                        <span
                          className={cn(
                            "px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase shrink-0",
                            !q.is_pou_unlocked
                              ? "bg-rose-100 text-rose-800"
                              : q.wave_ceiling_active
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          )}
                        >
                          {!q.is_pou_unlocked ? "LOCKED" : q.wave_ceiling_active ? "WAVE" : "OPEN"}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-stone-600 tabular-nums">
                        Ceiling:{" "}
                        <strong className="text-stone-900">
                          {q.max_producible_qty}/{q.target_qty}
                        </strong>{" "}
                        · Done: {q.completed_qty}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Inline Substitution Form Drawer */}
          {subTargetBomItem && (
            <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-300 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                    Authorize Alternative Material Substitution (Engineering Concession)
                  </h4>
                  <p className="text-[11px] text-stone-700 mt-0.5">
                    Replace shortage of{" "}
                    <strong>
                      [{subTargetBomItem.item_code}] {subTargetBomItem.item_name}
                    </strong>{" "}
                    (Short: {subTargetBomItem.unsupplied_to_floor_qty} {subTargetBomItem.uom}) with available warehouse inventory.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubTargetBomItem(null)}
                  className="text-xs font-bold text-stone-500 hover:text-stone-900 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select
                  label="Substitute Warehouse Item *"
                  value={subSelectedItemId}
                  onChange={(e) => setSubSelectedItemId(e.target.value)}
                >
                  <option value="">-- Select Substitute Item (In Stock) --</option>
                  {itemsCatalog
                    .filter(
                      (cat: any) =>
                        cat.id !== subTargetBomItem.item_id &&
                        Number(cat.free_stock ?? cat.available_qty ?? cat.physical_qty ?? 0) > 0
                    )
                    .map((cat: any) => (
                      <option key={cat.id} value={cat.id}>
                        [{cat.item_code}] {cat.name} (Free Stock:{" "}
                        {cat.free_stock ?? cat.available_qty ?? cat.physical_qty ?? 0}{" "}
                        {cat.uom || "PCS"})
                      </option>
                    ))}
                </Select>

                <Input
                  label={`Substitute Qty (${subTargetBomItem.uom}) *`}
                  type="number"
                  min={0.1}
                  step="any"
                  value={subQtyInput}
                  onChange={(e) =>
                    setSubQtyInput(Math.max(0.1, parseFloat(e.target.value) || 1))
                  }
                  className="font-mono font-bold tabular-nums"
                />

                <Input
                  label="Engineering Concession Notes"
                  type="text"
                  value={subNotesInput}
                  onChange={(e) => setSubNotesInput(e.target.value)}
                  placeholder="e.g. Equivalent grade approved by Lead Engineer"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!subSelectedItemId || isSubmittingConcession}
                  onClick={() =>
                    handleEngineeringConcession(
                      subTargetBomItem.bom_id,
                      "SUBSTITUTE_MATERIAL",
                      {
                        substitute_item_id: subSelectedItemId,
                        substitute_qty: subQtyInput,
                        concession_notes: subNotesInput,
                      }
                    )
                  }
                >
                  {isSubmittingConcession
                    ? "Processing Substitution..."
                    : "Authorize & Supply Substitute Material"}
                </Button>
              </div>
            </div>
          )}

          {/* BOM Items Point-of-Use, Wave & Concession Table */}
          <div className="border border-stone-200 rounded-xl overflow-x-auto max-h-[440px] overflow-y-auto">
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow className="bg-stone-50 border-b border-stone-200">
                  <TableHead className="py-2.5 px-3">BOM Material</TableHead>
                  <TableHead className="py-2.5 px-3">Point-of-Use (POU) Process</TableHead>
                  <TableHead className="py-2.5 px-3">Supplied &amp; Warehouse Stock</TableHead>
                  <TableHead className="py-2.5 px-3">WOT Qty Ceiling</TableHead>
                  <TableHead className="py-2.5 px-3 text-right">
                    SCM Actions (Wave / Substitute / Defer)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-stone-200 text-xs bg-white">
                {(scmReadiness?.items || []).map((item) => {
                  const effSupplied =
                    item.effective_supplied_qty ?? item.supplied_to_floor_qty ?? 0;
                  const availWh = item.available_in_warehouse_to_issue ?? 0;
                  const isDeferredOpen =
                    item.engineering_concession_type === "DEFERRED_FITMENT" &&
                    item.deferred_status === "OPEN_DEBT";
                  const isDeferredVerified =
                    item.engineering_concession_type === "DEFERRED_FITMENT" &&
                    item.deferred_status === "INSTALLED_VERIFIED";
                  const isSubstituted = item.engineering_concession_type === "SUBSTITUTED";

                  return (
                    <TableRow key={item.bom_id} className="hover:bg-stone-50/80">
                      <TableCell className="py-2.5 px-3">
                        <div className="font-mono font-bold text-stone-900">
                          [{item.item_code}] {item.item_name}
                        </div>
                        <div className="text-[11px] font-mono text-stone-500 tabular-nums">
                          Total Required: {item.required_qty} {item.uom}
                        </div>
                        {isSubstituted && item.substitute_item_code && (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-mono font-bold">
                            Substitute: [{item.substitute_item_code}] +
                            {item.substitute_qty_supplied} {item.uom}
                          </div>
                        )}
                        {isDeferredOpen && (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-mono font-bold">
                            Deferred Fitment (Pre-FGR Debt)
                          </div>
                        )}
                        {isDeferredVerified && (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-900 text-[10px] font-mono font-bold">
                            Deferred Fitment Installed &amp; Verified
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="py-2.5 px-3">
                        <Select
                          value={item.bop_process_id || enrichedProcesses[0]?.id || ""}
                          onChange={(e) => handleAssignPointOfUse(item.bom_id, e.target.value)}
                          wrapperClassName="max-w-[210px]"
                          className="h-8 text-xs font-semibold"
                        >
                          {enrichedProcesses.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              #{String(p.step_sequence).padStart(2, "0")} {p.process_name}
                            </option>
                          ))}
                        </Select>
                      </TableCell>

                      <TableCell className="py-2.5 px-3 font-mono tabular-nums">
                        <div className="font-bold text-stone-900">
                          Floor: {effSupplied} / {item.required_qty} {item.uom} (
                          {item.wave_coverage_pct ?? 0}%)
                        </div>
                        <div className="text-[11px] text-stone-600">
                          Warehouse Available:{" "}
                          <strong className={availWh > 0 ? "text-emerald-700" : "text-stone-500"}>
                            {availWh} {item.uom}
                          </strong>
                        </div>
                        <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden mt-1">
                          <div
                            className={cn(
                              "h-full",
                              (item.wave_coverage_pct ?? 0) >= 100 || isDeferredVerified
                                ? "bg-emerald-600"
                                : isDeferredOpen
                                ? "bg-amber-500"
                                : (item.wave_coverage_pct ?? 0) > 0
                                ? "bg-blue-600"
                                : "bg-rose-500"
                            )}
                            style={{
                              width: `${Math.max(4, item.wave_coverage_pct ?? 0)}%`,
                            }}
                          />
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 px-3 font-mono tabular-nums">
                        <div
                          className={cn(
                            "text-xs font-bold",
                            (item.max_producible_units ?? 0) >= totalTargetQty
                              ? "text-emerald-700"
                              : (item.max_producible_units ?? 0) > 0
                              ? "text-amber-700"
                              : "text-rose-700"
                          )}
                        >
                          {item.max_producible_units ?? 0} / {totalTargetQty}{" "}
                          {project?.uom || "UNIT"}
                        </div>
                        <div className="text-[10px] text-stone-500">
                          {isDeferredOpen
                            ? "Bypassed (Must Fulfill Pre-FGR)"
                            : (item.max_producible_units ?? 0) >= totalTargetQty
                            ? "Full Quota Unlocked"
                            : "Auto Stock Ceiling"}
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 px-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {availWh > 0 && effSupplied < item.required_qty && (
                            <button
                              type="button"
                              disabled={isIssuingScmMaterial}
                              onClick={() =>
                                handleIssueMaterialToFloor("PARTIAL_WAVE", item.bom_id)
                              }
                              className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-bold cursor-pointer"
                            >
                              Supply Wave (+{availWh})
                            </button>
                          )}

                          {effSupplied < item.required_qty && !isDeferredVerified && (
                            <button
                              type="button"
                              onClick={() => {
                                setSubTargetBomItem(item);
                                setSubQtyInput(
                                  Math.max(1, Number(item.unsupplied_to_floor_qty) || 1)
                                );
                                setSubNotesInput("");
                              }}
                              className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-[11px] font-bold cursor-pointer"
                            >
                              Substitute
                            </button>
                          )}

                          {effSupplied < item.required_qty &&
                            !isDeferredOpen &&
                            !isDeferredVerified && (
                              <button
                                type="button"
                                disabled={isSubmittingConcession}
                                onClick={() =>
                                  handleEngineeringConcession(item.bom_id, "DEFER_FITMENT", {
                                    concession_notes:
                                      "Deferred Fitment — Must be fulfilled prior to Final QC & FGR",
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-bold cursor-pointer"
                              >
                                Defer Fitment
                              </button>
                            )}

                          {isDeferredOpen && (
                            <button
                              type="button"
                              disabled={isSubmittingConcession}
                              onClick={() =>
                                handleEngineeringConcession(
                                  item.bom_id,
                                  "RESOLVE_DEFERRED_FITMENT",
                                  {
                                    concession_notes:
                                      "Deferred material supplied and verified installed prior to FGR",
                                  }
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-bold cursor-pointer"
                              title="Fulfill deferred component and verify installation to unlock FGR"
                            >
                              Verify Fitment (Pre-FGR)
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </Modal>

      {/* MODAL: WOT DIGITAL PASSPORT (GENEALOGY) */}
      {selectedWotForGenealogy && (
        <WotGenealogyModal
          isOpen={Boolean(selectedWotForGenealogy)}
          onClose={() => setSelectedWotForGenealogy(null)}
          wot={selectedWotForGenealogy}
        />
      )}
    </>
  );
});
