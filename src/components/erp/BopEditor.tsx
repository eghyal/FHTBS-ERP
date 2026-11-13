import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  BackgroundVariant
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Plus,
  Save,
  Download,
  Upload,
  Layers,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Network,
  Workflow,
  LayoutGrid,
  PlayCircle,
  HelpCircle,
  X,
  Wrench,
  Package,
  ChevronDown,
  Send,
  Share2,
  Maximize,
  Minimize,
  Eye,
  GripVertical,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiFetch } from "@/utils/api";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { StationGroupOverlays } from "./StationGroupOverlays";
import { BopFlowNode } from "@/components/erp/BopFlowNode";
import { BopNodeInspector } from "./bop/BopNodeInspector";
import { BopMatrixView } from "./bop/BopMatrixView";
import { BopModals } from "./bop/BopModals";
import { buildBopFlowLayout, isGhostProcurementStep } from "./bop/bopLayoutEngine";
import { cn } from "@/lib/utils";
import {
  type BoPStepRow,
  type BopEngineeringEditorProps,
  type BopQcParameter,
  PRESET_TEMPLATES,
  checkHasCycle,
  resolveBopProductRole,
  formatQcParametersSummary,
  parseLegacyQcCriteriaToParameters,
} from "./bopTypes";

export { type BoPStepRow, checkHasCycle };

const nodeTypes = {
  bopStep: BopFlowNode
};

export const BopEngineeringEditor: React.FC<BopEngineeringEditorProps> = ({
  projectId,
  project,
  onRefreshProject,
  showPrintModal,
  onPrintModalClose,
  readOnly = false,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { language } = useLanguage();
  
  const [currentProjectData, setCurrentProjectData] = useState<any>(project || null);

  useEffect(() => {
    if (project) {
      setCurrentProjectData(project);
    }
  }, [project]);

  const effectiveProject = currentProjectData || project;
  const bomStatus = ((effectiveProject?.bom_status || "DRAFT") as string).toUpperCase();
  const isBomAuthorized = bomStatus === "AUTHORIZED";

  const isEngineering =
    !readOnly &&
    user?.role !== "PRODUCTION" &&
    (
      hasPermission(user, Action.MANAGE_BOM) ||
      user?.role === "ENGINEERING" ||
      user?.role === "FC" ||
      hasGodMode(user)
    );

  const [steps, setSteps] = useState<BoPStepRow[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [projectBoms, setProjectBoms] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  // ECO & Auth Modal States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showEcoModal, setShowEcoModal] = useState(false);
  const [showReviseBopModal, setShowReviseBopModal] = useState(false);
  const [showConfirmSubmitBopModal, setShowConfirmSubmitBopModal] = useState(false);
  const [ecoReason, setEcoReason] = useState("");
  const [reviseReason, setReviseReason] = useState("");
  const [isManufacturing, setIsManufacturing] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // Effect to trigger print preview modal from parent container
  useEffect(() => {
    if (showPrintModal) {
      setShowPreviewModal(true);
      if (onPrintModalClose) {
        onPrintModalClose();
      }
    }
  }, [showPrintModal, onPrintModalClose]);

  // View Mode: Flowchart vs Matrix Table
  const [viewMode, setViewMode] = useState<"FLOWCHART" | "MATRIX">("FLOWCHART");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Split-Screen Resizer State (Node Chart vs Node Inspector)
  const [splitPercent, setSplitPercent] = useState<number>(55);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState<boolean>(false);
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDraggingSplit) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const rawPct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(82, Math.max(30, Math.round(rawPct * 10) / 10));
      setSplitPercent(clamped);
      if (isInspectorCollapsed && rawPct < 84) {
        setIsInspectorCollapsed(false);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSplit(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingSplit, isInspectorCollapsed]);

  // Handle escape key for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Selected Step for Side Inspector
  const selectedStepIdsRef = useRef<string[]>([]);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const updateSelection = useCallback((ids: string[]) => {
    setSelectedStepIds((prev) => {
      // Bail out if arrays are identical
      if (prev.length === ids.length && prev.every((v) => ids.includes(v))) {
        return prev;
      }
      selectedStepIdsRef.current = ids;
      return ids;
    });
  }, []);

  const handleSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    updateSelection(nodes.map(n => n.id));
  }, [updateSelection]);



  // Modals
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showLoadPresetModal, setShowLoadPresetModal] = useState(false);
  const [showExplanationModal, setShowExplanationModal] = useState(false);
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [showStationModal, setShowStationModal] = useState(false);
  const [presetFile, setPresetFile] = useState<File | null>(null);
  const [presetFileName, setPresetFileName] = useState<string>("");

  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Add Root Node Dropdown state
  const [showAddRootDropdown, setShowAddRootDropdown] = useState(false);
  const addRootDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addRootDropdownRef.current && !addRootDropdownRef.current.contains(event.target as any)) {
        setShowAddRootDropdown(false);
      }
    };
    if (showAddRootDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showAddRootDropdown]);

  // Calculate layout coordinates for nodes (delegated to bopLayoutEngine)
  const calculateAutoLayout = useCallback(
    (stepsList: BoPStepRow[]): { nodes: Node[]; edges: Edge[] } =>
      buildBopFlowLayout({
        stepsList,
        projectBoms,
        inventoryItems,
        stations,
        machines,
        selectedStepIds: selectedStepIdsRef.current,
        onAddChild: (pId, type) => handleAddConnectedChild(pId, type),
        onAddParallel: (sId, type) => handleAddParallelBranch(sId, type),
        onDelete: (delId) => handleDeleteStep(delId),
      }),
    [projectBoms, inventoryItems, stations, machines]
  );

  // Sync React Flow whenever `steps` changes
  useEffect(() => {
    if (steps.length > 0) {
      const { nodes: newNodes, edges: newEdges } = calculateAutoLayout(steps);
      setNodes(newNodes);
      setEdges(newEdges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [steps, calculateAutoLayout]);

  // Load Work Centers & BoP data from backend
  const loadBoPData = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const [bopRes, wcRes, projRes, invRes, stationRes, machineRes] = await Promise.all([
        apiFetch(`/api/production/bop?project_id=${projectId}`, {}, user?.username),
        apiFetch("/api/work-centers", {}, user?.username),
        apiFetch(`/api/projects/${projectId}`, {}, user?.username),
        apiFetch("/api/inventory", {}, user?.username),
        apiFetch(`/api/production/projects/${projectId}/stations`, {}, user?.username),
        apiFetch("/api/setup-master/machines/availability", {}, user?.username)
      ]);

      if (wcRes.ok && Array.isArray(wcRes.data)) {
        setWorkCenters(wcRes.data);
      }
      
      let loadedStationsList: any[] = [];
      if (stationRes.ok && stationRes.data) {
        loadedStationsList = Array.isArray(stationRes.data)
          ? stationRes.data
          : Array.isArray(stationRes.data?.stations)
          ? stationRes.data.stations
          : [];
        setStations(loadedStationsList);
      }

      if (machineRes.ok && Array.isArray(machineRes.data?.machines)) {
        setMachines(machineRes.data.machines);
      }
      
      if (invRes.ok && Array.isArray(invRes.data)) {
        setInventoryItems(invRes.data);
      }
      
      if (projRes.ok && projRes.data) {
        const data = projRes.data;
        if (data.project) {
          setCurrentProjectData(data.project);
        }
        const hasActiveWorkOrders = data.work_orders?.length > 0;
        const hasStartedTasks = data.tasks?.some((t: any) => t.progress > 0);
        setIsManufacturing(hasActiveWorkOrders || hasStartedTasks || data.project?.status === "MANUFACTURING");
        
        if (data.bom && Array.isArray(data.bom)) {
          setProjectBoms(data.bom);
        }
      }

      if (bopRes.ok && Array.isArray(bopRes.data) && bopRes.data.length > 0) {
        const cleanServerRows = bopRes.data.filter((s: any) => !isGhostProcurementStep(s));
        // Check if there are unsaved local draft changes (e.g. from JSON import) before overwriting with server data
        const isUnsaved = localStorage.getItem(`bop_unsaved_${projectId}`) === "true";
        const savedDraft = localStorage.getItem(`bop_draft_${projectId}`);
        if (isUnsaved && savedDraft) {
          try {
            const parsedDraft = JSON.parse(savedDraft);
            if (Array.isArray(parsedDraft) && parsedDraft.length > 0) {
              const filteredDraft = parsedDraft.filter((d: any) => !isGhostProcurementStep(d));
              const mergedDraft = filteredDraft.map((d: any) => {
                const serverMatch = cleanServerRows.find((srv: any) => srv.id === d.id);
                const rawCandidateId = d.station_id || serverMatch?.station_id || "";
                const matchedDraftSt = loadedStationsList.find(
                  (st: any) => st.id === rawCandidateId || st.station_code === rawCandidateId
                );
                return {
                  ...d,
                  procurement_summary: serverMatch?.procurement_summary || d.procurement_summary || null,
                  station_id: matchedDraftSt ? matchedDraftSt.id : ""
                };
              });
              setSteps(mergedDraft);
              setHasUnsavedChanges(true);

              return;
            }
          } catch (e) {}
        }

        const loadedSteps = cleanServerRows.map((s: any, idx: number) => {
          let parsedBomAllocations = [];
          try {
             parsedBomAllocations = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : (s.bom_allocations || []);
          } catch (e) {}

          let parsedQcParameters: BopQcParameter[] = [];
          try {
            if (Array.isArray(s.qc_parameters)) {
              parsedQcParameters = s.qc_parameters;
            } else if (typeof s.qc_parameters_json === "string" && s.qc_parameters_json.trim()) {
              parsedQcParameters = JSON.parse(s.qc_parameters_json);
            }
          } catch (e) {}

          const isProdNode = (s.node_type || "PROCESS") === "PRODUCT";
          if (isProdNode && parsedQcParameters.length === 0 && s.qc_criteria) {
            parsedQcParameters = parseLegacyQcCriteriaToParameters(s.qc_criteria);
          }

          const matchedStation = loadedStationsList.find(
            (st: any) => st.id === s.station_id || st.station_code === s.station_id
          );
          const resolvedStationId = matchedStation ? matchedStation.id : "";

          return {
            id: s.id || `step_${Date.now()}_${idx}`,
            step_sequence: s.step_sequence || idx + 1,
            process_name: s.process_name || "",
            node_type: s.node_type || "PROCESS",
            product_role: s.product_role || null,
            work_center_id: s.work_center_id || "",
            work_center_name: s.work_center_name || "",
            execution_type: (s.predecessor_ids && s.predecessor_ids.length > 0) ? "SERIAL" : (s.execution_type || "PARALLEL"),
            predecessor_ids: Array.isArray(s.predecessor_ids)
              ? s.predecessor_ids
              : typeof s.predecessor_ids === "string"
              ? JSON.parse(s.predecessor_ids || "[]")
              : [],
            sop_instruction: s.sop_instruction || s.notes || "",
            qc_criteria: isProdNode ? (s.qc_criteria || "") : "",
            qc_parameters: isProdNode ? parsedQcParameters : [],
            notes: s.notes || "",
            bom_allocations: parsedBomAllocations,
            procurement_summary: s.procurement_summary || null,
            lifecycle_status: s.lifecycle_status || "Planned",
            status: s.status || "PENDING",
            progress: s.progress || 0,
            cycle_time_minutes: Number(s.cycle_time_minutes) || 15,
            standard_hours: Number(s.standard_hours) || 1,
            assigned_machine_id: s.assigned_machine_id || null,
            assigned_machine_ids_json: s.assigned_machine_ids_json || "[]",
            machine_efficiency_multiplier: Number(s.machine_efficiency_multiplier) || 1.0,
            setup_time_minutes: Number(s.setup_time_minutes) || 0,
            teardown_time_minutes: Number(s.teardown_time_minutes) || 0,
            station_id: resolvedStationId,
          };
        });
        setSteps(loadedSteps);
        setHasUnsavedChanges(false);
        try {
          localStorage.setItem(`bop_draft_${projectId}`, JSON.stringify(loadedSteps));
          localStorage.setItem(`bop_unsaved_${projectId}`, "false");
        } catch (e) {}
      } else {
        // Fallback: Check local storage draft backup if server returned empty
        const savedDraft = localStorage.getItem(`bop_draft_${projectId}`);
        if (savedDraft) {
          try {
            const parsedDraft = JSON.parse(savedDraft);
            if (Array.isArray(parsedDraft) && parsedDraft.length > 0) {
              const filteredDraft = parsedDraft.filter((d: any) => !isGhostProcurementStep(d));
              setSteps(filteredDraft);
              setHasUnsavedChanges(true);
              
              return;
            }
          } catch (e) {}
        }
        setSteps([]);
        setNodes([]);
        setEdges([]);
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error("Error loading BoP:", err);
      showToast("Failed to load BoP data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBoPData();
  }, [projectId]);

  // Window unload protection for unsaved BOP changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Connect two nodes (Add Predecessor / Dependency edge)
  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return;

      const targetStep = steps.find((s) => s.id === target);
      const sourceStep = steps.find((s) => s.id === source);
      if (!targetStep || !sourceStep) return;

      const currentPreds = targetStep.predecessor_ids || [];
      if (currentPreds.includes(source)) {
        showToast("Nodes are already connected.", "info");
        return;
      }

      const candidatePreds = [...currentPreds, source];
      if (checkHasCycle(target, candidatePreds, steps)) {
        showToast("Connection rejected: Circular dependency detected.", "error");
        return;
      }

      setSteps((prev) =>
        prev.map((s) => {
          if (s.id === target) {
            return {
              ...s,
              predecessor_ids: candidatePreds,
              execution_type: "SERIAL"
            };
          }
          return s;
        })
      );
      setHasUnsavedChanges(true);
      showToast(`Linked "${sourceStep.process_name || 'Node'}" to "${targetStep.process_name || 'Node'}" successfully!`, "success");
    },
    [steps, showToast]
  );

  // Click on Edge to Remove Connection
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const { source, target } = edge;
      setSteps((prev) =>
        prev.map((s) => {
          if (s.id === target) {
            const remainingPreds = (s.predecessor_ids || []).filter((id) => id !== source);
            return {
              ...s,
              predecessor_ids: remainingPreds,
              execution_type: remainingPreds.length > 0 ? "SERIAL" : "PARALLEL"
            };
          }
          return s;
        })
      );
      setHasUnsavedChanges(true);
      showToast("Dependency line removed. Process is now independent.", "info");
    },
    [showToast]
  );

  // Add a new Independent (Root / Parallel) Node
  const handleAddNewRootNode = useCallback(
    (type: "PROCESS" | "PRODUCT" = "PROCESS") => {
      const newSeq = steps.length + 1;
      const newId = `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const defaultStationId =
        type === "PROCESS" && stations.length > 0 ? stations[0].id : "";
      const newStep: BoPStepRow = {
        id: newId,
        step_sequence: newSeq,
        process_name:
          type === "PRODUCT"
            ? `Output Product Component ${newSeq}`
            : `New Process Operation ${newSeq}`,
        node_type: type,
        execution_type: "PARALLEL",
        predecessor_ids: [],
        qc_criteria: "",
        notes: "",
        expected_yield_rate: 100,
        station_id: defaultStationId,
      };

      setSteps((prev) => [...prev, newStep]);
      updateSelection([newId]);
      setHasUnsavedChanges(true);
      showToast(
        type === "PRODUCT"
          ? "New Product Output node added to canvas!"
          : "New independent process node added to canvas!",
        "success"
      );
    },
    [steps.length, stations, updateSelection, showToast]
  );

  // Add Connected Child Node (+ Seri: Menunggu parent selesai 100%)
  const handleAddConnectedChild = useCallback(
    (parentId: string, type: "PROCESS" | "PRODUCT" = "PROCESS") => {
      const parentStep = steps.find((s) => s.id === parentId);
      const newSeq = steps.length + 1;
      const newId = `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const defaultStationId =
        type === "PROCESS"
          ? parentStep?.station_id || (stations.length > 0 ? stations[0].id : "")
          : "";
      const newStep: BoPStepRow = {
        id: newId,
        step_sequence: newSeq,
        process_name:
          type === "PRODUCT"
            ? `Output Product from ${parentStep?.process_name || "Process"}`
            : `Next Step After ${parentStep?.process_name || "Process"}`,
        node_type: type,
        execution_type: "SERIAL",
        predecessor_ids: [parentId],
        qc_criteria: "",
        notes: "",
        expected_yield_rate: 100,
        station_id: defaultStationId,
      };

      setSteps((prev) => [...prev, newStep]);
      updateSelection([newId]);
      setHasUnsavedChanges(true);
      showToast(
        type === "PRODUCT"
          ? "Connected Product Output node added!"
          : "Connected sequential step added successfully!",
        "success"
      );
    },
    [steps, stations, updateSelection, showToast]
  );

  // Quick-Insert WIP / Sub-Assy (IPQC Gate) After a Process Node
  const handleInsertWipGateAfterProcess = useCallback(
    (processId: string) => {
      const procStep = steps.find((s) => s.id === processId);
      if (!procStep) return;

      const newSeq = steps.length + 1;
      const newId = `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const migratedParams = procStep.qc_criteria
        ? parseLegacyQcCriteriaToParameters(procStep.qc_criteria)
        : [
            {
              id: `QCP-${Date.now()}-1`,
              parameter_name: `Dimensional & Visual Check (${procStep.process_name || "WIP"})`,
              specification: "Per Drawing (±0.5mm), Free of surface defects",
              measurement_method: "Caliper / Visual",
              is_mandatory_gate: true,
            },
          ];

      const newWipProduct: BoPStepRow = {
        id: newId,
        step_sequence: newSeq,
        process_name: `WIP Sub-Assy: ${procStep.process_name || "Output"}`,
        node_type: "PRODUCT",
        product_role: "WIP_SUB_ASSY",
        execution_type: "SERIAL",
        predecessor_ids: [processId],
        qc_parameters: migratedParams,
        qc_criteria: formatQcParametersSummary(migratedParams, ""),
        notes: "",
        expected_yield_rate: 100,
        station_id: "",
        bom_allocations: [],
      };

      // Re-wire any direct downstream PROCESS steps that depended on `processId` so they now pass through `newWipProduct`
      setSteps((prev) => {
        const updatedExisting = prev.map((s) => {
          if (s.id === processId) {
            return { ...s, qc_criteria: "", qc_parameters: [] };
          }
          if (
            (s.node_type || "PROCESS") === "PROCESS" &&
            (s.predecessor_ids || []).includes(processId)
          ) {
            const newPreds = (s.predecessor_ids || []).map((pid) =>
              pid === processId ? newId : pid
            );
            return {
              ...s,
              predecessor_ids: Array.from(new Set(newPreds)),
              execution_type: "SERIAL" as const,
            };
          }
          return s;
        });
        return [...updatedExisting, newWipProduct];
      });

      updateSelection([newId]);
      setHasUnsavedChanges(true);
      showToast(
        `Inserted WIP / Sub-Assy (IPQC Gate) after "${procStep.process_name}"! Configure QC parameters in the inspector.`,
        "success"
      );
    },
    [steps, updateSelection, showToast]
  );

  // Add Parallel Sibling Node (+ Paralel: Berjalan mandiri bersamaan)
  const handleAddParallelBranch = useCallback(
    (siblingId: string, type: "PROCESS" | "PRODUCT" = "PROCESS") => {
      const siblingStep = steps.find((s) => s.id === siblingId);
      const newSeq = steps.length + 1;
      const newId = `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const defaultStationId =
        type === "PROCESS"
          ? siblingStep?.station_id || (stations.length > 0 ? stations[0].id : "")
          : "";
      const newStep: BoPStepRow = {
        id: newId,
        step_sequence: newSeq,
        process_name:
          type === "PRODUCT"
            ? `Parallel Product Output ${newSeq}`
            : `Independent Parallel Branch ${newSeq}`,
        node_type: type,
        execution_type: "PARALLEL",
        predecessor_ids: siblingStep?.predecessor_ids ? [...siblingStep.predecessor_ids] : [],
        qc_criteria: "",
        notes: "",
        expected_yield_rate: 100,
        station_id: defaultStationId,
      };

      setSteps((prev) => [...prev, newStep]);
      updateSelection([newId]);
      setHasUnsavedChanges(true);
      showToast(
        type === "PRODUCT"
          ? "Parallel product output created!"
          : "Parallel process branch created successfully!",
        "success"
      );
    },
    [steps, stations, updateSelection, showToast]
  );

  // Delete Step
  const handleDeleteSteps = useCallback(
    (ids: string[]) => {
      if (steps.length <= ids.length) {
        showToast("BoP must contain at least one process step.", "error");
        return;
      }

      const filtered = steps
        .filter((s) => !ids.includes(s.id))
        .map((s) => ({
          ...s,
          predecessor_ids: (s.predecessor_ids || []).filter((predId) => !ids.includes(predId)),
        }));

      const resequenced = filtered.map((s, i) => ({
        ...s,
        step_sequence: i + 1,
        execution_type:
          s.predecessor_ids && s.predecessor_ids.length > 0
            ? ("SERIAL" as const)
            : ("PARALLEL" as const),
      }));

      setSteps(resequenced);
      updateSelection([]);
      setHasUnsavedChanges(true);
      showToast(`${ids.length} process step(s) removed.`, "info");
    },
    [steps, updateSelection, showToast]
  );

  const handleDeleteStep = useCallback(
    (id: string) => {
      if (steps.length <= 1) {
        showToast("BoP must contain at least one process step.", "error");
        return;
      }

      const filtered = steps
        .filter((s) => s.id !== id)
        .map((s) => ({
          ...s,
          predecessor_ids: (s.predecessor_ids || []).filter((predId) => predId !== id),
        }));

      const resequenced = filtered.map((s, i) => ({
        ...s,
        step_sequence: i + 1,
        execution_type:
          s.predecessor_ids && s.predecessor_ids.length > 0
            ? ("SERIAL" as const)
            : ("PARALLEL" as const),
      }));

      setSteps(resequenced);
      if (selectedStepIds.includes(id)) updateSelection([]);
      setHasUnsavedChanges(true);
      showToast("Process step node removed.", "info");
    },
    [steps, selectedStepIds, updateSelection, showToast]
  );

  // Update specific step field
  const handleBulkUpdateStep = useCallback(
    (ids: string[], field: keyof BoPStepRow, val: any) => {
      if (field === "predecessor_ids" || field === "id") return;

      setSteps((prev) =>
        prev.map((s) => {
          if (!ids.includes(s.id)) return s;
          const updated = { ...s, [field]: val };
          if (field === "work_center_id") {
            const foundWc = workCenters.find((w) => w.id === val);
            if (foundWc) {
              updated.work_center_name = foundWc.name || foundWc.code;
            }
          }
          return updated;
        })
      );
      setHasUnsavedChanges(true);
    },
    [workCenters]
  );

  const handleUpdateStep = useCallback(
    (id: string, field: keyof BoPStepRow, val: any) => {
      if (field === "predecessor_ids") {
        const candidatePreds = Array.isArray(val) ? val : [];
        if (checkHasCycle(id, candidatePreds, steps)) {
          showToast("Cannot update dependencies: Circular dependency detected.", "error");
          return;
        }
      }

      setSteps((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const updated = { ...s, [field]: val };
          if (field === "work_center_id") {
            const foundWc = workCenters.find((w) => w.id === val);
            if (foundWc) {
              updated.work_center_name = foundWc.name || foundWc.code;
            }
          }
          return updated;
        })
      );
      setHasUnsavedChanges(true);
    },
    [steps, workCenters, showToast]
  );

  const handleSelectSingleStep = useCallback(
    (id: string) => {
      updateSelection([id]);
    },
    [updateSelection]
  );

  // Apply Preset Template
  const handleApplyPreset = (presetKey: string, toast = true) => {
    const template = PRESET_TEMPLATES[presetKey];
    if (!template) return;

    const baseId = Date.now();
    const idMap: string[] = template.steps.map((_, idx) => `step_${baseId}_${idx}`);

    const newSteps: BoPStepRow[] = template.steps.map((s, idx) => {
      const predIds = (s.temp_predecessor_indices || [])
        .map((pIdx) => idMap[pIdx])
        .filter(Boolean);

      return {
        id: idMap[idx],
        step_sequence: idx + 1,
        process_name: s.process_name || "",
        execution_type: predIds.length > 0 ? "SERIAL" : "PARALLEL",
        predecessor_ids: predIds,
        qc_criteria: s.qc_criteria || "Standard QC criteria",
        notes: s.notes || "",
        expected_yield_rate: 100,
        station_id: stations.length > 0 ? stations[idx % stations.length].id : "",
      };
    });

    setSteps(newSteps);
    updateSelection(newSteps[0]?.id || null ? [newSteps[0]?.id || null] : []);
    setHasUnsavedChanges(true);
    setShowPresetModal(false);
    if (toast) {
      showToast(`Template "${template.title}" loaded to flowchart canvas successfully!`, "success");
    }
  };

  // Save / Sync BoP to Database
  const handleSyncBoP = async (pin?: string, reason?: string, isDraft?: boolean) => {
    // Enforce: Cannot submit BOP for approval if BOM is not authorized yet
    if (!isDraft && !isBomAuthorized) {
      showToast(
        `Submit approval rejected: Bill of Materials (BOM) is not yet authorized (Current BOM Status: ${bomStatus}). Please use "SAVE DRAFT" to save your progress until BOM is approved.`,
        "error"
      );
      return false;
    }

    // Enforce: Station requirement (>= 1) and all processes assigned when submitting for approval
    if (!isDraft) {
      if (stations.length < 1) {
        showToast(
          "Submit Approval Failed: At least 1 workstation must be registered (>= 1) before submitting BOP for approval. Please register a workstation first.",
          "error"
        );
        setShowStationModal(true);
        return false;
      }

      const procSteps = steps.filter((s) => (s.node_type || "PROCESS") === "PROCESS");
      if (procSteps.length === 0) {
        showToast(
          "Submit Approval Failed: At least 1 manufacturing process step is required before submitting BOP for approval.",
          "error"
        );
        return false;
      }
    }

    const invalidSteps = steps.filter((s) => !s.process_name.trim());
    if (invalidSteps.length > 0) {
      showToast("Please fill in the process name for all nodes before saving.", "error");
      return false;
    }

    // Validation: Product Node cannot be dangling (must have at least one incoming or outgoing edge)
    const danglingProducts = steps.filter(s => {
      if (s.node_type !== "PRODUCT") return false;
      const isTarget = steps.some(other => {
        let p = [];
        try { p = typeof other.predecessor_ids === 'string' ? JSON.parse(other.predecessor_ids) : other.predecessor_ids || []; } catch(e){}
        return p.includes(s.id);
      });
      let hasSource = false;
      try {
        const myP = typeof s.predecessor_ids === 'string' ? JSON.parse(s.predecessor_ids) : s.predecessor_ids || [];
        hasSource = myP.length > 0;
      } catch (e) {}
      
      return !isTarget && !hasSource;
    });

    if (danglingProducts.length > 0) {
      showToast(`Validation Failed: Product Node "${danglingProducts[0].process_name || 'Unknown'}" is dangling without any connections.`, "error");
      updateSelection(danglingProducts[0].id ? [danglingProducts[0].id] : []);
      return false;
    }

    // Validation: 100% BOM Allocation requirement when Publishing (Not Draft)
    if (!isDraft && projectBoms.length > 0) {
      const allocatedMap = new Map<string, number>();
      projectBoms.forEach(b => allocatedMap.set(b.id, 0));
      
      steps.forEach(s => {
        if (s.node_type === "PRODUCT" && s.bom_allocations) {
           let allocs: any[] = [];
           try { allocs = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : s.bom_allocations; } catch(e){}
           allocs.forEach((a: any) => {
             const curr = allocatedMap.get(a.bom_id) || 0;
             allocatedMap.set(a.bom_id, curr + (a.fraction || 1));
           });
        }
      });
      
      for (const b of projectBoms) {
        const totalAlloc = allocatedMap.get(b.id) || 0;
        if (totalAlloc < 0.99) {
           showToast(`Validation Failed: Material ${b.item_name} is not fully allocated (only ${Math.round(totalAlloc*100)}%). All materials must be 100% allocated before publishing.`, "error");
           return false;
        }
        if (totalAlloc > 1.01) {
           showToast(`Validation Failed: Material ${b.item_name} is over-allocated (${Math.round(totalAlloc*100)}%). Max is 100%.`, "error");
           return false;
        }
      }
    }

    setIsSaving(true);
    try {
      const payload: any = { is_draft: !!isDraft,
        project_id: projectId,
        steps: steps.map((s, idx) => ({
          ...s,
          step_sequence: idx + 1,
          execution_type: (s.predecessor_ids && s.predecessor_ids.length > 0) ? "SERIAL" : "PARALLEL",
          }))
      };
      
      if (pin) payload.auth_pin = pin;
      if (reason) payload.eco_reason = reason;

      const res = await apiFetch(
        "/api/production/bop/sync",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        user?.username
      );

      if (res.ok && res.data?.success) {
        showToast("Bill of Process saved and synchronized to Shop Floor!", "success");
        setHasUnsavedChanges(false);
        try {
          localStorage.setItem(`bop_draft_${projectId}`, JSON.stringify(steps));
        } catch (e) {}
        if (onRefreshProject) onRefreshProject();
        return true;
      } else {
        if (res.data?.require_eco || res.data?.error?.includes("ECO") || res.error?.includes("ECO") || res.data?.error?.includes("PIN") || res.error?.includes("PIN")) {
          setShowEcoModal(true);
        }
        showToast(res.data?.error || res.error || "Failed to save Bill of Process", "error");
        return false;
      }
    } catch (err: any) {
      console.error("Save BoP error:", err);
      if (err.message && (err.message.includes("ECO") || err.message.includes("PIN"))) {
        setShowEcoModal(true);
      }
      showToast(err.message || "Error communicating with server", "error");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSaveDraft = () => {
    handleSyncBoP(undefined, undefined, true);
  };

  const handlePublishVersion = async () => {
    // Validate stations before publishing
    if (stations.length < 1) {
      showToast("Validation Failed: At least 1 workstation must be registered (>= 1) before publishing.", "error");
      setShowStationModal(true);
      return;
    }
    const missingStations = steps.filter(
      (s) => (s.node_type || "PROCESS") === "PROCESS" && (!s.station_id || !stations.some((st) => st.id === s.station_id))
    );
    if (missingStations.length > 0) {
      showToast(
        "All Process nodes must be assigned to an active workstation before publishing.",
        "error"
      );
      return;
    }

    // Save draft first
    const saved = await handleSyncBoP(undefined, undefined, true);
    if (!saved) return;
    
    const versionNumber = prompt("Enter version number (e.g., v1.0, v1.1):", "v1.0");
    if (!versionNumber) return;

    try {
      setIsSaving(true);
      const res = await apiFetch(`/api/production/bop/publish-version`, {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          version_number: versionNumber,
        })
      }, user?.username);

      if (res.ok) {
        showToast(res.data.message || `Version ${versionNumber} published`, "success");
        if (onRefreshProject) onRefreshProject();
      } else {
        showToast(res.data?.error || res.error || "Failed to publish version", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error publishing version", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAuthorizeBoP = async (pin: string) => {
    setIsAuthorizing(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/bop/authorize`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }, user?.username);
      if (res.ok && res.data?.success) {
        setShowAuthModal(false);
        showToast("Bill of Process has been authorized for production.", "success");
        if (onRefreshProject) onRefreshProject();
      } else {
        showToast(res.data?.error || res.error || "Failed to authorize BOP", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error authorizing BOP", "error");
    } finally {
      setIsAuthorizing(false);
    }
  };

  // Export BoP JSON
  const handleReviseBoP = async () => {
    setIsSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/bop/revise`, {
        method: "POST",
        body: JSON.stringify({ note: reviseReason }),
      }, user?.username);
      if (res.ok && res.data?.success) {
        setShowReviseBopModal(false);
        setReviseReason("");
        showToast("Bill of Process marked for revision.", "success");
        if (onRefreshProject) onRefreshProject();
      } else {
        showToast(res.data?.error || res.error || "Failed to mark BOP for revision", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error requesting BOP revision", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportJson = () => {
    try {
      const dataStr = JSON.stringify(
        {
          project_spk: project?.spk_number || project?.id,
          project_name: project?.name,
          exported_at: new Date().toISOString(),
          steps: steps.map((s) => ({
            id: s.id,
            step_sequence: s.step_sequence,
            process_name: s.process_name,
            node_type: s.node_type || "PROCESS",
            work_center_id: s.work_center_id || "",
            work_center_name: s.work_center_name || "",
            execution_type: (s.predecessor_ids && s.predecessor_ids.length > 0) ? "SERIAL" : (s.execution_type || "PARALLEL"),
            shift_mode: s.shift_mode || 1,
            manpower_allocated: s.manpower_allocated || 1,
            standard_hours: s.standard_hours || 0,
            cycle_time_minutes: s.cycle_time_minutes || 0,
            predecessor_ids: s.predecessor_ids || [],
            sop_instruction: s.sop_instruction || "",
            qc_criteria: s.qc_criteria || "",
            qc_parameters: s.qc_parameters || [],
            product_role: resolveBopProductRole(s.id, steps),
            notes: s.notes || "",
            expected_yield_rate: s.expected_yield_rate ?? 100,
            station_id: s.station_id || "",
            bom_allocations: s.bom_allocations || [],
            lifecycle_status: s.lifecycle_status || "Planned",
            status: s.status || "PENDING",
            progress: s.progress || 0
          }))
        },
        null,
        2
      );

      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BOP_Flowchart_${project?.spk_number || project?.id || "export"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(
        "BoP Flowchart exported as JSON",
        "success"
      );
    } catch (err) {
      console.error(err);
      showToast(
        "Failed to export JSON",
        "error"
      );
    }
  };

  // Import BoP JSON
  const handleImportJson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetFile) {
      showToast(
        "Please select a JSON file to import",
        "error"
      );
      return;
    }

    setIsSaving(true);
    try {
      const text = await presetFile.text();
      const data = JSON.parse(text);

      let rawSteps: any[] = [];
      if (Array.isArray(data)) {
        rawSteps = data;
      } else if (Array.isArray(data.steps)) {
        rawSteps = data.steps;
      } else if (Array.isArray(data.bill_of_processes)) {
        rawSteps = data.bill_of_processes;
      } else if (Array.isArray(data.bop_steps)) {
        rawSteps = data.bop_steps;
      } else if (Array.isArray(data.nodes)) {
        rawSteps = data.nodes;
      }

      if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
        showToast(
          "Invalid JSON format or empty process steps list.",
          "error"
        );
        setIsSaving(false);
        return;
      }

      const idMap = new Map<string, string>();
      const nowMs = Date.now();
      rawSteps.forEach((s: any, idx: number) => {
        const origId = s.id ? String(s.id).trim() : "";
        const targetId = origId.length > 0 ? origId : `step_${nowMs}_${idx}`;
        if (origId) {
          idMap.set(origId, targetId);
        }
      });

      const loadedSteps: BoPStepRow[] = rawSteps.map((s: any, idx: number) => {
        const origId = s.id ? String(s.id).trim() : "";
        const newId = origId.length > 0 ? (idMap.get(origId) || origId) : `step_${nowMs}_${idx}`;

        let predList: string[] = [];
        if (Array.isArray(s.predecessor_ids)) {
          predList = s.predecessor_ids.map((pid: any) => idMap.get(String(pid)) || String(pid));
        } else if (typeof s.predecessor_ids === "string") {
          try {
            const parsed = JSON.parse(s.predecessor_ids);
            if (Array.isArray(parsed)) {
              predList = parsed.map((pid: any) => idMap.get(String(pid)) || String(pid));
            }
          } catch (e) {}
        }

        let bomAllocs: any[] = [];
        if (Array.isArray(s.bom_allocations)) {
          bomAllocs = s.bom_allocations;
        } else if (typeof s.bom_allocations === "string") {
          try {
            bomAllocs = JSON.parse(s.bom_allocations);
          } catch (e) {}
        }

        let qcParams: BopQcParameter[] = [];
        if (Array.isArray(s.qc_parameters)) {
          qcParams = s.qc_parameters;
        } else if (typeof s.qc_parameters_json === "string") {
          try {
            qcParams = JSON.parse(s.qc_parameters_json);
          } catch (e) {}
        }
        const isProdNode = (s.node_type || "PROCESS") === "PRODUCT";
        if (isProdNode && qcParams.length === 0 && s.qc_criteria) {
          qcParams = parseLegacyQcCriteriaToParameters(s.qc_criteria);
        }

        return {
          id: newId,
          step_sequence: Number(s.step_sequence) || idx + 1,
          process_name: s.process_name || `Step ${idx + 1}`,
          node_type: s.node_type || "PROCESS",
          product_role: s.product_role || null,
          work_center_id: s.work_center_id || "",
          work_center_name: s.work_center_name || "",
          execution_type: (predList.length > 0) ? "SERIAL" : (s.execution_type || "PARALLEL"),
          shift_mode: Number(s.shift_mode) || 1,
          manpower_allocated: Number(s.manpower_allocated) || 1,
          standard_hours: Number(s.standard_hours) || 0,
          cycle_time_minutes: Number(s.cycle_time_minutes) || 0,
          predecessor_ids: predList,
          sop_instruction: s.sop_instruction || s.notes || "",
          qc_criteria: isProdNode ? (s.qc_criteria || "") : "",
          qc_parameters: isProdNode ? qcParams : [],
          notes: s.notes || "",
          expected_yield_rate: s.expected_yield_rate ?? 100,
          station_id: s.station_id || "",
          bom_allocations: bomAllocs,
          lifecycle_status: s.lifecycle_status || "Planned",
          status: s.status || "PENDING",
          progress: Number(s.progress) || 0
        };
      });

      setSteps(loadedSteps);
      updateSelection(loadedSteps[0]?.id || null ? [loadedSteps[0]?.id || null] : []);
      setShowLoadPresetModal(false);
      setPresetFile(null);
      setPresetFileName("");

      // Write to localStorage draft immediately
      try {
        localStorage.setItem(`bop_draft_${projectId}`, JSON.stringify(loadedSteps));
        localStorage.setItem(`bop_unsaved_${projectId}`, "true");
      } catch (e) {}

      // Automatically sync draft to backend database (SQLite + Firestore) immediately
      try {
        const payload: any = {
          is_draft: true,
          project_id: projectId,
          steps: loadedSteps.map((s, idx) => ({
            ...s,
            step_sequence: idx + 1,
            execution_type: (s.predecessor_ids && s.predecessor_ids.length > 0) ? "SERIAL" : "PARALLEL",
          }))
        };

        const res = await apiFetch(
          "/api/production/bop/sync",
          {
            method: "POST",
            body: JSON.stringify(payload)
          },
          user?.username
        );

        if (res.ok && res.data?.success) {
          setHasUnsavedChanges(false);
          try {
            localStorage.setItem(`bop_unsaved_${projectId}`, "false");
          } catch (e) {}
          showToast(
            "BoP Flowchart imported and saved to database",
            "success"
          );
          if (onRefreshProject) onRefreshProject();
        } else {
          setHasUnsavedChanges(true);
          showToast(
            "BoP Flowchart imported to draft. Click SAVE DRAFT to confirm.",
            "info"
          );
        }
      } catch (syncErr) {
        console.warn("Auto-sync imported BOP draft warning:", syncErr);
        setHasUnsavedChanges(true);
        showToast(
          "BoP Flowchart imported locally. Click SAVE DRAFT to save.",
          "info"
        );
      }
    } catch (err) {
      console.error("Error processing JSON import:", err);
      showToast(
        "Failed to process JSON file",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Currently Selected Step
  
  const selectedSteps = useMemo(() => {
    return steps.filter((s) => selectedStepIds.includes(s.id));
  }, [steps, selectedStepIds]);
  
  const selectedStep = selectedSteps.length === 1 ? selectedSteps[0] : null;


  // Overall Statistics
  const qcCheckpointsCount = useMemo(() => {
    return steps.filter(
      (s) =>
        s.node_type === "PRODUCT" &&
        ((Array.isArray(s.qc_parameters) && s.qc_parameters.length > 0) ||
          (s.qc_criteria && s.qc_criteria.trim()))
    ).length;
  }, [steps]);

  const parallelCount = useMemo(() => {
    return steps.filter((s) => !s.predecessor_ids || s.predecessor_ids.length === 0).length;
  }, [steps]);

  const serialCount = useMemo(() => {
    return steps.filter((s) => s.predecessor_ids && s.predecessor_ids.length > 0).length;
  }, [steps]);

  // BOM Material Absorption Summary on BOP
  const bopAbsorptionSummary = useMemo(() => {
    if (!projectBoms || projectBoms.length === 0) {
      return {
        totalValid: 0,
        fullyAssignedCount: 0,
        unassignedCount: 0,
        partiallyAssignedCount: 0,
        hasUnassigned: false,
        absorptionRate: 100,
        unabsorbedItems: [] as any[],
      };
    }

    const allocatedMap = new Map<string, number>();
    projectBoms.forEach((b) => allocatedMap.set(b.id, 0));

    steps.forEach((s) => {
      if (s.node_type === "PRODUCT" && s.bom_allocations) {
        let allocs: any[] = [];
        try {
          allocs =
            typeof s.bom_allocations === "string"
              ? JSON.parse(s.bom_allocations)
              : s.bom_allocations || [];
        } catch (e) {
          allocs = [];
        }
        allocs.forEach((a: any) => {
          const bomRef = projectBoms.find(b => b.id === a.bom_id);
          const totalBomQty = Number((bomRef?.required_qty || bomRef?.qty) || 0);
          const frac = a.qty !== undefined && totalBomQty > 0 ? Number(a.qty) / totalBomQty : Number(a.fraction || 0);
          const curr = allocatedMap.get(a.bom_id) || 0;
          allocatedMap.set(a.bom_id, curr + frac);
        });
      }
    });

    let fully = 0;
    let partial = 0;
    let unassigned = 0;
    const unabsorbedItems: any[] = [];

    projectBoms.forEach((b) => {
      const totalAlloc = allocatedMap.get(b.id) || 0;
      if (totalAlloc >= 0.99) {
        fully++;
      } else if (totalAlloc > 0) {
        partial++;
        unassigned++;
        unabsorbedItems.push({ ...b, allocatedFraction: totalAlloc, status: "PARTIAL" });
      } else {
        unassigned++;
        unabsorbedItems.push({ ...b, allocatedFraction: 0, status: "UNASSIGNED" });
      }
    });

    const absorptionRate = Math.round((fully / projectBoms.length) * 100);

    return {
      totalValid: projectBoms.length,
      fullyAssignedCount: fully,
      partiallyAssignedCount: partial,
      unassignedCount: unassigned,
      hasUnassigned: unassigned > 0,
      absorptionRate,
      unabsorbedItems,
    };
  }, [projectBoms, steps]);

  // Workstation & Route Nodes Validation (Set Station in BOP Editor)
  const hasNoStations = stations.length === 0;
  const processSteps = useMemo(() => steps.filter((s) => (s.node_type || "PROCESS") === "PROCESS"), [steps]);
  const unassignedProcessSteps = useMemo(
    () =>
      processSteps.filter(
        (s) =>
          !s.station_id ||
          !stations.some((st) => st.id === s.station_id || st.station_code === s.station_id)
      ),
    [processSteps, stations]
  );
  const hasUnassignedProcesses = unassignedProcessSteps.length > 0;
  const isSubmitBopBlocked =
    !isBomAuthorized || processSteps.length === 0 || hasNoStations || hasUnassignedProcesses;

  return (
    <div
      className={cn(
        "transition-all",
        isFullscreen
          ? "fixed inset-0 z-[9999] bg-stone-50 dark:bg-stone-950 flex flex-col overflow-hidden p-3 sm:p-4 gap-3"
          : "space-y-4"
      )}
    >
      {/* Compact Status & Validation Strip */}
      {(effectiveProject?.bop_status === "REVISION" ||
        hasNoStations ||
        hasUnassignedProcesses ||
        !isBomAuthorized ||
        bopAbsorptionSummary.hasUnassigned) && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {effectiveProject?.bop_status === "REVISION" && effectiveProject?.bop_revision_note && (
            <div className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span className="font-bold">Revision:</span>
              <span className="italic truncate max-w-md">"{effectiveProject.bop_revision_note}"</span>
            </div>
          )}

          {hasNoStations && (
            <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl text-xs text-amber-950 dark:text-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="font-semibold">0 Workstations registered</span>
              <button
                type="button"
                onClick={() => setShowStationModal(true)}
                className="px-2 py-0.5 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-[10px] font-bold cursor-pointer"
              >
                Manage Stations
              </button>
            </div>
          )}

          {!hasNoStations && hasUnassignedProcesses && (
            <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl text-xs text-amber-950 dark:text-amber-200 flex items-center gap-2 flex-wrap">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="font-semibold">
                {unassignedProcessSteps.length} unassigned process(es)
              </span>
              {stations.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSteps((prev) =>
                      prev.map((s, idx) => {
                        if ((s.node_type || "PROCESS") !== "PROCESS") return s;
                        const isAssigned =
                          s.station_id &&
                          stations.some((st) => st.id === s.station_id || st.station_code === s.station_id);
                        if (isAssigned) return s;
                        return {
                          ...s,
                          station_id: stations[idx % stations.length].id,
                        };
                      })
                    );
                    setHasUnsavedChanges(true);
                    showToast("All unassigned process nodes assigned to workstations.", "success");
                  }}
                  className="px-2 py-0.5 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                >
                  Auto-Assign
                </button>
              )}
            </div>
          )}

          {!isBomAuthorized && (
            <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-950 dark:text-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="font-semibold">BOM Status: {bomStatus}</span>
              <Link
                to={`/engineering?projectId=${projectId}`}
                className="px-2 py-0.5 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1"
              >
                <span>Open BOM</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            </div>
          )}

          {bopAbsorptionSummary.hasUnassigned && (
            <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-950 dark:text-amber-200 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="font-semibold">
                BOM Absorption: {bopAbsorptionSummary.absorptionRate}% ({bopAbsorptionSummary.unassignedCount} unallocated)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Mode View Switcher & Split Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b border-stone-200 dark:border-stone-800 pb-2.5 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewMode("FLOWCHART")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                viewMode === "FLOWCHART"
                  ? "bg-stone-200/80 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-stone-300 dark:border-stone-700 shadow-2xs"
                  : "bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 border border-stone-200 dark:border-stone-800"
              )}
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>Flowchart Canvas</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("MATRIX")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                viewMode === "MATRIX"
                  ? "bg-stone-200/80 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-stone-300 dark:border-stone-700 shadow-2xs"
                  : "bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 border border-stone-200 dark:border-stone-800"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Matrix Table</span>
            </button>
          </div>

          {hasUnsavedChanges && (
            <span className="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              Unsaved Changes
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {isEngineering && (
            <div className="relative" ref={addRootDropdownRef}>
              <button
                type="button"
                onClick={() => setShowAddRootDropdown((prev) => !prev)}
                className="h-9 px-3 flex items-center justify-center rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all shrink-0 cursor-pointer shadow-xs text-xs font-bold gap-1.5"
                title="Add Node (Process or Product)"
              >
                <Plus className="w-4 h-4 text-blue-600" />
                <span>Add Node</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-stone-400 transition-transform", showAddRootDropdown && "rotate-180")} />
              </button>

              {showAddRootDropdown && (
                <div className="absolute top-full left-0 mt-1.5 w-44 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 text-left">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddRootDropdown(false);
                      handleAddNewRootNode("PROCESS");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-stone-800 dark:text-stone-200 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-xl transition-colors text-left"
                  >
                    <Workflow className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Process</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAddRootDropdown(false);
                      handleAddNewRootNode("PRODUCT");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-stone-800 dark:text-stone-200 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-xl transition-colors text-left mt-0.5"
                  >
                    <Package className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Product</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Manage Stations Button */}
          <button
            type="button"
            onClick={() => setShowStationModal(true)}
            className={cn(
              "h-9 px-3 flex items-center justify-center rounded-xl border transition-all shrink-0 cursor-pointer shadow-xs text-xs font-bold gap-1.5",
              hasNoStations
                ? "border-amber-300 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 hover:bg-amber-100"
                : "border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800"
            )}
            title="Manage Project Workstations"
          >
            <Layers className={cn("w-4 h-4", hasNoStations ? "text-amber-600" : "text-stone-600 dark:text-stone-400")} />
            <span>Stations ({stations.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const { nodes: newNodes, edges: newEdges } = calculateAutoLayout(steps);
              setNodes(newNodes);
              setEdges(newEdges);
              showToast("Flowchart layout auto-arranged.", "info");
            }}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all shrink-0 cursor-pointer shadow-xs"
            title="Auto-Arrange Layout"
          >
            <Network className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowSimulationModal(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all shrink-0 cursor-pointer shadow-xs"
            title="Simulation Run"
          >
            <PlayCircle className="w-4 h-4 text-blue-600" />
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all shrink-0 cursor-pointer shadow-xs"
            title="Export JSON File"
          >
            <Download className="w-4 h-4" />
          </button>

          {isEngineering && (
            <button
              type="button"
              onClick={() => setShowLoadPresetModal(true)}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all shrink-0 cursor-pointer shadow-xs"
              title="Import JSON File"
            >
              <Upload className="w-4 h-4" />
            </button>
          )}

          <div className="w-px h-6 bg-stone-200 dark:bg-stone-800 mx-1" />

          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className={cn(
              "h-9 px-2.5 flex items-center justify-center gap-1.5 rounded-xl border transition-all shrink-0 cursor-pointer shadow-xs text-xs font-bold",
              isFullscreen
                ? "border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300"
                : "border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
            )}
            title="Toggle Split-Screen Fullscreen Mode"
          >
            {isFullscreen ? (
              <>
                <Minimize className="w-4 h-4" />
                <span className="hidden sm:inline">Exit Fullscreen</span>
              </>
            ) : (
              <Maximize className="w-4 h-4" />
            )}
          </button>

          {!isEngineering ? (
            <div className="flex items-center gap-2 pl-2 border-l border-stone-200 dark:border-stone-800">
              <div className="px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xs font-bold flex items-center gap-1.5 shadow-xs">
                <Eye className="w-3.5 h-3.5 text-stone-500" />
                <span>Read-Only</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2 border-l border-stone-200 dark:border-stone-800">
              <button
                type="button"
                onClick={handleManualSaveDraft}
                disabled={isSaving}
                className="w-9 h-9 p-0 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-stone-700 rounded-xl flex items-center justify-center transition-all shadow-xs disabled:opacity-50 active:scale-95 cursor-pointer"
                title="Save Draft"
              >
                <Save className="w-4 h-4 text-amber-600" />
              </button>
              <button
                type="button"
                onClick={handlePublishVersion}
                disabled={isSaving}
                className="w-9 h-9 p-0 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center transition-all shadow-sm disabled:opacity-50 active:scale-95 cursor-pointer"
                title="Publish Snapshot Version"
              >
                <Share2 className="w-4 h-4 text-blue-100" />
              </button>

              {(() => {
                const rawStatus = (effectiveProject?.bop_status || "DRAFT").toUpperCase();
                const isPending =
                  rawStatus === "PENDING" ||
                  rawStatus === "SUBMITTED" ||
                  rawStatus === "PENDING_APPROVAL" ||
                  rawStatus === "IN_REVIEW";
                const isAuthorized = rawStatus === "AUTHORIZED" || rawStatus === "APPROVED";

                if (isPending) {
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isBomAuthorized) {
                            showToast(
                              `BOP Authorization blocked: BOM is not authorized yet (${bomStatus}).`,
                              "error"
                            );
                            return;
                          }
                          if (hasNoStations) {
                            showToast("At least 1 workstation must be registered.", "error");
                            setShowStationModal(true);
                            return;
                          }
                          if (hasUnassignedProcesses) {
                            showToast(
                              `All processes must be assigned to a station (${unassignedProcessSteps.length} unassigned).`,
                              "error"
                            );
                            return;
                          }
                          setShowAuthModal(true);
                        }}
                        disabled={isSaving || !isBomAuthorized || isSubmitBopBlocked}
                        className={cn(
                          "h-9 px-4 rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95 cursor-pointer",
                          !isBomAuthorized || isSubmitBopBlocked
                            ? "bg-stone-300 dark:bg-stone-800 text-stone-500 cursor-not-allowed opacity-75"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white"
                        )}
                      >
                        <ShieldCheck className="w-4 h-4 text-emerald-100" />
                        <span>AUTHORIZE BOP</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReviseBopModal(true)}
                        disabled={isSaving || !isEngineering}
                        className="h-9 px-4 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                      >
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>REVISION</span>
                      </button>
                    </>
                  );
                }

                if (isAuthorized) {
                  return (
                    <button
                      type="button"
                      onClick={() => setShowEcoModal(true)}
                      disabled={isSaving || !isEngineering}
                      className="h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                    >
                      <Wrench className="w-4 h-4 text-amber-100" />
                      <span>ECO REVISION</span>
                    </button>
                  );
                }

                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isBomAuthorized) {
                        showToast(
                          `BOM is not authorized yet (${bomStatus}). Use Save Draft or authorize BOM first.`,
                          "info"
                        );
                        return;
                      }
                      if (hasNoStations) {
                        showToast("Register at least 1 workstation before submitting BOP.", "error");
                        setShowStationModal(true);
                        return;
                      }
                      if (processSteps.length === 0) {
                        showToast("Add at least 1 manufacturing process before submitting.", "error");
                        return;
                      }
                      if (hasUnassignedProcesses) {
                        showToast(
                          `Assign all processes to a workstation first (${unassignedProcessSteps.length} unassigned).`,
                          "error"
                        );
                        if (unassignedProcessSteps[0]?.id) {
                          updateSelection([unassignedProcessSteps[0].id]);
                        }
                        return;
                      }
                      setShowConfirmSubmitBopModal(true);
                    }}
                    disabled={isSaving || !isEngineering || isSubmitBopBlocked}
                    className={cn(
                      "w-9 h-9 p-0 rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer",
                      isSubmitBopBlocked
                        ? "bg-stone-200 dark:bg-stone-800 text-stone-500 border border-stone-300 dark:border-stone-700 cursor-not-allowed opacity-80"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    )}
                    title="Submit BOP for Authorization"
                  >
                    {isSaving ? (
                      <Clock className="w-4 h-4 animate-spin text-stone-400" />
                    ) : (
                      <Send className={cn("w-4 h-4", !isSubmitBopBlocked ? "text-blue-100" : "text-stone-400")} />
                    )}
                  </button>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* VIEW 1: INTERACTIVE REACT FLOW FLOWCHART CANVAS WITH SPLIT-SCREEN RESIZER */}
      {viewMode === "FLOWCHART" && (
        <div
          ref={splitContainerRef}
          className={cn(
            "relative flex flex-col lg:flex-row items-stretch",
            isFullscreen ? "flex-1 min-h-0" : "gap-4 lg:gap-0",
            isDraggingSplit && "select-none cursor-col-resize"
          )}
        >
          {/* Left Pane: Node Chart (Flowchart Canvas) */}
          <div
            style={{
              width: !isFullscreen
                ? "55%"
                : isInspectorCollapsed
                ? "100%"
                : `${splitPercent}%`,
            }}
            className={cn(
              "w-full lg:w-[var(--split-w)] bg-stone-100/60 dark:bg-stone-900/60 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-inner relative shrink-0",
              (!isDraggingSplit || !isFullscreen) && "transition-[width] duration-150",
              isFullscreen ? "h-full" : "h-[680px]"
            )}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={isEngineering ? onConnect : undefined}
              onEdgeClick={isEngineering ? onEdgeClick : undefined}
              onNodesDelete={(deletedNodes) => {
                if (!isEngineering) return;
                const ids = deletedNodes.map((n) => n.id);
                handleDeleteSteps(ids);
              }}
              onEdgesDelete={(deletedEdges) => {
                if (!isEngineering) return;
                deletedEdges.forEach((edge) => {
                  const { source, target } = edge;
                  setSteps((prev) =>
                    prev.map((s) => {
                      if (s.id === target) {
                        const remainingPreds = (s.predecessor_ids || []).filter((id) => id !== source);
                        return {
                          ...s,
                          predecessor_ids: remainingPreds,
                          execution_type: remainingPreds.length > 0 ? "SERIAL" : "PARALLEL",
                        };
                      }
                      return s;
                    })
                  );
                });
                setHasUnsavedChanges(true);
              }}
              onSelectionChange={handleSelectionChange}
              nodeTypes={nodeTypes}
              nodesDraggable={isEngineering}
              nodesConnectable={isEngineering}
              elementsSelectable={true}
              selectionOnDrag={true}
              panOnDrag={[1, 2]}
              panOnScroll={true}
              selectionMode={"partial" as any}
              multiSelectionKeyCode="Shift"
              selectionKeyCode="Shift"
              fitView
              minZoom={0.2}
              maxZoom={1.5}
              defaultEdgeOptions={{
                type: "smoothstep",
                animated: true,
                style: { stroke: "#57534e", strokeWidth: 2.5 },
              }}
            >
              <StationGroupOverlays stations={stations} bopSteps={steps} />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#a8a29e" />
              <Controls className="!bg-white dark:!bg-stone-900 !border-stone-200 dark:!border-stone-700 !rounded-xl !shadow-md" />
              <MiniMap
                className="!bg-white dark:!bg-stone-900 !border-stone-200 dark:!border-stone-700 !rounded-xl !shadow-md overflow-hidden"
                nodeColor={(n) => {
                  const d = n.data as any;
                  if (d?.incomingCount === 0) return "#10b981";
                  if (d?.incomingCount > 1) return "#a855f7";
                  return "#3b82f6";
                }}
              />

              {/* Compact Help Guide Toggle */}
              <Panel position="top-left" className="pointer-events-auto">
                {showInstructions ? (
                  <div className="bg-white/95 dark:bg-stone-900/95 backdrop-blur-xs p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 shadow-lg text-xs space-y-1.5 max-w-xs relative">
                    <button
                      type="button"
                      onClick={() => setShowInstructions(false)}
                      className="absolute top-2.5 right-2.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                      title="Close Guide"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5 pr-6">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                      <span>Canvas Shortcuts</span>
                    </div>
                    <div className="text-[11px] text-stone-600 dark:text-stone-400 space-y-0.5">
                      <p>• Drag handles to connect serial nodes.</p>
                      <p>• Click an edge to remove a link.</p>
                      {isFullscreen && <p>• Drag the center divider to resize panels.</p>}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowInstructions(true)}
                    className="bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800 p-2 rounded-xl shadow-xs text-stone-700 dark:text-stone-300 flex items-center justify-center transition-all cursor-pointer"
                    title="Canvas Shortcuts"
                  >
                    <HelpCircle className="w-4 h-4 text-amber-500" />
                  </button>
                )}
              </Panel>

              {/* Floating Split Ratio Indicator while dragging (Only in Fullscreen) */}
              {isFullscreen && isDraggingSplit && (
                <Panel position="top-right" className="pointer-events-none">
                  <div className="px-2.5 py-1 rounded-lg bg-stone-800 dark:bg-stone-800 text-stone-100 font-mono text-[10px] font-bold shadow-md border border-stone-700">
                    Chart {Math.round(splitPercent)}% · Inspector {Math.round(100 - splitPercent)}%
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>

          {/* Interactive Split-Screen Drag Handle (Active ONLY in Fullscreen mode) */}
          {isFullscreen && !isInspectorCollapsed && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingSplit(true);
              }}
              onDoubleClick={() => setSplitPercent(55)}
              title="Drag to resize Chart & Inspector (Double-click to reset 55/45)"
              className={cn(
                "hidden lg:flex w-4 shrink-0 items-center justify-center cursor-col-resize group relative z-20 select-none",
                isDraggingSplit && "bg-indigo-500/10"
              )}
            >
              <div
                className={cn(
                  "w-1 h-24 rounded-full transition-all flex items-center justify-center",
                  isDraggingSplit
                    ? "bg-indigo-600 h-full w-1"
                    : "bg-stone-300 dark:bg-stone-700 group-hover:bg-indigo-500 group-hover:h-36"
                )}
              />
              <div
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 w-5 h-10 rounded-lg border flex items-center justify-center shadow-xs transition-all",
                  isDraggingSplit
                    ? "bg-indigo-600 border-indigo-500 text-white scale-105"
                    : "bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-400 group-hover:text-indigo-600 group-hover:border-indigo-400"
                )}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
            </div>
          )}

          {/* Right Pane: Side Node Inspector */}
          {(!isFullscreen || !isInspectorCollapsed) && (
            <div
              style={{
                width: !isFullscreen
                  ? "45%"
                  : `calc(${100 - splitPercent}% - 16px)`,
              }}
              className={cn(
                "w-full lg:flex-1 min-w-[260px]",
                (!isDraggingSplit || !isFullscreen) && "transition-[width] duration-150",
                isFullscreen ? "h-full" : "h-[680px]"
              )}
            >
              <BopNodeInspector
                isFullscreen={isFullscreen}
                isEngineering={isEngineering}
                selectedSteps={selectedSteps}
                selectedStep={selectedStep}
                steps={steps}
                stations={stations}
                projectBoms={projectBoms}
                setSteps={setSteps}
                setShowStationModal={setShowStationModal}
                handleDeleteStep={handleDeleteStep}
                handleDeleteSteps={handleDeleteSteps}
                handleUpdateStep={handleUpdateStep}
                handleBulkUpdateStep={handleBulkUpdateStep}
                onInsertWipGateAfterProcess={handleInsertWipGateAfterProcess}
                onSelectStep={handleSelectSingleStep}
                showToast={showToast}
                className="h-full"
              />
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: STRUCTURED MATRIX TABLE VIEW */}
      {viewMode === "MATRIX" && (
        <div className={cn(isFullscreen && "flex-1 overflow-y-auto")}>
          <BopMatrixView
            steps={steps}
            stations={stations}
            isEngineering={isEngineering}
            handleUpdateStep={handleUpdateStep}
            handleDeleteStep={handleDeleteStep}
          />
        </div>
      )}

      <BopModals
        projectId={projectId}
        project={project}
        steps={steps}
        processSteps={processSteps}
        stations={stations}
        projectBoms={projectBoms}
        bomStatus={bomStatus}
        isSaving={isSaving}
        isAuthorizing={isAuthorizing}
        showExplanationModal={showExplanationModal}
        setShowExplanationModal={setShowExplanationModal}
        showPresetModal={showPresetModal}
        setShowPresetModal={setShowPresetModal}
        handleApplyPreset={handleApplyPreset}
        showStationModal={showStationModal}
        setShowStationModal={setShowStationModal}
        onRefreshStations={() => {
          apiFetch(`/api/production/projects/${projectId}/stations`, {}, user?.username).then((res) => {
            if (res.ok && res.data) {
              const stList = Array.isArray(res.data)
                ? res.data
                : Array.isArray(res.data?.stations)
                ? res.data.stations
                : [];
              setStations(stList);
              setSteps((prev) =>
                prev.map((s) => {
                  if ((s.node_type || "PROCESS") !== "PROCESS") return s;
                  const matchedSt = stList.find(
                    (st: any) => st.id === s.station_id || st.station_code === s.station_id
                  );
                  return {
                    ...s,
                    station_id: matchedSt ? matchedSt.id : "",
                  };
                })
              );
            }
          });
        }}
        showSimulationModal={showSimulationModal}
        setShowSimulationModal={setShowSimulationModal}
        showLoadPresetModal={showLoadPresetModal}
        setShowLoadPresetModal={setShowLoadPresetModal}
        presetFile={presetFile}
        setPresetFile={setPresetFile}
        presetFileName={presetFileName}
        setPresetFileName={setPresetFileName}
        handleImportJson={handleImportJson}
        showAuthModal={showAuthModal}
        setShowAuthModal={setShowAuthModal}
        handleAuthorizeBoP={handleAuthorizeBoP}
        showEcoModal={showEcoModal}
        setShowEcoModal={setShowEcoModal}
        ecoReason={ecoReason}
        setEcoReason={setEcoReason}
        handleSyncBoP={handleSyncBoP}
        showReviseBopModal={showReviseBopModal}
        setShowReviseBopModal={setShowReviseBopModal}
        reviseReason={reviseReason}
        setReviseReason={setReviseReason}
        handleReviseBoP={handleReviseBoP}
        showPreviewModal={showPreviewModal}
        setShowPreviewModal={setShowPreviewModal}
        showConfirmSubmitBopModal={showConfirmSubmitBopModal}
        setShowConfirmSubmitBopModal={setShowConfirmSubmitBopModal}
      />
    </div>
  );
};
