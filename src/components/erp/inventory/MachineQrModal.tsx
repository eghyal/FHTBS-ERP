import React from "react";
import { WarehouseLabelModal } from "./WarehouseLabelModal";

export interface MachineQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: any | null;
}

export const MachineQrModal: React.FC<MachineQrModalProps> = ({
  isOpen,
  onClose,
  machine,
}) => {
  return (
    <WarehouseLabelModal
      isOpen={isOpen && !!machine}
      onClose={onClose}
      selectedLabelItem={machine}
    />
  );
};

