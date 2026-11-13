/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { MotionConfig, AnimatePresence, motion } from "motion/react";
import Layout from "@/components/layouts/Layout";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Loader } from "@/components/shared/Loader";
import { AuthProvider, useAuth, Role } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ShareProvider } from "./contexts/ShareContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AttendanceReminder } from "@/components/shared/AttendanceReminder";
import { useOfflineSyncStore } from "@/stores/offlineSyncStore";

// Helper to handle dynamic chunk load retries when Vite updates bundles
function lazyRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    let lastError: any = null;
    const retryDelays = [250, 750, 1500];

    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        return await factory();
      } catch (error: any) {
        lastError = error;
        const msg = String(error?.message || error || "");
        const isChunkError =
          msg.includes("Failed to fetch dynamically imported module") ||
          msg.includes("Importing a module script failed") ||
          msg.includes("Outdated Optimize Dep") ||
          error?.name === "ChunkLoadError";

        if (isChunkError) {
          if (attempt < retryDelays.length) {
            await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
            continue;
          }

          // Hard reload once on final chunk load error if not recently reloaded
          try {
            const reloadKey = "chunk_lazy_retry_" + window.location.pathname;
            const lastRetry = sessionStorage.getItem(reloadKey);
            const now = Date.now();
            if (!lastRetry || now - Number(lastRetry) > 5000) {
              sessionStorage.setItem(reloadKey, String(now));
              window.location.reload();
              return new Promise<{ default: T }>(() => {});
            }
          } catch {
            window.location.reload();
            return new Promise<{ default: T }>(() => {});
          }
        }
        throw error;
      }
    }
    throw lastError;
  });
}

// Lazy load pages
const Overview = lazyRetry(() => import("./pages/erp/core/Overview"));
const Quotations = lazyRetry(() => import("./pages/erp/sales/Quotations"));
const DataCenter = lazyRetry(() => import("./pages/erp/admin/DataCenter"));
const ShopFloorExecution = lazyRetry(() => import("./pages/erp/production/ShopFloorExecution"));
const ManPower = lazyRetry(() => import("./pages/erp/production/ManPower"));
const MachineFleet = lazyRetry(() => import("./pages/erp/production/MachineFleet"));
const Procurement = lazyRetry(() => import("./pages/erp/procurement/Procurement"));
const ProcurementPlan = lazyRetry(() => import("./pages/erp/procurement/ProcurementPlan"));
const PpicPlanningHub = lazyRetry(() => import("./pages/erp/ppic/PpicPlanningHub"));
const PpicProjectDetail = lazyRetry(() => import("./pages/erp/ppic/PpicProjectDetail"));
const MaterialAllocations = lazyRetry(() => import("./pages/erp/ppic/MaterialAllocations"));
const Engineering = lazyRetry(() => import("./pages/erp/production/Engineering"));
const BopEngineeringPage = lazyRetry(() => import("./pages/erp/production/BopPage"));
const Requests = lazyRetry(() => import("./pages/erp/production/Requests"));
const ProjectDetails = lazyRetry(() => import("./pages/erp/production/ProjectDetails"));
const ShopFloorProjectDetail = lazyRetry(() => import("./pages/erp/production/ShopFloorProjectDetail"));
const ShopFloorTerminal = lazyRetry(() => import("./pages/erp/production/terminal/FloorTerminal"));
const IncomingMaterial = lazyRetry(() => import("./pages/erp/qc/IncomingMaterial"));
const ProcessQualityControl = lazyRetry(() => import("./pages/erp/qc/ProcessQualityControl"));
const Customers = lazyRetry(() => import("./pages/erp/sales/Customers"));
const Deliveries = lazyRetry(() => import("./pages/erp/sales/Deliveries"));
const Pricing = lazyRetry(() => import("./pages/erp/procurement/Pricing"));
const Warehouse = lazyRetry(() => import("./pages/erp/inventory/Warehouse"));
const Vendors = lazyRetry(() => import("./pages/erp/procurement/Vendors"));
const Logs = lazyRetry(() => import("./pages/erp/admin/Logs"));
const Login = lazyRetry(() => import("./pages/auth/Login"));
const Forum = lazyRetry(() => import("./pages/erp/core/Forum"));
const ManageAccounts = lazyRetry(() => import("./pages/erp/admin/Accounts"));
const CloudMigrationHub = lazyRetry(() => import("./pages/erp/admin/MigrationHub"));
const Workflow = lazyRetry(() => import("./pages/erp/admin/Workflow"));
const Invoices = lazyRetry(() => import("./pages/erp/sales/Invoices"));
const Payables = lazyRetry(() => import("./pages/erp/finance/Payables"));
const Payroll = lazyRetry(() => import("./pages/erp/finance/Payroll"));
const Finance = lazyRetry(() => import("./pages/erp/finance/Finance"));
const GeneralLedger = lazyRetry(() => import("./pages/erp/finance/GeneralLedger"));
const ReceivablesAging = lazyRetry(() => import("./pages/erp/finance/Receivables"));
const CashflowForecasting = lazyRetry(() => import("./pages/erp/finance/Cashflow"));
const ImportData = lazyRetry(() => import("./pages/erp/admin/ImportData"));
const HumanResource = lazyRetry(() => import("./pages/hris/HrPortal"));
const EmployeeSelfService = lazyRetry(
  () => import("./pages/hris/SelfService"),
);
const PublicHome = lazyRetry(() => import("./pages/public/Home"));
const Careers = lazyRetry(() => import("./pages/public/Careers"));
const Shop = lazyRetry(() => import("./pages/public/Shop"));
const ShopManagement = lazyRetry(() => import("./pages/erp/sales/ShopAdmin"));
const PotentialCustomers = lazyRetry(() => import("./pages/erp/sales/Leads"));
const HrLogin = lazyRetry(() => import("./pages/auth/HrLogin"));
const NotFound = lazyRetry(() => import("./pages/NotFound"));
const GeneralRequest = lazyRetry(() => import("./pages/erp/production/GeneralRequest"));
const DocumentWorkspace = lazyRetry(() => import("./pages/general/Workspace").then(m => ({ default: m.DocumentWorkspace })));
const PublicCmsAdmin = lazyRetry(() => import("./pages/erp/admin/PublicCmsAdmin"));

import HrLayout from "@/components/layouts/HrLayout";
import { Action, hasGodMode, hasPermission } from "./utils/pbac";

function ProtectedRoute({
  children,
  requiredAction,
  allowedRoles,
  fcOnly,
  allowCrossDepartmentPreview,
}: {
  children: React.ReactNode;
  requiredAction?: Action;
  allowedRoles?: string[];
  fcOnly?: boolean;
  allowCrossDepartmentPreview?: boolean;
}) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace />;

  if (String(user.role || "").trim().toUpperCase() === "OPERATOR") {
    return <Navigate to="/login" replace />;
  }

  if (hasGodMode(user)) return <>{children}</>;

  if (fcOnly) {
    if (user.role !== "FC" && !hasGodMode(user)) {
      return <Navigate to="/erp" replace />;
    }
  }

  // Cross-department preview bypass:
  // If the user arrived via a message/preview link (e.g. ?highlight=..., ?tab=ntp&ntp_id=..., ?open_ntp=..., ?preview=..., ?id=...)
  // and allowCrossDepartmentPreview is enabled for this route, allow read-only access.
  if (allowCrossDepartmentPreview) {
    const searchParams = new URLSearchParams(location.search);
    const isDocPreviewLink =
      searchParams.has("highlight") ||
      searchParams.has("ntp_id") ||
      searchParams.has("open_ntp") ||
      searchParams.has("preview") ||
      searchParams.has("doc_id") ||
      searchParams.has("id");

    if (isDocPreviewLink) {
      return <>{children}</>;
    }
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const roleUpper = String(user.role || "").trim().toUpperCase();
    if (!allowedRoles.includes(roleUpper)) {
      return <Navigate to="/erp" replace />;
    }
  }

  if (requiredAction) {
    if (!hasPermission(user, requiredAction)) {
      if (user.role === "PRODUCTION") {
        return <Navigate to="/production" replace />;
      }
      return <Navigate to="/erp" replace />;
    }
  }

  return <>{children}</>;
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const { user } = useAuth();

  const isPublicOrAuthRoute = [
    "/",
    "/careers",
    "/shop",
    "/login",
    "/hr-login",
  ].includes(location.pathname);
  const isHrRoute =
    location.pathname === "/hr" ||
    location.pathname.startsWith("/hr/") ||
    location.pathname === "/hris" ||
    location.pathname.startsWith("/hris/");
  const shellKey = isPublicOrAuthRoute
    ? location.pathname
    : isHrRoute
      ? "hr-shell"
      : "erp-shell";

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={shellKey}>
        {/* Unauthenticated / Public Routes */}
        <Route
          path="/"
          element={
            <Suspense fallback={<Loader fullScreen text="Loading..." />}>
              <PageWrapper>
                <PublicHome />
              </PageWrapper>
            </Suspense>
          }
        />
        <Route
          path="/careers"
          element={
            <Suspense fallback={<Loader fullScreen text="Loading..." />}>
              <PageWrapper>
                <Careers />
              </PageWrapper>
            </Suspense>
          }
        />
        <Route
          path="/shop"
          element={
            <Suspense fallback={<Loader fullScreen text="Loading Shop..." />}>
              <PageWrapper>
                <Shop />
              </PageWrapper>
            </Suspense>
          }
        />
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/erp" replace />
            ) : (
              <Suspense
                fallback={<Loader fullScreen text="Loading Session..." />}
              >
                <PageWrapper>
                  <Login />
                </PageWrapper>
              </Suspense>
            )
          }
        />
        <Route
          path="/hr-login"
          element={
            user ? (
              <Navigate to="/hr" replace />
            ) : (
              <Suspense
                fallback={<Loader fullScreen text="Loading HR Session..." />}
              >
                <PageWrapper>
                  <HrLogin />
                </PageWrapper>
              </Suspense>
            )
          }
        />

        {/* Standalone Protected HR Portal */}
        <Route
          path="/hr"
          element={
            !user ? (
              <Navigate to="/hr-login" replace />
            ) : user.role !== "HR" && !hasGodMode(user) ? (
              <Navigate to="/erp" replace />
            ) : (
              <HrLayout>
                <ErrorBoundary>
                  <Suspense fallback={<Loader text="Loading HR Portal..." />}>
                    <PageWrapper>
                      <HumanResource />
                    </PageWrapper>
                  </Suspense>
                </ErrorBoundary>
              </HrLayout>
            )
          }
        />
        <Route
          path="/hr/*"
          element={
            !user ? (
              <Navigate to="/hr-login" replace />
            ) : user.role !== "HR" && !hasGodMode(user) ? (
              <Navigate to="/erp" replace />
            ) : (
              <HrLayout>
                <ErrorBoundary>
                  <Suspense fallback={<Loader text="Loading HR Portal..." />}>
                    <PageWrapper>
                      <HumanResource />
                    </PageWrapper>
                  </Suspense>
                </ErrorBoundary>
              </HrLayout>
            )
          }
        />
        <Route path="/hris" element={<Navigate to="/hr" replace />} />
        <Route path="/hris/*" element={<Navigate to="/hr" replace />} />

        {/* Protected ERP Paths */}
        <Route
          path="/*"
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : (
              <Layout>
                <ErrorBoundary>
                  <Suspense fallback={<Loader text="Loading Module..." />}>
                    <AnimatePresence mode="wait">
                      <Routes location={location} key={location.pathname}>
                      <Route
                        path="/erp"
                        element={
                          <PageWrapper>
                            <Overview />
                          </PageWrapper>
                        }
                      />
                      <Route
                        path="/ess"
                        element={
                          <PageWrapper>
                            <EmployeeSelfService />
                          </PageWrapper>
                        }
                      />
                      <Route
                        path="/quotations"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_QUOTATIONS}
                            allowedRoles={["SALES"]}
                            allowCrossDepartmentPreview
                          >
                            <PageWrapper>
                              <Quotations />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/shop-management"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_QUOTATIONS}
                            allowedRoles={["SALES"]}
                          >
                            <PageWrapper>
                              <ShopManagement />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/potential-customers"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_QUOTATIONS}
                            allowedRoles={["SALES"]}
                          >
                            <PageWrapper>
                              <PotentialCustomers />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/data-center"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_MASTER_DATA}
                          >
                            <PageWrapper>
                              <DataCenter />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/import"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_MASTER_DATA}
                          >
                            <PageWrapper>
                              <ImportData />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/ppic"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.PLAN_PRODUCTION_MRP}
                            allowedRoles={["PPIC"]}
                          >
                            <PageWrapper>
                              <PpicPlanningHub />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/ppic/setup-master"
                        element={<Navigate to="/ppic" replace />}
                      />
                      <Route
                        path="/ppic/projects/:id"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.PLAN_PRODUCTION_MRP}
                            allowedRoles={["PPIC"]}
                          >
                            <PageWrapper>
                              <PpicProjectDetail />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/ppic/setup-master/:id"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.PLAN_PRODUCTION_MRP}
                            allowedRoles={["PPIC"]}
                          >
                            <PageWrapper>
                              <PpicProjectDetail />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/ppic/material-allocations"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.PLAN_PRODUCTION_MRP}
                            allowedRoles={["PPIC"]}
                          >
                            <PageWrapper>
                              <MaterialAllocations />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/production"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PRODUCTION}
                            allowedRoles={["PRODUCTION"]}
                          >
                            <PageWrapper>
                              <ShopFloorExecution />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/production/manpower"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PRODUCTION}
                            allowedRoles={["PRODUCTION"]}
                          >
                            <PageWrapper>
                              <ManPower />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/production/machines"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PRODUCTION}
                            allowedRoles={["PRODUCTION", "ENGINEERING"]}
                          >
                            <PageWrapper>
                              <MachineFleet />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/production/project/:id"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PRODUCTION}
                            allowedRoles={["PRODUCTION"]}
                          >
                            <PageWrapper>
                              <ShopFloorProjectDetail />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/production/projects/:id"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PRODUCTION}
                            allowedRoles={["PRODUCTION"]}
                          >
                            <PageWrapper>
                              <ShopFloorProjectDetail />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/qc/incoming-material"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.INSPECT_QC}
                            allowedRoles={["QA_QC"]}
                          >
                            <PageWrapper>
                              <IncomingMaterial />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/qc/process-inspection"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.INSPECT_QC}
                            allowedRoles={["QA_QC"]}
                          >
                            <PageWrapper>
                              <ProcessQualityControl />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/shopfloor"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PRODUCTION}
                            allowedRoles={["PRODUCTION"]}
                          >
                            <PageWrapper>
                              <ShopFloorTerminal />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/project/:id"
                        element={
                          <PageWrapper>
                            <ProjectDetails />
                          </PageWrapper>
                        }
                      />
                      <Route
                        path="/procurement"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PROCUREMENT}
                            allowedRoles={["PURCHASING"]}
                            allowCrossDepartmentPreview
                          >
                            <PageWrapper>
                              <Procurement />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/procurement-plan"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.PLAN_PRODUCTION_MRP}
                            allowedRoles={["PPIC"]}
                          >
                            <PageWrapper>
                              <ProcurementPlan />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/engineering"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_BOM}
                            allowedRoles={["ENGINEERING"]}
                            allowCrossDepartmentPreview
                          >
                            <PageWrapper>
                              <Engineering />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/engineering/bop"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_BOM}
                            allowedRoles={["ENGINEERING"]}
                          >
                            <PageWrapper>
                              <BopEngineeringPage />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/engineering/bop/:id"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_BOM}
                            allowedRoles={["ENGINEERING"]}
                          >
                            <PageWrapper>
                              <BopEngineeringPage />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/projects/:id"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_BOM}
                            allowedRoles={["ENGINEERING", "PPIC"]}
                          >
                            <PageWrapper>
                              <BopEngineeringPage />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/requests"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_DESIGN_REQUESTS}
                            allowedRoles={["PPIC"]}
                          >
                            <PageWrapper>
                              <Requests />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/general-requests"
                        element={
                          <PageWrapper>
                            <GeneralRequest />
                          </PageWrapper>
                        }
                      />
                      <Route
                        path="/document-workspace"
                        element={
                          <PageWrapper>
                            <DocumentWorkspace />
                          </PageWrapper>
                        }
                      />
                      <Route
                        path="/pricing"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PRICING}
                            allowedRoles={["PURCHASING"]}
                          >
                            <PageWrapper>
                              <Pricing />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/warehouse"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_WAREHOUSE}
                          >
                            <PageWrapper>
                              <Warehouse />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/customers"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_CUSTOMERS}
                            allowedRoles={["SALES"]}
                          >
                            <PageWrapper>
                              <Customers />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/deliveries"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_DELIVERIES}
                            allowedRoles={["SALES"]}
                          >
                            <PageWrapper>
                              <Deliveries />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/invoices"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_INVOICES}
                            allowedRoles={["FINANCE"]}
                            allowCrossDepartmentPreview
                          >
                            <PageWrapper>
                              <Invoices />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/payables"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_FINANCE}
                            allowedRoles={["FINANCE"]}
                          >
                            <PageWrapper>
                              <Payables />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/payroll"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_FINANCE}
                            allowedRoles={["FINANCE"]}
                          >
                            <PageWrapper>
                              <Payroll />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/finance"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_FINANCE}
                            allowedRoles={["FINANCE"]}
                          >
                            <PageWrapper>
                              <Finance />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/general-ledger"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_FINANCE}
                            allowedRoles={["FINANCE"]}
                          >
                            <PageWrapper>
                              <GeneralLedger />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/ar-aging"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_FINANCE}
                            allowedRoles={["FINANCE"]}
                          >
                            <PageWrapper>
                              <ReceivablesAging />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/cashflow-forecast"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_FINANCE}
                            allowedRoles={["FINANCE"]}
                          >
                            <PageWrapper>
                              <CashflowForecasting />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/vendors"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_VENDORS}
                            allowedRoles={["PURCHASING"]}
                          >
                            <PageWrapper>
                              <Vendors />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/forum"
                        element={
                          <PageWrapper>
                            <Forum />
                          </PageWrapper>
                        }
                      />
                      <Route
                        path="/logs"
                        element={
                          <ProtectedRoute fcOnly>
                            <PageWrapper>
                              <Logs />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/workflow"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_WORKFLOW_QUEUE}
                          >
                            <PageWrapper>
                              <Workflow />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/manage-accounts"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.MANAGE_ACCOUNTS}
                          >
                            <PageWrapper>
                              <ManageAccounts />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/cloud-migration"
                        element={
                          <ProtectedRoute fcOnly>
                            <PageWrapper>
                              <CloudMigrationHub />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/migration"
                        element={
                          <ProtectedRoute fcOnly>
                            <PageWrapper>
                              <CloudMigrationHub />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/cms-public"
                        element={
                          <ProtectedRoute
                            allowedRoles={["FC", "ADMIN", "SALES", "HR", "GOD_MODE"]}
                          >
                            <PageWrapper>
                              <PublicCmsAdmin />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="*"
                        element={
                          <PageWrapper>
                            <NotFound />
                          </PageWrapper>
                        }
                      />
                      </Routes>
                    </AnimatePresence>
                  </Suspense>
                </ErrorBoundary>
              </Layout>
            )
          }
        />
      </Routes>
    </AnimatePresence>
  );
}

function PageTitleManager() {
  const location = useLocation();

  useEffect(() => {
    const { pathname } = location;

    // Public routes: /, /login, /hr-login, /careers, /careers/*, /shop, /shop/*
    if (
      pathname === "/" ||
      pathname === "/login" ||
      pathname === "/hr-login" ||
      pathname === "/careers" ||
      pathname.startsWith("/careers/") ||
      pathname === "/shop" ||
      pathname.startsWith("/shop/")
    ) {
      document.title = "Paving Joss";
      return;
    }

    // HRIS routes: /hr, /hr/*, /ess, /ess/*
    if (
      pathname === "/hr" ||
      pathname.startsWith("/hr/") ||
      pathname === "/ess" ||
      pathname.startsWith("/ess/")
    ) {
      document.title = "HRIS - Paving Joss";
      return;
    }

    // ERP routes: all other internal operations (/erp, /quotations, /production, /warehouse, etc.)
    document.title = "ERP - Paving Joss";
  }, [location.pathname]);

  return null;
}

function OfflineSyncManager() {
  const { loadQueue, setOfflineStatus } = useOfflineSyncStore();
  
  useEffect(() => {
    loadQueue();
    const handleOnline = () => setOfflineStatus(false);
    const handleOffline = () => setOfflineStatus(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadQueue, setOfflineStatus]);
  
  return null;
}

import { MobileMonitoringProvider } from "./contexts/MonitoringContext";
import { ThemeProvider } from "./contexts/ThemeContext";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LanguageProvider>
          <NotificationProvider>
            <ToastProvider>
              <ShareProvider>
                <MotionConfig reducedMotion="user">
                  <BrowserRouter>
                    <ThemeProvider>
                      <MobileMonitoringProvider>
                        <PageTitleManager />
                        <OfflineSyncManager />
                        <AnimatedRoutes />
                        <AttendanceReminder />
                      </MobileMonitoringProvider>
                    </ThemeProvider>
                  </BrowserRouter>
                </MotionConfig>
              </ShareProvider>
            </ToastProvider>
          </NotificationProvider>
        </LanguageProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
