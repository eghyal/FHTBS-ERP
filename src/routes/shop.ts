import { Router } from "express";
import { registerPublicStorefrontRoutes } from "./shop/publicStorefrontRoutes.ts";
import { registerCustomerAuthOrdersRoutes } from "./shop/customerAuthOrdersRoutes.ts";
import { registerErpShopManagementRoutes } from "./shop/erpShopManagementRoutes.ts";

export const shopRouter = Router();

registerPublicStorefrontRoutes(shopRouter);
registerCustomerAuthOrdersRoutes(shopRouter);
registerErpShopManagementRoutes(shopRouter);
export default shopRouter;
