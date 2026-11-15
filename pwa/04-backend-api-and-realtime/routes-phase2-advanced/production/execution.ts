import { Router } from "express";
import { cuttingRouter, evaluateProjectScmSupplyGate, backflushBomConsumptionForUnits } from "./cutting.ts";
import { assemblyRouter, resolveStepStationKey, runStationAutoOrchestration } from "./assembly.ts";
import { qcRouter } from "./qc.ts";
import { oeeRouter } from "./oee.ts";

export const executionRouter = Router();

// Mount modularized production execution sub-routers (Cutting/Material Prep, Assembly/WOT, QC/FGR, OEE/Capacity)
executionRouter.use(cuttingRouter);
executionRouter.use(assemblyRouter);
executionRouter.use(qcRouter);
executionRouter.use(oeeRouter);

export {
  cuttingRouter,
  assemblyRouter,
  qcRouter,
  oeeRouter,
  evaluateProjectScmSupplyGate,
  backflushBomConsumptionForUnits,
  resolveStepStationKey,
  runStationAutoOrchestration,
};
