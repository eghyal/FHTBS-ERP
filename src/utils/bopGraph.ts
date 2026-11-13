// Utility for analyzing Bill of Processes (BOP) Directed Acyclic Graph (DAG)
// Handles Precedence, Sequential Lineage (A -> B), and Parallel Branch Detection (A // C)

export interface BopStepGraphNode {
  id: string;
  process_name?: string;
  name?: string;
  predecessor_ids?: string[] | string;
  node_type?: string;
  step_sequence?: number;
  [key: string]: any;
}

export interface BopDAG {
  nodesMap: Map<string, BopStepGraphNode>;
  adjacencyList: Map<string, string[]>; // stepId -> successors (downstream steps)
  predecessorsList: Map<string, string[]>; // stepId -> predecessors (upstream steps)
}

/**
 * Parses predecessor IDs from raw field (handles JSON string, array, or empty values)
 */
export function parsePredecessorIds(raw: string[] | string | undefined | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Builds directed graph structures (adjacency and predecessor lists) from BOP steps
 */
export function buildBopDAG(steps: BopStepGraphNode[]): BopDAG {
  const nodesMap = new Map<string, BopStepGraphNode>();
  const adjacencyList = new Map<string, string[]>();
  const predecessorsList = new Map<string, string[]>();

  // Initialize
  steps.forEach((step) => {
    nodesMap.set(step.id, step);
    adjacencyList.set(step.id, []);
    predecessorsList.set(step.id, []);
  });

  // Populate edges
  steps.forEach((step) => {
    const preds = parsePredecessorIds(step.predecessor_ids);
    predecessorsList.set(step.id, preds);

    preds.forEach((predId) => {
      if (adjacencyList.has(predId)) {
        adjacencyList.get(predId)!.push(step.id);
      }
    });
  });

  return { nodesMap, adjacencyList, predecessorsList };
}

/**
 * Checks if targetId is reachable from startId going downstream along the successor edges (startId -> ... -> targetId)
 */
export function isReachableDownstream(startId: string, targetId: string, dag: BopDAG): boolean {
  if (startId === targetId) return true;
  const visited = new Set<string>();
  const queue: string[] = [startId];
  let guard = 0;

  while (queue.length > 0 && guard < 1000) {
    guard++;
    const current = queue.shift()!;
    if (current === targetId && current !== startId) return true;

    if (!visited.has(current)) {
      visited.add(current);
      const successors = dag.adjacencyList.get(current) || [];
      for (const succ of successors) {
        if (succ === targetId) return true;
        if (!visited.has(succ)) {
          queue.push(succ);
        }
      }
    }
  }

  return false;
}

export type BopProductRole = "MATERIAL_INPUT" | "WIP_SUB_ASSY" | "FINISHED_GOOD";

/**
 Topologically resolves the role of a PRODUCT card in the BOP DAG:
 * - MATERIAL_INPUT: No incoming predecessors (feeds into downstream process)
 * - WIP_SUB_ASSY: Has both incoming predecessors and outgoing successors (IPQC gate & intermediate sub-assembly)
 * - FINISHED_GOOD: Has incoming predecessors and no outgoing successors (Final QC output)
 */
export function resolveBopProductRole(
  stepId: string,
  steps: BopStepGraphNode[],
): BopProductRole {
  const step = steps.find((s) => s.id === stepId);
  if (!step) return "MATERIAL_INPUT";

  const validIds = new Set(steps.map((s) => s.id));
  const incomingPreds = parsePredecessorIds(step.predecessor_ids).filter((pid) =>
    validIds.has(pid),
  );
  const outgoingSteps = steps.filter((s) =>
    parsePredecessorIds(s.predecessor_ids).includes(stepId),
  );

  if (incomingPreds.length === 0) return "MATERIAL_INPUT";
  if (outgoingSteps.length > 0) return "WIP_SUB_ASSY";
  return "FINISHED_GOOD";
}

/**
 * Checks if updating `stepIdToUpdate` with `candidatePredIds` would introduce a cycle in the BOP DAG.
 */
export function checkHasCycle(
  stepIdToUpdate: string,
  candidatePredIds: string[],
  currentSteps: BopStepGraphNode[],
): boolean {
  if (candidatePredIds.includes(stepIdToUpdate)) return true;

  const predMap = new Map<string, string[]>();
  currentSteps.forEach((s) => {
    predMap.set(
      s.id,
      s.id === stepIdToUpdate
        ? candidatePredIds
        : parsePredecessorIds(s.predecessor_ids),
    );
  });

  for (const startPredId of candidatePredIds) {
    const queue = [startPredId];
    const visited = new Set<string>();
    let bfsGuard = 0;

    while (queue.length > 0 && bfsGuard < 1000) {
      bfsGuard++;
      const curr = queue.shift()!;
      if (curr === stepIdToUpdate) return true;

      if (!visited.has(curr)) {
        visited.add(curr);
        const currPreds = predMap.get(curr) || [];
        for (const p of currPreds) {
          if (!visited.has(p)) {
            queue.push(p);
          }
        }
      }
    }
  }

  return false;
}


export type BopRelationType = "SAME" | "SEQUENTIAL_DOWNSTREAM" | "SEQUENTIAL_UPSTREAM" | "PARALLEL";

export interface BopRelationshipResult {
  relationType: BopRelationType;
  isAllowedForMultitask: boolean;
  stepAName: string;
  stepBName: string;
  description: string;
}

/**
 * Analyzes relationship between two BOP steps:
 * - A -> B (Sequential Downstream): Manpower in A can multitask to B (auto-pausing A).
 * - B -> A (Sequential Upstream): Manpower in B can multitask to A.
 * - A // C (Parallel/Independent): Manpower in A CANNOT be assigned to C simultaneously.
 */
export function getBopRelationship(stepAId: string, stepBId: string, allSteps: BopStepGraphNode[]): BopRelationshipResult {
  if (stepAId === stepBId) {
    const step = allSteps.find(s => s.id === stepAId);
    const name = step?.process_name || step?.name || stepAId;
    return {
      relationType: "SAME",
      isAllowedForMultitask: false,
      stepAName: name,
      stepBName: name,
      description: `Same Step (${name})`,
    };
  }

  const dag = buildBopDAG(allSteps);
  const stepA = dag.nodesMap.get(stepAId);
  const stepB = dag.nodesMap.get(stepBId);

  const stepAName = stepA?.process_name || stepA?.name || stepAId;
  const stepBName = stepB?.process_name || stepB?.name || stepBId;

  // Check if A is ancestor of B (A -> ... -> B)
  const isADownstreamToB = isReachableDownstream(stepAId, stepBId, dag);
  if (isADownstreamToB) {
    return {
      relationType: "SEQUENTIAL_DOWNSTREAM",
      isAllowedForMultitask: true,
      stepAName,
      stepBName,
      description: `Sequential Lineage (${stepAName} ➔ ${stepBName})`,
    };
  }

  // Check if B is ancestor of A (B -> ... -> A)
  const isBDownstreamToA = isReachableDownstream(stepBId, stepAId, dag);
  if (isBDownstreamToA) {
    return {
      relationType: "SEQUENTIAL_UPSTREAM",
      isAllowedForMultitask: true,
      stepAName,
      stepBName,
      description: `Sequential Lineage (${stepBName} ➔ ${stepAName})`,
    };
  }

  // Neither is reachable from the other -> Parallel / Independent branch
  return {
    relationType: "PARALLEL",
    isAllowedForMultitask: false,
    stepAName,
    stepBName,
    description: `Independent Parallel Process (${stepAName} // ${stepBName})`,
  };
}

export interface ManpowerSequentialValidation {
  isValid: boolean;
  conflictType: "NONE" | "SAME_STEP" | "PARALLEL_CONFLICT";
  conflictStepName?: string;
  sequentialStepName?: string;
  message: string;
}

/**
 * Validates if an operator already assigned to certain steps can take on a target step
 */
export function validateManpowerSequentialAssignment(
  targetBopId: string,
  existingAssignedBopIds: string[],
  allSteps: BopStepGraphNode[]
): ManpowerSequentialValidation {
  if (existingAssignedBopIds.length === 0) {
    return {
      isValid: true,
      conflictType: "NONE",
      message: "Operator is available for assignment.",
    };
  }

  const targetStep = allSteps.find(s => s.id === targetBopId);
  const targetName = targetStep?.process_name || targetStep?.name || targetBopId;

  for (const existingId of existingAssignedBopIds) {
    const relation = getBopRelationship(existingId, targetBopId, allSteps);

    if (relation.relationType === "SAME") {
      return {
        isValid: false,
        conflictType: "SAME_STEP",
        conflictStepName: relation.stepAName,
        message: `Operator is already assigned to process "${relation.stepAName}". Duplicate assignment is not required.`,
      };
    }

    if (relation.relationType === "PARALLEL") {
      return {
        isValid: false,
        conflictType: "PARALLEL_CONFLICT",
        conflictStepName: relation.stepAName,
        message: `Operator cannot be assigned to process "${targetName}" because they are already assigned to parallel process "${relation.stepAName}". Operators may only multi-task across sequential steps (Sequential Lineage: A ➔ B).`,
      };
    }
  }

  const firstExisting = allSteps.find(s => s.id === existingAssignedBopIds[0]);
  const existingName = firstExisting?.process_name || firstExisting?.name || existingAssignedBopIds[0];

  return {
    isValid: true,
    conflictType: "NONE",
    sequentialStepName: existingName,
    message: `Sequential multi-stage assignment (${existingName} ➔ ${targetName}) is permitted. The upstream process will automatically pause while the operator is active on this stage to maximize labor efficiency.`,
  };
}

/**
 * Recursively collects all upstream PRODUCT nodes feeding into a given BOP step.
 */
export function getUpstreamProductNodes(
  stepId: string,
  allSteps: BopStepGraphNode[],
  visited = new Set<string>(),
): BopStepGraphNode[] {
  if (visited.has(stepId)) return [];
  visited.add(stepId);

  const step = allSteps.find((s) => s.id === stepId);
  if (!step) return [];

  const preds = parsePredecessorIds(step.predecessor_ids);
  const productsFound: BopStepGraphNode[] = [];

  for (const pId of preds) {
    const pStep = allSteps.find((s) => s.id === pId);
    if (pStep) {
      if (pStep.node_type === "PRODUCT") {
        productsFound.push(pStep);
      } else {
        productsFound.push(...getUpstreamProductNodes(pId, allSteps, visited));
      }
    }
  }

  return productsFound;
}

export interface SmartBopPriorityAnalysis {
  priorityTier: "CRITICAL_MAIN" | "CORE_PROCESS" | "SUPPORTING";
  priorityLabel: string;
  priorityScore: number;
  downstreamProcessCount: number;
  totalProcessCount: number;
  isCriticalPath: boolean;
  floatMinutes: number;
  dagDepth: number;
  maxDagDepth: number;
  consumingProcessName: string;
  reason: string;
}

/**
 * Automatically evaluates the Manufacturing Procurement Priority of a material allocated
 * to a given BOP step (PRODUCT or PROCESS node) using:
 * 1. Downstream Process Blocking Impact (how many downstream PROCESS nodes depend on it)
 * 2. CPM Critical Path & Float Slack (whether the consuming process has zero float)
 * 3. BOP DAG Depth & Material Role
 */
export function analyzeBopNodeMaterialPriority(
  stepId: string,
  allSteps: BopStepGraphNode[],
  materialLabel = "",
): SmartBopPriorityAnalysis {
  const processNodes = allSteps.filter(
    (s) => String(s.node_type || "PROCESS").toUpperCase() === "PROCESS",
  );
  const effectiveProcessNodes =
    processNodes.length > 0 ? processNodes : allSteps;
  const totalProcessCount = Math.max(1, effectiveProcessNodes.length);

  const dag = buildBopDAG(allSteps);
  const currentStep = dag.nodesMap.get(stepId) || allSteps[0];

  if (!currentStep) {
    return {
      priorityTier: "CRITICAL_MAIN",
      priorityLabel: "Critical",
      priorityScore: 85,
      downstreamProcessCount: 1,
      totalProcessCount: 1,
      isCriticalPath: true,
      floatMinutes: 0,
      dagDepth: 0,
      maxDagDepth: 0,
      consumingProcessName: "Process 1",
      reason: "CPM · Blocks 1/1 steps",
    };
  }

  // Find the target PROCESS node that consumes this PRODUCT node (or the PROCESS node itself)
  let targetProcess = currentStep;
  if (String(currentStep.node_type || "").toUpperCase() === "PRODUCT") {
    const directConsumer = effectiveProcessNodes.find((p) =>
      parsePredecessorIds(p.predecessor_ids).includes(currentStep.id),
    );
    const directProducer = effectiveProcessNodes.find((p) =>
      parsePredecessorIds(currentStep.predecessor_ids).includes(p.id),
    );
    targetProcess = directConsumer || directProducer || effectiveProcessNodes[0] || currentStep;
  }

  // Compute CPM Forward/Backward Pass across all steps
  const esMap: Record<string, number> = {};
  const efMap: Record<string, number> = {};
  const depthMap: Record<string, number> = {};
  const validIds = new Set(allSteps.map((s) => s.id));

  allSteps.forEach((s, idx) => {
    const preds = parsePredecessorIds(s.predecessor_ids).filter((pid) =>
      validIds.has(pid),
    );
    const effectivePreds =
      preds.length > 0 ? preds : idx > 0 ? [allSteps[idx - 1].id] : [];
    const maxPredEf =
      effectivePreds.length > 0
        ? Math.max(...effectivePreds.map((pid) => efMap[pid] || 0))
        : 0;
    const maxPredDepth =
      effectivePreds.length > 0
        ? Math.max(...effectivePreds.map((pid) => depthMap[pid] || 0))
        : 0;
    const ct =
      String(s.node_type || "PROCESS").toUpperCase() === "PRODUCT"
        ? 0
        : Math.max(1, Number(s.cycle_time_minutes) || 20);
    esMap[s.id] = maxPredEf;
    efMap[s.id] = maxPredEf + ct;
    depthMap[s.id] = effectivePreds.length > 0 ? maxPredDepth + 1 : 0;
  });

  const maxEf = Math.max(1, ...Object.values(efMap));
  const maxDagDepth = Math.max(1, ...Object.values(depthMap));

  const lfMap: Record<string, number> = {};
  const lsMap: Record<string, number> = {};
  const floatMap: Record<string, number> = {};

  [...allSteps].reverse().forEach((s, revIdx) => {
    const origIdx = allSteps.length - 1 - revIdx;
    const explicitSuccs = allSteps.filter((other) =>
      parsePredecessorIds(other.predecessor_ids).includes(s.id),
    );
    const effectiveSuccs =
      explicitSuccs.length > 0
        ? explicitSuccs
        : origIdx < allSteps.length - 1
          ? [allSteps[origIdx + 1]]
          : [];
    const minSuccLs =
      effectiveSuccs.length > 0
        ? Math.min(...effectiveSuccs.map((sc) => lsMap[sc.id] ?? maxEf))
        : maxEf;
    const ct =
      String(s.node_type || "PROCESS").toUpperCase() === "PRODUCT"
        ? 0
        : Math.max(1, Number(s.cycle_time_minutes) || 20);
    lfMap[s.id] = minSuccLs;
    lsMap[s.id] = Math.max(0, minSuccLs - ct);
    floatMap[s.id] = Math.max(0, lsMap[s.id] - (esMap[s.id] || 0));
  });

  // Count how many PROCESS nodes are impacted (targetProcess + downstream reachable PROCESS nodes)
  let downstreamProcessCount = 0;
  effectiveProcessNodes.forEach((proc) => {
    if (
      proc.id === targetProcess.id ||
      isReachableDownstream(targetProcess.id, proc.id, dag) ||
      isReachableDownstream(currentStep.id, proc.id, dag)
    ) {
      downstreamProcessCount++;
    }
  });
  if (downstreamProcessCount === 0) {
    // Fallback using step_sequence order if graph edges are not yet drawn
    const targetSeq = Number(targetProcess.step_sequence || 1);
    downstreamProcessCount = Math.max(
      1,
      effectiveProcessNodes.filter(
        (p, idx) => Number(p.step_sequence || idx + 1) >= targetSeq,
      ).length,
    );
  }

  const blockingRatio = Math.min(
    1,
    downstreamProcessCount / Math.max(1, totalProcessCount),
  );
  const floatMinutes = Math.round(floatMap[targetProcess.id] || 0);
  const isCriticalPath = floatMinutes <= 1;
  const dagDepth = depthMap[targetProcess.id] || 0;

  const matUpper = String(materialLabel || "").toUpperCase();
  const isConsumableOrFinishing =
    /CONSUMABLE|FASTENER|BOLT|NUT|WASHER|SCREW|PACKAGING|CARTON|LABEL|PAINT|THINNER|ABRASIVE|FINISHING/.test(
      matUpper,
    );

  // 1. Downstream Process Blocking Score (0 - 40 pts)
  const blockingScore = Math.round(blockingRatio * 40);

  // 2. CPM Critical Path Score (0 - 35 pts)
  const cpmScore = isCriticalPath
    ? 35
    : floatMinutes <= 15
      ? 20
      : 8;

  // 3. BOP Node Depth & Role Score (0 - 25 pts)
  let depthScore = 14;
  if (isConsumableOrFinishing) {
    depthScore = 4;
  } else if (dagDepth === 0 || blockingRatio >= 0.75) {
    depthScore = 25;
  } else if (downstreamProcessCount <= 1 && totalProcessCount >= 3) {
    depthScore = 5;
  }

  const priorityScore = Math.min(
    100,
    Math.max(10, blockingScore + cpmScore + depthScore),
  );

  let priorityTier: "CRITICAL_MAIN" | "CORE_PROCESS" | "SUPPORTING" =
    "CORE_PROCESS";
  let priorityLabel = "Core Process";

  if (
    !isConsumableOrFinishing &&
    (priorityScore >= 68 || (dagDepth === 0 && isCriticalPath))
  ) {
    priorityTier = "CRITICAL_MAIN";
    priorityLabel = "Critical";
  } else if (
    isConsumableOrFinishing ||
    priorityScore < 38 ||
    (downstreamProcessCount <= 1 && totalProcessCount >= 3 && !isCriticalPath)
  ) {
    priorityTier = "SUPPORTING";
    priorityLabel = "Supporting";
  } else {
    priorityTier = "CORE_PROCESS";
    priorityLabel = "Core Process";
  }

  const cpmTag = isCriticalPath ? "CPM" : `Float ${floatMinutes}m`;
  const blockTag = `Blocks ${downstreamProcessCount}/${totalProcessCount} steps`;

  return {
    priorityTier,
    priorityLabel,
    priorityScore,
    downstreamProcessCount,
    totalProcessCount,
    isCriticalPath,
    floatMinutes,
    dagDepth,
    maxDagDepth,
    consumingProcessName:
      targetProcess.process_name || targetProcess.name || "Process",
    reason: `${cpmTag} · ${blockTag}`,
  };
}


