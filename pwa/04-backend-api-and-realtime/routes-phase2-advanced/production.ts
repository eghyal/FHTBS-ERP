import { Router } from "express";
import { ndpRouter } from "./production/ndp.ts";
import { manpowerRouter } from "./production/manpower.ts";
import { planningRouter } from "./production/planning.ts";
import { bopRouter } from "./production/bop.ts";
import { analyticsRouter } from "./production/analytics.ts";
import { executionRouter } from "./production/execution.ts";
import { commandCenterRouter } from "./production/commandCenter.ts";

export const router = Router();

router.use(ndpRouter);
router.use(manpowerRouter);
router.use(planningRouter);
router.use(bopRouter);
router.use(analyticsRouter);
router.use(executionRouter);
router.use(commandCenterRouter);
