import { Router } from "express";
import { registerScoutLeadsRoutes } from "./sales/scoutLeadsRoutes.ts";
import { registerCustomersRoutes } from "./sales/customersRoutes.ts";
import { registerQuotationsRoutes } from "./sales/quotationsRoutes.ts";
import { registerDeliveriesRoutes } from "./sales/deliveriesRoutes.ts";
import { registerInvoicesAtpRoutes } from "./sales/invoicesAtpRoutes.ts";

export const salesRouter = Router();

registerScoutLeadsRoutes(salesRouter);
registerCustomersRoutes(salesRouter);
registerQuotationsRoutes(salesRouter);
registerDeliveriesRoutes(salesRouter);
registerInvoicesAtpRoutes(salesRouter);
