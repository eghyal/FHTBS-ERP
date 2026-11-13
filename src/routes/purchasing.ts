import { Router } from "express";
import { registerSuppliersPrsRoutes } from "./purchasing/suppliersPrsRoutes.ts";
import { registerPurchaseOrdersRoutes } from "./purchasing/purchaseOrdersRoutes.ts";
import { registerGrnInventoryRoutes } from "./purchasing/grnInventoryRoutes.ts";
import { registerProcurementPlanRoutes } from "./purchasing/procurementPlanRoutes.ts";

export const purchasingRouter = Router();

registerSuppliersPrsRoutes(purchasingRouter);
registerPurchaseOrdersRoutes(purchasingRouter);
registerGrnInventoryRoutes(purchasingRouter);
registerProcurementPlanRoutes(purchasingRouter);
export default purchasingRouter;
