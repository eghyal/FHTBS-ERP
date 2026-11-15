import { Router } from "express";
import { registerOverviewTasksRoutes } from "./projects/overviewTasksRoutes.ts";
import { registerMrpProcurementRoutes } from "./projects/mrpProcurementRoutes.ts";
import { registerLifecycleNtpRoutes } from "./projects/lifecycleNtpRoutes.ts";
import { registerBomEcoRoutes } from "./projects/bomEcoRoutes.ts";

export const router = Router();

registerOverviewTasksRoutes(router);
registerMrpProcurementRoutes(router);
registerLifecycleNtpRoutes(router);
registerBomEcoRoutes(router);

export default router;
