import React from "react";
import {
  CanvaStudioEditorProps,
  DEPARTMENT_ROUTING_CONFIG,
  OFFICIAL_KOP_SURAT_BLOCK,
  LIBRARY_ITEMS,
  CATEGORY_META,
  newBlockId,
  buildBlock,
} from "./studio/config";
import { useCanvaStudioState } from "./studio/useStudioState";
import { StudioToolbar, StudioStatusBar } from "./studio/Toolbar";
import { StudioCanvas } from "./studio/Canvas";
import { LayerPanel, StudioInspector } from "./studio/LayerPanel";
import { ExportEngine, useExportEngine } from "./studio/ExportEngine";

export function CanvaStudioEditor(props: CanvaStudioEditorProps) {
  const state = useCanvaStudioState(props);
  const exportHandlers = useExportEngine(state);

  return (
    <div className="fixed inset-0 z-50 bg-stone-100 flex flex-col font-sans overflow-hidden">
      {/* 1. Top Studio Toolbar */}
      <StudioToolbar state={state} exportHandlers={exportHandlers} />

      {/* 2. Main Workspace (Interactive Canvas + Right Inspector) */}
      <div className="flex-1 flex overflow-hidden">
        <StudioCanvas state={state} />
        <LayerPanel state={state} mode="right-desktop" />
      </div>

      {/* 3. Status Bar & Floating Text Selection Toolbar */}
      <StudioStatusBar state={state} />

      {/* 4. Mobile Drawers & Quick Insert Picker */}
      <LayerPanel state={state} mode="overlays" />

      {/* 5. Export Engine & Confirmation Modals */}
      <ExportEngine state={state} exportHandlers={exportHandlers} />
    </div>
  );
}

export {
  DEPARTMENT_ROUTING_CONFIG,
  OFFICIAL_KOP_SURAT_BLOCK,
  LIBRARY_ITEMS,
  CATEGORY_META,
  newBlockId,
  buildBlock,
  StudioToolbar,
  StudioStatusBar,
  StudioCanvas,
  LayerPanel,
  StudioInspector,
  ExportEngine,
  useExportEngine,
  useCanvaStudioState,
};
export type { CanvaStudioEditorProps };
