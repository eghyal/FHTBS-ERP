import React, { useState, useEffect, useMemo } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import {
  getCategoryPrefix,
  extractItemMiddleCode,
  formatSequence3,
  getNextCategorySequence,
  generateSmartSku,
} from "@/utils/autoCoding";

export interface MachineData {
  id?: string;
  item_code: string;
  name: string;
  type?: string;
  item_type?: string;
  machine_category?: string;
  capacity_per_hour?: number;
  assigned_operator?: string;
  operational_status?: "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "OFFLINE";
  machine_status?: string;
  serial_number?: string;
  manufacturer?: string;
  bypass_multi_station?: boolean;
  bypass_reason?: string;
  dimension?: string;
  spec?: string;
  uom?: string;
}

interface MachineRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  machineToEdit?: MachineData | null;
  existingMachines: MachineData[];
  onSuccess: () => void;
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

export function MachineRegisterModal({
  isOpen,
  onClose,
  machineToEdit,
  existingMachines = [],
  onSuccess,
}: MachineRegisterModalProps) {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manpowerRoster, setManpowerRoster] = useState<any[]>([]);
  const [showBypassAudit, setShowBypassAudit] = useState(false);
  const [bypassReason, setBypassReason] = useState("");

  const isEditing = Boolean(machineToEdit?.id);
  const currentType = "MACHINE";
  const categoryPrefix = getCategoryPrefix(currentType);

  const [newItem, setNewItem] = useState<MachineData>({
    type: "MACHINE",
    item_code: "",
    name: "",
    uom: "UNIT",
    dimension: "",
    spec: "",
    machine_category: "",
    manufacturer: "",
    serial_number: "",
    assigned_operator: "",
    operational_status: "INACTIVE",
    machine_status: "AVAILABLE",
    bypass_multi_station: false,
  });

  // Load active manpower operators for dropdown selection
  useEffect(() => {
    if (!isOpen) return;
    const fetchOperators = async () => {
      try {
        const res = await apiFetch("/api/production/manpower");
        if (res.ok && Array.isArray(res.data)) {
          setManpowerRoster(res.data);
        }
      } catch {
        // Fallback to default operator roster
      }
    };
    fetchOperators();
  }, [isOpen]);

  const operatorOptions = useMemo(() => {
    const names = new Set<string>(DEFAULT_MANPOWER_OPERATORS);
    (manpowerRoster || []).forEach((mp: any) => {
      const n = String(
        mp?.name || mp?.employee_name || mp?.full_name || mp?.username || ""
      ).trim();
      if (n) names.add(n);
    });
    return Array.from(names);
  }, [manpowerRoster]);

  const operatorMachineLockMap = useMemo(() => {
    const map: Record<string, string> = {};
    (existingMachines || []).forEach((item: any) => {
      if (!item || (isEditing && item.id === machineToEdit?.id)) return;
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
  }, [existingMachines, isEditing, machineToEdit]);

  const nextCategorySeq = useMemo(() => {
    if (isEditing && machineToEdit?.item_code) {
      const match = String(machineToEdit.item_code).match(/(\d{3,})$/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
    return getNextCategorySequence(currentType, existingMachines);
  }, [currentType, existingMachines, isEditing, machineToEdit]);

  const extractedMiddle = useMemo(
    () => extractItemMiddleCode(newItem.name || ""),
    [newItem.name]
  );

  const computedLiveSku = useMemo(
    () => generateSmartSku(currentType, newItem.name || "", nextCategorySeq),
    [currentType, newItem.name, nextCategorySeq]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (machineToEdit) {
      const hasBypass = Boolean(machineToEdit.bypass_multi_station);
      setNewItem({
        id: machineToEdit.id,
        type: "MACHINE",
        item_code:
          machineToEdit.item_code ||
          generateSmartSku("MACHINE", machineToEdit.name || "", nextCategorySeq),
        name: machineToEdit.name || "",
        uom: machineToEdit.uom || "UNIT",
        dimension: machineToEdit.dimension || "",
        spec: machineToEdit.spec || "",
        machine_category: machineToEdit.machine_category || "",
        manufacturer: machineToEdit.manufacturer || "",
        serial_number: machineToEdit.serial_number || "",
        assigned_operator: machineToEdit.assigned_operator || "",
        operational_status: machineToEdit.assigned_operator ? "ACTIVE" : "INACTIVE",
        machine_status: machineToEdit.assigned_operator ? "ASSIGNED" : "AVAILABLE",
        bypass_multi_station: hasBypass,
        capacity_per_hour: Number(machineToEdit.capacity_per_hour) || 100,
      });
      setShowBypassAudit(hasBypass);
      setBypassReason(machineToEdit.bypass_reason || "");
    } else {
      const initialCode = generateSmartSku("MACHINE", "", nextCategorySeq);
      setNewItem({
        type: "MACHINE",
        item_code: initialCode,
        name: "",
        uom: "UNIT",
        dimension: "",
        spec: "",
        machine_category: "",
        manufacturer: "",
        serial_number: "",
        assigned_operator: "",
        operational_status: "INACTIVE",
        machine_status: "AVAILABLE",
        bypass_multi_station: false,
        capacity_per_hour: 100,
      });
      setShowBypassAudit(false);
      setBypassReason("");
    }
  }, [isOpen, machineToEdit, nextCategorySeq]);

  // Sync system-generated SKU into newItem.item_code whenever name changes
  useEffect(() => {
    if (!isOpen) return;
    if (newItem.item_code !== computedLiveSku) {
      setNewItem((prev) => ({
        ...prev,
        item_code: computedLiveSku,
      }));
    }
  }, [isOpen, computedLiveSku, newItem.item_code]);

  const currentAssignedOp = String(newItem.assigned_operator || "").trim();
  const isMachineActive = Boolean(currentAssignedOp);
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

    for (const item of existingMachines || []) {
      if (!item || (isEditing && item.id === machineToEdit?.id)) continue;
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
  }, [existingMachines, newItem.name, newItem.dimension, newItem.spec, isEditing, machineToEdit]);

  const handleNameChange = (newName: string) => {
    const nextCode = generateSmartSku(currentType, newName, nextCategorySeq);
    setNewItem({
      ...newItem,
      name: newName,
      item_code: nextCode,
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateAnalysis.exactMatch) {
      return;
    }
    if (!newItem.name.trim()) {
      showToast("Item Name is required", "error");
      return;
    }

    const finalCode = generateSmartSku(
      currentType,
      newItem.name || "",
      nextCategorySeq
    );

    setIsSubmitting(true);
    try {
      const payload = {
        ...newItem,
        type: "MACHINE",
        item_type: "MACHINE",
        item_code: finalCode,
        uom: (newItem.uom || "UNIT").toUpperCase(),
        min_stock: 1,
        max_stock: 10,
        operational_status: currentAssignedOp ? "ACTIVE" : "INACTIVE",
        machine_status: currentAssignedOp ? "ASSIGNED" : "AVAILABLE",
        bypass_reason: showBypassAudit ? bypassReason : undefined,
      };

      let res;
      if (isEditing && newItem.id) {
        res = await apiFetch(`/api/inventory/items/${newItem.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch("/api/inventory/items", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        showToast(
          isEditing
            ? `Machine [${finalCode}] updated successfully`
            : `Machine [${finalCode}] registered successfully`,
          "success"
        );
        onSuccess();
        onClose();
      } else {
        showToast(res.error || "Failed to save machine record", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Network error while saving machine", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Machine" : "Register New Machine"}
      description="Add a new SKU to the master inventory list with system-generated smart coding"
      maxWidth="2xl"
      contentClassName="p-0 border-t border-stone-100"
    >
      <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Type of item"
            required
            disabled
            value="MACHINE"
            onChange={() => {}}
          >
            <option value="MACHINE">Machine (MC - XXX - 001)</option>
          </Select>

          <Input
            label="Item Name"
            required
            value={newItem.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Hydraulic Press 50T"
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
            placeholder="UNIT"
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
                    {sim.dimension || "No Dim"} · {sim.spec || "Std Spec"} ({sim.uom || "UNIT"})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Configuration Machine Block (Identical to Warehouse SKU Registration) */}
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
              onChange={(e) =>
                setNewItem({ ...newItem, machine_category: e.target.value })
              }
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
              onChange={(e) =>
                setNewItem({ ...newItem, manufacturer: e.target.value })
              }
              placeholder="e.g. Haas"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Serial Number"
              type="text"
              value={newItem.serial_number || ""}
              onChange={(e) =>
                setNewItem({ ...newItem, serial_number: e.target.value })
              }
              placeholder="e.g. SN-12345"
            />
            <Input
              label="Model / Spec"
              type="text"
              value={newItem.spec || ""}
              onChange={(e) =>
                setNewItem({ ...newItem, spec: e.target.value })
              }
              placeholder="e.g. Model V3"
            />
          </div>

          <div className="pt-2 border-t border-stone-200 flex items-center justify-between">
            <div>
              <label className="text-xs font-bold text-stone-700">
                Allow Multi-Station Assignment (Bypass)
              </label>
              <p className="text-[10px] text-stone-500">
                Enable this if the machine/tool can be assigned to multiple stations concurrently.
              </p>
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
                <span className="text-xs font-bold uppercase tracking-wider">
                  Bypass Audit Required
                </span>
              </div>
              <p className="text-[10px] text-rose-600 font-medium">
                Bypassing multi-station locks breaks Planning Constraints. Provide an operational reason to log this in the Production Logger (Section 16.9).
              </p>
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

        <div className="flex justify-end gap-3 pt-6 border-t border-stone-100">
          <Button
            type="button"
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
            {isEditing ? "Save Changes" : "Register Item"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
