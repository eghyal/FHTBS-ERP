import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Save } from "lucide-react";

interface SavePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  rowsLength: number;
  name: string;
  description: string;
  setName: (name: string) => void;
  setDescription: (desc: string) => void;
  handleSavePresetConfirm: () => void;
}

export const SavePresetModal: React.FC<SavePresetModalProps> = ({
  isOpen,
  onClose,
  rowsLength,
  name,
  description,
  setName,
  setDescription,
  handleSavePresetConfirm,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title="Save BOM as Preset / Template"
    >
      <div className="space-y-4">
        <p className="text-xs text-stone-600">
          Save the current Bill of Materials structure ({rowsLength} components) as a Preset so it can be reused instantly in future projects.
        </p>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
            BOM Preset Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
            placeholder="e.g. Standard Electrical Panel 200kW"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
            Description / Notes (Optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-xs font-medium text-stone-800 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
            rows={2}
            placeholder="Target specifications or preset purpose..."
          />
        </div>

        <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSavePresetConfirm}
            className="bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Save Preset
          </Button>
        </div>
      </div>
    </Modal>
  );
};
