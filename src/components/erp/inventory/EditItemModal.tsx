import React from "react";
import { AlertTriangle, Edit, Sparkles, CheckCircle2, ShieldCheck, Cpu } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { generateAutoSku } from "./AddItemModal";

export interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  editItem: any;
  setEditItem: React.Dispatch<React.SetStateAction<any>>;
  onSubmit: (e: React.FormEvent) => void;
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

export function EditItemModal({
  isOpen,
  onClose,
  editItem,
  setEditItem,
  onSubmit,
  isSubmitting,
  existingItems = [],
  manpowerRoster = [],
  user,
}: EditItemModalProps) {
  if (!editItem) return null;

  const isSalesRestricted =
    user?.role === "SALES" &&
    !["SUPERADMIN", "DEVELOPER", "DIRECTOR"].includes(user?.role);
  const isFinishGood =
    editItem.type === "FINISH_GOOD" ||
    editItem.type === "FINISHED" ||
    editItem.type === "FINISH_GOODS";
  const isMachine = editItem.type === "MACHINE" || editItem.item_type === "MACHINE";
  const sku = (editItem.item_code || "").trim().toUpperCase();

  // Merge manpower roster with default operators
  const operatorOptions = React.useMemo(() => {
    const names = new Set<string>(DEFAULT_MANPOWER_OPERATORS);
    (manpowerRoster || []).forEach((mp: any) => {
      const n = String(mp?.name || mp?.employee_name || mp?.full_name || mp?.username || "").trim();
      if (n) names.add(n);
    });
    if (editItem?.assigned_operator) {
      names.add(String(editItem.assigned_operator).trim());
    }
    return Array.from(names);
  }, [manpowerRoster, editItem?.assigned_operator]);

  // Map operators already locked to other machines (1-to-1 lock)
  const operatorMachineLockMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    (existingItems || []).forEach((item: any) => {
      if (!item || item.id === editItem.id) return;
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
  }, [existingItems, editItem.id]);

  const currentAssignedOp = String(editItem.assigned_operator || "").trim();
  const isMachineActive = Boolean(currentAssignedOp);

  const isPrefixValid = isFinishGood
    ? sku.startsWith("FG - ") || sku.startsWith("FG-")
    : isMachine
    ? sku.startsWith("MC - ") || sku.startsWith("MC-")
    : true;

  const handleManualRegenerateSku = () => {
    const generated = generateAutoSku(editItem.type, editItem.name || "");
    setEditItem({
      ...editItem,
      item_code: generated,
    });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCode = (editItem.item_code || "").trim();
    const itemToSubmit = {
      ...editItem,
      item_code: finalCode,
      operational_status: isMachine ? (currentAssignedOp ? "ACTIVE" : "INACTIVE") : editItem.operational_status,
    };
    setEditItem(itemToSubmit);
    onSubmit(e);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Edit className="w-5 h-5 text-stone-700" />
          <span>{isMachine ? "Configuration Machine" : "Edit Item / SKU Master Data"}</span>
        </div>
      }
      description={`Update specifications and master record for ${editItem.item_code || "item"}`}
      maxWidth="2xl"
      contentClassName="p-0 border-t border-stone-100"
    >
      <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
        {isSalesRestricted && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold">Sales Access Notice:</span> Specifications for Finished Goods can be updated here. Commercial selling prices are governed strictly via <strong>Shop Management</strong> (single source of truth).
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Asset Class / Type"
            required
            value={isSalesRestricted ? "FINISH_GOOD" : (editItem.type || "RAW")}
            disabled={isSalesRestricted}
            onChange={(e) => {
              if (isSalesRestricted) return;
              const newType = e.target.value;
              setEditItem({ ...editItem, type: newType });
            }}
          >
            {isSalesRestricted ? (
              <option value="FINISH_GOOD">Finished Good (FG)</option>
            ) : (
              <>
                <option value="FINISH_GOOD">Finished Good (FG)</option>
                <option value="RAW">Raw Material (RW)</option>
                <option value="MACHINE">Machine Asset (MC)</option>
                <option value="CONSUMABLE">Consumable (CS)</option>
                <option value="TOOL">Tool / Equipment (TL)</option>
                <option value="SPAREPART">Sparepart (SP)</option>
                <option value="GENERAL">General (GN)</option>
              </>
            )}
          </Select>

          <Input
            label="Item Name"
            required
            value={editItem.name || ""}
            onChange={(e) =>
              setEditItem({ ...editItem, name: e.target.value })
            }
            placeholder="e.g. Mild Steel Plate"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Item Code (SKU) · System Locked
            </label>
            <Input
              required
              readOnly
              tabIndex={-1}
              value={editItem.item_code || ""}
              className="font-mono tabular-nums uppercase font-bold bg-stone-100/80 text-stone-800 border-stone-200 cursor-not-allowed select-all"
            />
          </div>

          <Input
            label="Unit (UOM)"
            required
            value={editItem.uom || ""}
            onChange={(e) =>
              setEditItem({ ...editItem, uom: e.target.value.toUpperCase() })
            }
            placeholder="e.g. PCS, KG, M"
            className="uppercase font-mono font-bold"
          />
        </div>

        {/* Validation Checklist Indicator */}
        <div className="p-3 bg-stone-50 border border-stone-200/90 rounded-xl space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
              Asset Format Validation
            </span>
            {isFinishGood ? (
              <span className="inline-flex items-center text-[10px] font-bold text-stone-700 bg-stone-100/90 border border-stone-200/90 px-2 py-0.5 rounded-md">
                Finish Goods Policy (FG - ...)
              </span>
            ) : isMachine ? (
              <span className="inline-flex items-center text-[10px] font-bold text-stone-700 bg-stone-100/90 border border-stone-200/90 px-2 py-0.5 rounded-md">
                Machine Asset Policy (MC - ...)
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <CheckCircle2
              className={`w-3.5 h-3.5 shrink-0 ${
                isPrefixValid && sku ? "text-emerald-600" : "text-amber-500"
              }`}
            />
            <span className={isPrefixValid && sku ? "text-stone-700 font-medium" : "text-amber-700 font-bold"}>
              {isFinishGood
                ? isPrefixValid && sku
                  ? "Prefix 'FG - ' Standard Compliant"
                  : "Warning: Finish Goods item code must begin with 'FG - '"
                : isMachine
                ? isPrefixValid && sku
                  ? "Prefix 'MC - ' Standard Compliant"
                  : "Warning: Machine item code must begin with 'MC - '"
                : "Standard SKU Format Valid"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Dimension"
            value={editItem.dimension || ""}
            onChange={(e) =>
              setEditItem({ ...editItem, dimension: e.target.value })
            }
            placeholder="e.g. 1200x2400x10mm"
          />
          <Input
            label="Specification"
            value={editItem.spec || ""}
            onChange={(e) =>
              setEditItem({ ...editItem, spec: e.target.value })
            }
            placeholder="e.g. ASTM A36 / SS400"
          />
        </div>

        {isMachine && (
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
                  setEditItem({
                    ...editItem,
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
                value={editItem.machine_category || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, machine_category: e.target.value })
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
                value={editItem.manufacturer || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, manufacturer: e.target.value })
                }
                placeholder="e.g. Haas"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Serial Number"
                type="text"
                value={editItem.serial_number || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, serial_number: e.target.value })
                }
                placeholder="e.g. SN-12345"
              />
              <Input
                label="Model / Spec"
                type="text"
                value={editItem.spec || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, spec: e.target.value })
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
                  Enable this if the machine/tool can be assigned across multiple stations concurrently.
                </p>
              </div>
              <input
                type="checkbox"
                checked={!!editItem.bypass_multi_station}
                onChange={(e) =>
                  setEditItem({ ...editItem, bypass_multi_station: e.target.checked })
                }
                className="w-5 h-5 rounded text-stone-900 focus:ring-stone-500"
              />
            </div>
          </div>
        )}

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
            className="text-xs font-bold"
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
