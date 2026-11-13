import { Edge, MarkerType, Node } from "@xyflow/react";
import { BopNodeData } from "@/components/erp/BopFlowNode";
import { BoPStepRow, BopProductRole } from "../bopTypes";

export function isGhostProcurementStep(s: any): boolean {
  const id = String(s?.id || "");
  const name = String(s?.process_name || "");
  return (
    id.startsWith("BOP-TSK-") ||
    /^\[Procurement\]/i.test(name) ||
    /^Materials:/i.test(name) ||
    /^Arrival:/i.test(name) ||
    /^Material Procurement/i.test(name) ||
    /^SPK Material Procurement/i.test(name) ||
    /^ECO Procurement Revision/i.test(name)
  );
}

export interface BopLayoutOptions {
  stepsList: BoPStepRow[];
  projectBoms: any[];
  inventoryItems: any[];
  stations: any[];
  machines: any[];
  selectedStepIds: string[];
  onAddChild: (parentId: string, type: "PROCESS" | "PRODUCT") => void;
  onAddParallel: (siblingId: string, type: "PROCESS" | "PRODUCT") => void;
  onDelete: (id: string) => void;
}

/**
 * Calculates DAG topological layout coordinates, barycentric crossing minimization,
 * non-overlapping vertical lanes, and React Flow Nodes + Edges for BOP steps.
 */
export function buildBopFlowLayout({
  stepsList,
  projectBoms,
  inventoryItems,
  stations,
  machines,
  selectedStepIds,
  onAddChild,
  onAddParallel,
  onDelete,
}: BopLayoutOptions): { nodes: Node[]; edges: Edge[] } {
  if (!stepsList || stepsList.length === 0) {
    return { nodes: [], edges: [] };
  }

  const validIds = new Set(stepsList.map((s) => s.id));
  const stepMap = new Map<string, BoPStepRow>();
  stepsList.forEach((s) => stepMap.set(s.id, s));

  // 1. Calculate incoming edges & predecessors
  const edgeList: Edge[] = [];
  const incomingMap: Record<string, string[]> = {};
  const outgoingMap: Record<string, string[]> = {};

  stepsList.forEach((s) => {
    incomingMap[s.id] = (s.predecessor_ids || []).filter((pid) => validIds.has(pid));
    outgoingMap[s.id] = [];
  });

  stepsList.forEach((s) => {
    incomingMap[s.id].forEach((predId) => {
      outgoingMap[predId].push(s.id);
    });
  });

  const resolveNodeRole = (nodeId: string): BopProductRole | null => {
    const node = stepMap.get(nodeId);
    if (!node || node.node_type !== "PRODUCT") return null;
    const inc = (incomingMap[nodeId] || []).length;
    const out = (outgoingMap[nodeId] || []).length;
    if (inc === 0) return "MATERIAL_INPUT";
    if (out > 0) return "WIP_SUB_ASSY";
    return "FINISHED_GOOD";
  };

  stepsList.forEach((s) => {
    incomingMap[s.id].forEach((predId) => {
      const isTargetProduct = stepMap.get(s.id)?.node_type === "PRODUCT";
      const isSourceProduct = stepMap.get(predId)?.node_type === "PRODUCT";

      const sourceStep = stepMap.get(predId);
      const targetStep = stepMap.get(s.id);
      const sourceRole = resolveNodeRole(predId);
      const targetRole = resolveNodeRole(s.id);

      const isSameStation = Boolean(
        sourceStep?.station_id &&
          targetStep?.station_id &&
          sourceStep.station_id === targetStep.station_id
      );

      let edgeLabel: string | undefined = undefined;
      let strokeColor = isTargetProduct ? "#d97706" : "#475569";
      let strokeDasharray = "none";
      let labelBgStyle: any = { fill: "#fef3c7", color: "#b45309", fillOpacity: 0.92 };
      let labelStyle: any = { fill: "#92400e", fontWeight: "bold", fontSize: 10 };

      if (isSourceProduct && !isTargetProduct) {
        if (sourceRole === "WIP_SUB_ASSY") {
          edgeLabel = "QC Pass → Next Process";
          strokeColor = "#4f46e5";
          labelBgStyle = { fill: "#eef2ff", color: "#3730a3", fillOpacity: 0.95 };
          labelStyle = { fill: "#3730a3", fontWeight: "bold", fontSize: 10 };
        } else {
          edgeLabel = "Material Feed";
          strokeColor = "#d97706";
          labelBgStyle = { fill: "#fef3c7", color: "#b45309", fillOpacity: 0.95 };
          labelStyle = { fill: "#92400e", fontWeight: "bold", fontSize: 10 };
        }
      } else if (!isSourceProduct && isTargetProduct) {
        if (targetRole === "WIP_SUB_ASSY") {
          edgeLabel = "Output → IPQC Gate";
          strokeColor = "#4f46e5";
          labelBgStyle = { fill: "#eef2ff", color: "#3730a3", fillOpacity: 0.95 };
          labelStyle = { fill: "#3730a3", fontWeight: "bold", fontSize: 10 };
        } else {
          edgeLabel = "Final Output → FQC";
          strokeColor = "#059669";
          labelBgStyle = { fill: "#ecfdf5", color: "#065f46", fillOpacity: 0.95 };
          labelStyle = { fill: "#047857", fontWeight: "bold", fontSize: 10 };
        }
      } else if (!isSourceProduct && !isTargetProduct) {
        if (isSameStation) {
          edgeLabel = "1-Piece Flow (Intra-Stn)";
          strokeColor = "#059669";
          labelBgStyle = { fill: "#ecfdf5", color: "#065f46", fillOpacity: 0.95 };
          labelStyle = { fill: "#047857", fontWeight: "bold", fontSize: 10 };
        } else {
          edgeLabel = `Lot Gate (${targetStep?.lot_size || 50} pcs)`;
          strokeColor = "#2563eb";
          strokeDasharray = "6 3";
          labelBgStyle = { fill: "#eff6ff", color: "#1e40af", fillOpacity: 0.95 };
          labelStyle = { fill: "#1d4ed8", fontWeight: "bold", fontSize: 10 };
        }
      }

      edgeList.push({
        id: `edge_${predId}_to_${s.id}`,
        source: predId,
        target: s.id,
        type: "smoothstep",
        animated: true,
        label: edgeLabel,
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 4,
        labelBgStyle,
        labelStyle,
        style: { stroke: strokeColor, strokeWidth: 2.5, strokeDasharray },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 18,
          height: 18,
        },
      });
    });
  });

  // 2. Identify Weakly Connected Components (Independent Assemblies / Trees)
  const visited = new Set<string>();
  const components: string[][] = [];

  stepsList.forEach((s) => {
    if (!visited.has(s.id)) {
      const comp: string[] = [];
      const queue = [s.id];
      visited.add(s.id);

      let compGuard = 0;
      while (queue.length > 0 && compGuard < 1000) {
        compGuard++;
        const curr = queue.shift()!;
        comp.push(curr);

        const neighbors = [...(incomingMap[curr] || []), ...(outgoingMap[curr] || [])];
        neighbors.forEach((nbr) => {
          if (!visited.has(nbr)) {
            visited.add(nbr);
            queue.push(nbr);
          }
        });
      }
      components.push(comp);
    }
  });

  // Sort components by sequence order of their starting nodes
  components.sort((a, b) => {
    const minA = Math.min(...a.map((id) => stepMap.get(id)?.step_sequence || 0));
    const minB = Math.min(...b.map((id) => stepMap.get(id)?.step_sequence || 0));
    return minA - minB;
  });

  const nodePositions: Record<string, { x: number; y: number }> = {};
  let currentCompYOffset = 60;
  const HORIZONTAL_STEP = 380; // 290px card + 90px arrow clearance
  const MIN_NODE_GAP_Y = 240; // 150px card + 90px vertical clearance

  components.forEach((compIds) => {
    const compIncoming: Record<string, string[]> = {};
    const compOutgoing: Record<string, string[]> = {};
    compIds.forEach((id) => {
      compIncoming[id] = incomingMap[id].filter((pid) => compIds.includes(pid));
      compOutgoing[id] = outgoingMap[id].filter((sid) => compIds.includes(sid));
    });

    // 3. Assign topological levels (Longest Path DAG Ranking)
    const levelMap: Record<string, number> = {};
    const inDegrees: Record<string, number> = {};
    compIds.forEach((id) => {
      inDegrees[id] = compIncoming[id].length;
    });

    const roots = compIds.filter((id) => inDegrees[id] === 0);
    if (roots.length === 0 && compIds.length > 0) {
      roots.push(compIds[0]);
    }

    roots.forEach((rId) => {
      levelMap[rId] = 0;
    });

    // Bellman-Ford relaxation to ensure longest path ranking
    for (let iter = 0; iter < compIds.length; iter++) {
      let changed = false;
      compIds.forEach((u) => {
        const uLevel = levelMap[u] ?? 0;
        compOutgoing[u].forEach((v) => {
          const vLevel = levelMap[v] ?? 0;
          if (uLevel + 1 > vLevel) {
            levelMap[v] = uLevel + 1;
            changed = true;
          }
        });
      });
      if (!changed) break;
    }

    // Group into layers
    const layers: Record<number, string[]> = {};
    let maxLayer = 0;
    compIds.forEach((id) => {
      const lvl = levelMap[id] || 0;
      if (lvl > maxLayer) maxLayer = lvl;
      if (!layers[lvl]) layers[lvl] = [];
      layers[lvl].push(id);
    });

    // 4. Vertical layout with Barycentric heuristic + Non-overlapping relaxation
    const localY: Record<string, number> = {};

    // Layer 0 (roots)
    const rootLayer = layers[0] || [];
    rootLayer.sort((a, b) => {
      const stepA = stepMap.get(a);
      const stepB = stepMap.get(b);
      return (stepA?.step_sequence || 0) - (stepB?.step_sequence || 0);
    });
    rootLayer.forEach((id, idx) => {
      localY[id] = idx * MIN_NODE_GAP_Y;
    });

    // Forward sweep (Layer 1 to maxLayer): place node at barycentric average of predecessors
    for (let l = 1; l <= maxLayer; l++) {
      const layer = layers[l] || [];
      layer.forEach((id) => {
        const preds = compIncoming[id];
        if (preds.length > 0) {
          const sumY = preds.reduce((acc, pId) => acc + (localY[pId] ?? 0), 0);
          localY[id] = sumY / preds.length;
        } else {
          localY[id] = 0;
        }
      });

      layer.sort((a, b) => (localY[a] ?? 0) - (localY[b] ?? 0));

      for (let i = 1; i < layer.length; i++) {
        const prevId = layer[i - 1];
        const currId = layer[i];
        if (localY[currId] < localY[prevId] + MIN_NODE_GAP_Y) {
          localY[currId] = localY[prevId] + MIN_NODE_GAP_Y;
        }
      }
    }

    // Backward sweep (Layer maxLayer - 1 down to 0): softly center parents to successors
    for (let l = maxLayer - 1; l >= 0; l--) {
      const layer = layers[l] || [];
      layer.forEach((id) => {
        const succs = compOutgoing[id];
        if (succs.length > 0) {
          const sumY = succs.reduce((acc, sId) => acc + (localY[sId] ?? 0), 0);
          const desiredY = sumY / succs.length;
          localY[id] = (localY[id] + desiredY) / 2;
        }
      });

      layer.sort((a, b) => (localY[a] ?? 0) - (localY[b] ?? 0));
      for (let i = 1; i < layer.length; i++) {
        const prevId = layer[i - 1];
        const currId = layer[i];
        if (localY[currId] < localY[prevId] + MIN_NODE_GAP_Y) {
          localY[currId] = localY[prevId] + MIN_NODE_GAP_Y;
        }
      }
    }

    // Normalize component bounds
    let compMinY = Infinity;
    let compMaxY = -Infinity;
    compIds.forEach((id) => {
      const y = localY[id] ?? 0;
      if (y < compMinY) compMinY = y;
      if (y > compMaxY) compMaxY = y;
    });
    if (compMinY === Infinity) compMinY = 0;
    if (compMaxY === -Infinity) compMaxY = 0;

    compIds.forEach((id) => {
      const lvl = levelMap[id] || 0;
      const normalizedY = (localY[id] ?? 0) - compMinY;
      nodePositions[id] = {
        x: 60 + lvl * HORIZONTAL_STEP,
        y: currentCompYOffset + normalizedY,
      };
    });

    currentCompYOffset += compMaxY - compMinY + MIN_NODE_GAP_Y + 60;
  });

  // 5. Construct React Flow Nodes
  const nodeList: Node[] = stepsList.map((step, idx) => {
    const pos = nodePositions[step.id] || { x: 60 + idx * 300, y: 60 + idx * 150 };
    const assignedStation = stations.find(
      (st) => st.id === step.station_id || st.station_code === step.station_id
    );
    const assignedMachine = machines.find((m) => m.id === step.assigned_machine_id);
    const isUnassignedStation =
      (step.node_type || "PROCESS") === "PROCESS" && !assignedStation;
    const resolvedProductRole = resolveNodeRole(step.id);

    const nodeData: BopNodeData = {
      id: step.id,
      step_sequence: step.step_sequence || idx + 1,
      process_name: step.process_name,
      node_type: step.node_type || "PROCESS",
      product_role: resolvedProductRole,
      work_center_id: step.work_center_id,
      work_center_name: step.work_center_name,
      station_id: step.station_id,
      station_name: assignedStation
        ? assignedStation.station_name || assignedStation.station_code
        : undefined,
      assigned_machine_id: step.assigned_machine_id,
      machine_code: assignedMachine?.item_code,
      machine_name: assignedMachine?.name,
      machine_category: assignedMachine?.machine_category,
      cycle_time_minutes: step.cycle_time_minutes,
      is_unassigned_station: isUnassignedStation,
      sop_instruction: step.sop_instruction,
      qc_criteria: step.qc_criteria,
      qc_parameters: step.qc_parameters || [],
      notes: step.notes,
      expected_yield_rate: step.expected_yield_rate,
      bom_allocations:
        resolvedProductRole === "FINISHED_GOOD"
          ? []
          : step.bom_allocations?.map((a) => {
              const bomRef = projectBoms.find((b) => b.id === a.bom_id);
              return { ...a, bom_name: bomRef?.item_name || a.bom_name || a.bom_id };
            }),
      procurement_summary: step.procurement_summary || null,
      stock_status: (() => {
        if (
          step.node_type !== "PRODUCT" ||
          resolvedProductRole === "FINISHED_GOOD" ||
          !step.bom_allocations ||
          step.bom_allocations.length === 0
        )
          return undefined;
        let allGreen = true;
        let anyRed = false;

        step.bom_allocations.forEach((a) => {
          const bomRef = projectBoms.find((b) => b.id === a.bom_id);
          if (bomRef && bomRef.item_id) {
            const inv = inventoryItems.find(
              (i) => i.id === bomRef.item_id || i.item_id === bomRef.item_id
            );
            const requiredQty =
              (Number(bomRef.required_qty || bomRef.qty) || 0) * (a.fraction || 1);
            const freeStock = inv ? inv.free_stock || 0 : 0;
            if (freeStock < requiredQty) {
              allGreen = false;
              if (freeStock <= 0) {
                anyRed = true;
              }
            }
          } else {
            allGreen = false;
            anyRed = true;
          }
        });

        if (allGreen) return "GREEN";
        if (anyRed) return "RED";
        return "YELLOW";
      })(),
      incomingCount: (incomingMap[step.id] || []).length,
      outgoingCount: (outgoingMap[step.id] || []).length,
      isRoot: (incomingMap[step.id] || []).length === 0,
      onAddChild,
      onAddParallel,
      onDelete,
    };

    return {
      id: step.id,
      type: "bopStep",
      position: { x: pos.x, y: pos.y },
      data: nodeData,
      selected: selectedStepIds.includes(step.id),
    };
  });

  return { nodes: nodeList, edges: edgeList };
}
