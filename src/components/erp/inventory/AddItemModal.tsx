import React, { useEffect, useMemo } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  getCategoryPrefix,
  extractItemMiddleCode,
  formatSequence3,
  getNextCategorySequence,
  generateSmartSku,
} from "@/utils/autoCoding";

export interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  newItem: any;
  setNewItem: React.Dispatch<React.SetStateAction<any>>;
  onSubmit: (e?: React.FormEvent | any) => void;
  isSubmitting: boolean;
  existingItems?: any[];
  manpowerRoster?: any[];
  user?: any;
}

const DEFAULT_MANPOWER_OPERATORS = [
  "Bambang Sudirman",
  "Agus Pratama",
  "Dedi Supriyanto",
  "Rian Hidayat",
  "Hendra Wijaya",
  "Fajar Nugroho",
  "Eko Prasetyo",
  "Wahyu Santoso",
];

export function formatSkuSlug(name: string): string {
  return (name || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function generateAutoSku(
  type: string,
  name: string,
  sequenceNumber = 1
): string {
  return generateSmartSku(type, name, sequenceNumber);
}

export function AddItemModal({
  isOpen,
  onClose,
  newItem,
  setNewItem,
  onSubmit,
  isSubmitting,
  existingItems = [],
  manpowerRoster = [],
  user,
}: AddItemModalProps) {
  const [showBypassAudit, setShowBypassAudit] = React.useState(false);
  const [bypassReason, setBypassReason] = React.useState("");

  const isSalesRestricted =
    user?.role === "SALES" &&
    !["ADMIN", "SUPERADMIN", "FC", "BOD", "DIRECTOR"].includes(
      (user?.role || "").toUpperCase()
    );

  const currentType = isSalesRestricted
    ? "FINISH_GOOD"
    : newItem.type || "FINISH_GOOD";
  const categoryPrefix = getCategoryPrefix(currentType);

  const operatorOptions = useMemo(() => {
    const names = new Set<string>(DEFAULT_MANPOWER_OPERATORS);
    (manpowerRoster || []).forEach((mp: any) => {
      const n = String(mp?.name || mp?.employee_name || mp?.full_name || mp?.username || "").trim();
      if (n) names.add(n);
    });
    return Array.from(names);
  }, [manpowerRoster]);

  const operatorMachineLockMap = useMemo(() => {
    const map: Record<string, string> = {};
    (existingItems || []).forEach((item: any) => {
      if (!item) return;
      const isItemMachine =
        item.type === "MACHINE" ||
        item.item_type === "MACHINE" ||
        Boolean(item.machine_category) ||
        Boolean(item.item_code && String(item.item_code).toUpperCase().startsWith("MC"));
      if (isItemMachine && item.assigned_operator) {
        const opKey = String(item.assigned_operator).trim().toLowerCase();
        map[opKey] = `${item.item_code} (${item.name})`;
      }
    });
    return map;
  }, [existingItems]);

  const currentAssignedOp = String(newItem.assigned_operator || "").trim();
  const isMachineActive = Boolean(currentAssignedOp);

  const nextCategorySeq = useMemo(
    () => getNextCategorySequence(currentType, existingItems),
    [currentType, existingItems]
  );

  const extractedMiddle = useMemo(
    () => extractItemMiddleCode(newItem.name || ""),
    [newItem.name]
  );

  const computedLiveSku = useMemo(
    () => generateSmartSku(currentType, newItem.name || "", nextCategorySeq),
    [currentType, newItem.name, nextCategorySeq]
  );

  // Sync system-generated SKU into newItem.item_code whenever modal opens or name/type changes
  useEffect(() => {
    if (!isOpen) return;
    if (isSalesRestricted && newItem.type !== "FINISH_GOOD") {
      setNewItem((prev: any) => ({
        ...prev,
        type: "FINISH_GOOD",
      }));
      return;
    }
    if (newItem.item_code !== computedLiveSku) {
      setNewItem((prev: any) => ({
        ...prev,
        item_code: computedLiveSku,
      }));
    }
  }, [isOpen, computedLiveSku, isSalesRestricted, newItem.type]);

  const isFinishGood =
    currentType === "FINISH_GOOD" ||
    currentType === "FINISHED" ||
    currentType === "FINISH_GOODS";
  const isMachine = currentType === "MACHINE";

  const hasName = Boolean((newItem.name || "").trim() && extractedMiddle);
  const hasUom = Boolean((newItem.uom || "").trim());

  // Real-time Duplicate Detection against existing Master Inventory
  const duplicateAnalysis = useMemo(() => {
    const norm = (val: any) =>
      String(val || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    const inputName = norm(newItem.name);
    const inputDim = norm(newItem.dimension);
    const inputSpec = norm(newItem.spec);

    if (!inputName || inputName.length < 2) {
      return { exactMatch: null as any, similarMatches: [] as any[] };
    }

    let exactMatch: any = null;
    const similarMatches: any[] = [];

    for (const item of existingItems || []) {
      if (!item) continue;
      const exName = norm(item.name);
      const exDim = norm(item.dimension);
      const exSpec = norm(item.spec);

      if (!exName) continue;

      const isSameName = exName === inputName;
      const isSameDim = exDim === inputDim;
      const isSameSpec = exSpec === inputSpec;

      if (isSameName && isSameDim && isSameSpec) {
        exactMatch = item;
        continue;
      }

      const isNameOverlap =
        isSameName ||
        (inputName.length >= 4 &&
          (exName.includes(inputName) || inputName.includes(exName)));

      if (isNameOverlap) {
        similarMatches.push(item);
      }
    }

    return {
      exactMatch,
      similarMatches: similarMatches.slice(0, 3),
    };
  }, [existingItems, newItem.name, newItem.dimension, newItem.spec]);

  // Handle Type Change
  const handleTypeChange = (newType: string) => {
    const nextSeq = getNextCategorySequence(newType, existingItems);
    const nextCode = generateSmartSku(newType, newItem.name || "", nextSeq);

    setNewItem({
      ...newItem,
      type: newType,
      item_code: nextCode,
    });
  };

  // Handle Name Change with live automatic SKU formatting
  const handleNameChange = (newName: string) => {
    const nextCode = generateSmartSku(currentType, newName, nextCategorySeq);
    setNewItem({
      ...newItem,
      name: newName,
      item_code: nextCode,
    });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateAnalysis.exactMatch) {
      return;
    }
    const finalCode = generateSmartSku(
      currentType,
      newItem.name || "",
      nextCategorySeq
    );
    const itemToSubmit = {
      ...newItem,
      item_code: finalCode,
      operational_status: isMachine ? (currentAssignedOp ? "ACTIVE" : "INACTIVE") : newItem.operational_status,
      bypass_reason: showBypassAudit ? bypassReason : undefined,
    };
    setNewItem(itemToSubmit);
    onSubmit(itemToSubmit);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Item"
      description="Add a new SKU to the master inventory list with system-generated smart coding"
      maxWidth="2xl"
      contentClassName="p-0 border-t border-stone-100"
    >
      <form
        onSubmit={handleFormSubmit}
        className="p-6 space-y-4"
      >
        {isSalesRestricted && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs flex items-center justify-between text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">
                Sales Access: Item registration is restricted exclusively to Finished Goods (FG).
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white/90 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 shrink-0 ml-2">
              FG Policy
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Type of item"
            required
            disabled={isSalesRestricted}
            value={currentType}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            {isSalesRestricted ? (
              <option value="FINISH_GOOD">Finish Good (FG - XXX - 001)</option>
            ) : (
              <>
                <option value="FINISH_GOOD">Finish Good (FG - XXX - 001)</option>
                <option value="RAW">Raw Material (RW - XXX - 001)</option>
                <option value="CONSUMABLE">Consumable (CS - XXX - 001)</option>
                <option value="TOOL">Tool / Equipment (TL - XXX - 001)</option>
                <option value="SPAREPART">Sparepart (SP - XXX - 001)</option>
                <option value="GENERAL">General (GN - XXX - 001)</option>
              </>
            )}
          </Select>

          <Input
            label="Item Name"
            required
            value={newItem.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={
              isFinishGood
                ? "e.g. Pin Mixer K300"
                : isMachine
                ? "e.g. Hydraulic Press 50T"
                : "e.g. Mild Steel Plate"
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-stone-700">
                Item Code (SKU) · System Generated
              </label>
              <span className="text-[10px] font-mono tabular-nums text-stone-500">
                Seq #{formatSequence3(nextCategorySeq)}
              </span>
            </div>
            <Input
              required
              readOnly
              tabIndex={-1}
              value={computedLiveSku}
              className="font-mono tabular-nums uppercase font-bold bg-stone-100/80 text-stone-800 border-stone-200 cursor-not-allowed select-all"
            />
          </div>

          <Input
            label="Unit (UOM)"
            required
            value={newItem.uom}
            onChange={(e) =>
              setNewItem({ ...newItem, uom: e.target.value.toUpperCase() })
            }
            placeholder={isMachine ? "UNIT" : isFinishGood ? "PCS / M2" : "KG, PCS, M2"}
            className="uppercase font-mono font-bold"
          />
        </div>

        {/* Real-time Smart Coding Breakdown & Standardization Card */}
        <div className="p-3 bg-stone-50 border border-stone-200/90 rounded-xl space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
              Smart SKU Formula Breakdown
            </span>
            <span className="text-[11px] font-mono tabular-nums text-stone-600">
              {categoryPrefix} · {extractedMiddle || "___"} · {formatSequence3(nextCategorySeq)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span className="text-stone-700 font-medium font-mono tabular-nums">
                Prefix: {categoryPrefix} (Seq #{formatSequence3(nextCategorySeq)})
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <CheckCircle2
                className={`w-3.5 h-3.5 shrink-0 ${
                  hasName ? "text-emerald-600" : "text-stone-300"
                }`}
              />
              <span className={hasName ? "text-stone-700 font-medium font-mono" : "text-stone-400"}>
                {hasName ? `Key Code: ${extractedMiddle}` : "Type Item Name..."}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <CheckCircle2
                className={`w-3.5 h-3.5 shrink-0 ${
                  hasUom ? "text-emerald-600" : "text-stone-300"
                }`}
              />
              <span className={hasUom ? "text-stone-700 font-medium font-mono" : "text-stone-400"}>
                {hasUom ? `UOM: ${newItem.uom}` : "UOM Required"}
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Dimension (Optional)"
            value={newItem.dimension || ""}
            onChange={(e) =>
              setNewItem({ ...newItem, dimension: e.target.value })
            }
            placeholder="e.g. 1200x2400mm"
          />
          <Input
            label="Specification (Optional)"
            value={newItem.spec || ""}
            onChange={(e) =>
              setNewItem({ ...newItem, spec: e.target.value })
            }
            placeholder="e.g. ASTM A36"
          />
        </div>

        {/* Real-Time Duplicate SKU Detection Alert */}
        {duplicateAnalysis.exactMatch && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-rose-800 font-bold">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Exact Duplicate Specification Detected in Master Inventory</span>
            </div>
            <p className="text-[11px] text-rose-700">
              An identical item with the same Name, Dimension, and Specification is already registered as{" "}
              <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-rose-200">
                {duplicateAnalysis.exactMatch.item_code}
              </span>{" "}
              ({duplicateAnalysis.exactMatch.name}
              {duplicateAnalysis.exactMatch.dimension ? ` · ${duplicateAnalysis.exactMatch.dimension}` : ""}
              {duplicateAnalysis.exactMatch.spec ? ` · ${duplicateAnalysis.exactMatch.spec}` : ""}). Please use the existing SKU or specify a distinct dimension/spec.
            </p>
          </div>
        )}

        {!duplicateAnalysis.exactMatch && duplicateAnalysis.similarMatches.length > 0 && (
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-amber-800 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Similar Registered SKUs Found — Verify Before Registering</span>
            </div>
            <div className="space-y-1 pt-0.5">
              {duplicateAnalysis.similarMatches.map((sim: any) => (
                <div
                  key={sim.id || sim.item_code}
                  className="flex items-center justify-between text-[11px] bg-white/90 px-2.5 py-1.5 rounded-lg border border-amber-200/70 text-stone-700"
                >
                  <span className="truncate">
                    <strong className="font-mono text-stone-900">{sim.item_code}</strong> · {sim.name}
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono shrink-0 ml-2">
                    {sim.dimension || "No Dim"} · {sim.spec || "Std Spec"} ({sim.uom || "PCS"})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {newItem.type === "MACHINE" && (
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-stone-900 uppercase tracking-widest">
                Configuration Machine
              </h4>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                  isMachineActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-stone-100 text-stone-500 border-stone-200"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isMachineActive ? "bg-emerald-500" : "bg-stone-400"
                  }`}
                />
                {isMachineActive ? "ACTIVE · Production Ready" : "INACTIVE · Unassigned"}
              </span>
            </div>

            <div className="p-3 bg-white border border-stone-200 rounded-xl space-y-2">
              <Select
                label="Assign Man Power (1-to-1 Operator Lock)"
                value={currentAssignedOp}
                onChange={(e) => {
                  const selectedOp = e.target.value;
                  setNewItem({
                    ...newItem,
                    assigned_operator: selectedOp,
                    operational_status: selectedOp ? "ACTIVE" : "INACTIVE",
                    machine_status: selectedOp ? "ASSIGNED" : "AVAILABLE",
                  });
                }}
              >
                <option value="">-- Unassigned (Machine Inactive) --</option>
                {operatorOptions.map((opName) => {
                  const lockedByMachine = operatorMachineLockMap[opName.toLowerCase()];
                  return (
                    <option
                      key={opName}
                      value={opName}
                      disabled={Boolean(lockedByMachine)}
                    >
                      {opName}
                      {lockedByMachine ? ` — Locked on ${lockedByMachine}` : " — Available"}
                    </option>
                  );
                })}
              </Select>
              <p className="text-[11px] text-stone-500">
                Assigning an operator activates this machine for selection in Production Hub. Each active machine requires 1 dedicated operator.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Machine Category"
                value={newItem.machine_category || ""}
                onChange={(e) => setNewItem({ ...newItem, machine_category: e.target.value })}
              >
                <option value="">Select Category</option>
                <option value="CUTTING">Cutting</option>
                <option value="BENDING">Bending</option>
                <option value="WELDING">Welding</option>
                <option value="MILLING">Milling</option>
                <option value="DRILLING">Drilling</option>
                <option value="ASSEMBLY">Assembly</option>
                <option value="QC">QC</option>
                <option value="PACKING">Packing</option>
                <option value="CUSTOM">Custom</option>
              </Select>
              <Input
                label="Manufacturer"
                type="text"
                value={newItem.manufacturer || ""}
                onChange={(e) => setNewItem({ ...newItem, manufacturer: e.target.value })}
                placeholder="e.g. Haas"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Serial Number"
                type="text"
                value={newItem.serial_number || ""}
                onChange={(e) => setNewItem({ ...newItem, serial_number: e.target.value })}
                placeholder="e.g. SN-12345"
              />
              <Input
                label="Model / Spec"
                type="text"
                value={newItem.spec || ""}
                onChange={(e) => setNewItem({ ...newItem, spec: e.target.value })}
                placeholder="e.g. Model V3"
              />
            </div>
            
            <div className="pt-2 border-t border-stone-200 flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-stone-700">Allow Multi-Station Assignment (Bypass)</label>
                <p className="text-[10px] text-stone-500">Enable this if the machine/tool can be assigned to multiple stations concurrently.</p>
              </div>
              <input
                type="checkbox"
                checked={newItem.bypass_multi_station || false}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setNewItem({ ...newItem, bypass_multi_station: checked });
                  setShowBypassAudit(checked);
                }}
                className="w-5 h-5 rounded text-stone-900 focus:ring-stone-500"
              />
            </div>
            
            {showBypassAudit && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl mt-3 space-y-2 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 text-rose-800">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Bypass Audit Required</span>
                </div>
                <p className="text-[10px] text-rose-600 font-medium">Bypassing multi-station locks breaks Planning Constraints. Provide an operational reason to log this in the Production Logger (Section 16.9).</p>
                <textarea 
                  value={bypassReason}
                  onChange={(e) => setBypassReason(e.target.value)}
                  placeholder="e.g. This is a portable hand-drill used across multiple stations"
                  className="w-full px-3 py-2 text-xs bg-white border border-rose-200 rounded-lg outline-none focus:ring-1 focus:ring-rose-500"
                  rows={2}
                  required
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-6 border-t border-stone-100">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs font-bold"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            disabled={isSubmitting || Boolean(duplicateAnalysis.exactMatch)}
            className="text-xs font-bold"
          >
            Register Item
          </Button>
        </div>
      </form>
    </Modal>
  );
}
        
