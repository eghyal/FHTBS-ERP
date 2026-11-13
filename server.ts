import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { initDb } from "./src/db/database.ts";
import {
  initPostgresDb,
  rehydrateSqliteFromSupabase,
  getSupabaseServerStatus,
  startPostgresDeltaSyncWorker,
} from "./src/db/postgresBridge.ts";
import { runFullMigration } from "./src/db/migrator.ts";
import { startOutboxWorker } from "./src/services/outboxService.ts";
import {
  JWT_SECRET,
  populateUserSession,
  type AuthenticatedRequest,
} from "./src/middleware/auth.ts";
import { idempotencyMiddleware } from "./src/middleware/idempotency.ts";
import { router as adminRouter } from "./src/routes/admin.ts";
import { router as authRouter } from "./src/routes/auth.ts";
import { chatRouter } from "./src/routes/chat.ts";
import { router as dashboardRouter } from "./src/routes/dashboard.ts";
import { router as datacenterRouter } from "./src/routes/datacenter.ts";
import { router as financeRouter } from "./src/routes/finance.ts";
import { forumRouter } from "./src/routes/forum.ts";
import { hrAttendanceRouter } from "./src/routes/attendance.ts";
import { hrRouter } from "./src/routes/hr.ts";
import { router as hrPayrollRouter } from "./src/routes/payroll.ts";
import { inventoryRouter } from "./src/routes/inventory.ts";
import migrationRouter from "./src/routes/migration.ts";
import { router as productionRouter } from "./src/routes/production.ts";
import { router as projectsRouter } from "./src/routes/projects.ts";
import { purchasingRouter } from "./src/routes/purchasing.ts";
import { salesRouter } from "./src/routes/sales.ts";
import { shopRouter } from "./src/routes/shop.ts";
import { initShopCatalogAndSeed } from "./src/db/shopSeed.ts";
import systemRouter from "./src/routes/system.ts";
import { usersRouter } from "./src/routes/users.ts";
import { router as workflowRouter } from "./src/routes/workflow.ts";
import { uploadRouter } from "./src/routes/upload.ts";
import { generalRequestsRouter } from "./src/routes/requests.ts";
import { workspaceDocumentsRouter } from "./src/routes/documents.ts";
import { integrityRouter } from "./src/routes/integrity.ts";
import { mobileRouter } from "./src/routes/mobile.ts";

process.on("unhandledRejection", (reason: any) => {
  console.warn("[Server] Unhandled promise rejection caught:", reason?.message || reason);
});

process.on("uncaughtException", (err: any) => {
  console.error("[Server] Uncaught exception caught:", err?.message || err);
});

try {
  initDb();
  console.log("[Server] SQLite database initialized successfully.");
} catch (err) {
  console.error("[Server] Failed to initialize SQLite database:", err);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set("trust proxy", 1);
app.set("etag", "weak");

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(compression({ threshold: 512 }));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    error: "Too many authentication attempts. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
    default: true,
  },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    maxAge: "7d",
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'");
      res.setHeader(
        "Cache-Control",
        "public, max-age=604800, stale-while-revalidate=86400",
      );
      const ext = path.extname(filePath).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
        res.setHeader("Content-Disposition", "attachment");
      }
    },
  }),
);

const logoPath = path.join(process.cwd(), "public", "logo.png");
app.get(
  [
    "/logo.png",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
    "/pwa-192x192.png",
    "/pwa-512x512.png",
    "/pwa-maskable-512x512.png",
  ],
  (_req, res) => {
    if (fs.existsSync(logoPath)) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.sendFile(logoPath);
    }
    res.status(404).end();
  },
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/time", (_req, res) => {
  res.json({ timestamp: Date.now(), time: new Date().toISOString() });
});

app.use(populateUserSession);

app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const isPublicRoute =
    req.path === "/api/health" ||
    req.path === "/api/time" ||
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/register" ||
    req.path === "/api/auth/exchange-token" ||
    req.path === "/api/auth/consent" ||
    req.path === "/api/mobile/auth/login" ||
    req.path === "/api/mobile/blueprint" ||
    req.path === "/api/users/logout" ||
    req.path.startsWith("/api/shop") ||
    req.path.startsWith("/api/public") ||
    req.path.startsWith("/api/supabase") ||
    req.path === "/api/hr/jobs-public" ||
    (req.method === "GET" && req.path === "/api/hr/jobs") ||
    req.path === "/api/hr/track" ||
    req.path === "/api/hr/track/respond" ||
    req.path === "/api/hr/apply" ||
    (req.method === "POST" && req.path === "/api/hr/applications") ||
    (req.method === "GET" && req.path.startsWith("/api/cms/"));

  const isSignedWorkspaceDocGateway =
    /^\/api\/workspace-documents\/[^/]+\/(file|callback|export\/pdf)$/.test(
      req.path,
    ) &&
    Boolean(
      req.query?.token || req.headers["x-document-token"] || req.body?.token,
    );

  if (isPublicRoute || isSignedWorkspaceDocGateway) {
    return next();
  }

  const authenticatedReq = req as AuthenticatedRequest;
  if (!authenticatedReq.userId || !authenticatedReq.userRole) {
    return res.status(401).json({
      error:
        "Authentication required. Please log in to access internal ERP services.",
      path: req.path,
    });
  }

  next();
});

app.use(idempotencyMiddleware);

app.use(uploadRouter);
app.use(adminRouter);
app.use(authRouter);
app.use("/api/auth", authRouter);
app.use(chatRouter);
app.use(dashboardRouter);
app.use(datacenterRouter);
app.use(financeRouter);
app.use(forumRouter);
app.use(hrAttendanceRouter);
app.use(hrRouter);
app.use(hrPayrollRouter);
app.use(inventoryRouter);
app.use("/api", migrationRouter);
app.use(migrationRouter);
app.use(productionRouter);
app.use(projectsRouter);
app.use(purchasingRouter);
app.use(salesRouter);
app.use(shopRouter);
app.use("/api", systemRouter);
app.use(systemRouter);
app.use(usersRouter);
app.use(workflowRouter);
app.use(generalRequestsRouter);
app.use(workspaceDocumentsRouter);
app.use(integrityRouter);
app.use(mobileRouter);

app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error(`[Unhandled Error] ${req.method} ${req.path}:`, err);
    if (res.headersSent) {
      return next(err);
    }
    const status = typeof err?.status === "number" ? err.status : 500;
    res.status(status).json({
      error:
        status === 500
          ? "Internal server error. Please contact system administrator."
          : err?.message || "An error occurred.",
      success: false,
    });
  },
);

async function startServer() {
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });
  (global as any).io = io;

  io.use((socket, next) => {
    const rawToken =
      socket.handshake.auth?.token ||
      (typeof socket.handshake.headers?.authorization === "string"
        ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, "")
        : null) ||
      (typeof socket.handshake.headers?.cookie === "string"
        ? socket.handshake.headers.cookie.match(/auth_token=([^;]+)/)?.[1]
        : null);

    if (rawToken) {
      try {
        const decoded = jwt.verify(rawToken, JWT_SECRET);
        (socket as any).user = decoded;
        return next();
      } catch (_err) {
        (socket as any).user = null;
        return next();
      }
    }
    next();
  });

  io.on("connection", (socket) => {
    console.log("[Socket.io] Client connected:", socket.id);
    socket.on("disconnect", () => {
      console.log("[Socket.io] Client disconnected:", socket.id);
    });
  });

  const isDev =
    process.env.NODE_ENV === "development" ||
    process.env.npm_lifecycle_event === "dev";
  const distPath = fs.existsSync(path.join(process.cwd(), "dist"))
    ? path.join(process.cwd(), "dist")
    : path.join(process.cwd(), "build");
  const distIndexExists = fs.existsSync(path.join(distPath, "index.html"));
  const isProduction =
    process.env.NODE_ENV === "production" || (!isDev && distIndexExists);

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      "/assets",
      express.static(path.join(distPath, "assets"), {
        maxAge: "1y",
        immutable: true,
        fallthrough: false,
      }),
    );

    app.use(
      express.static(distPath, {
        maxAge: "1h",
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith(".html") ||
            filePath.endsWith("sw.js") ||
            filePath.endsWith("registerSW.js") ||
            filePath.endsWith(".webmanifest") ||
            filePath.endsWith(".json")
          ) {
            res.setHeader(
              "Cache-Control",
              "no-cache, no-store, must-revalidate",
            );
          }
        },
      }),
    );

    app.get("*", (req, res) => {
      if (
        req.path.startsWith("/api") ||
        req.path.startsWith("/assets") ||
        (req.path.includes(".") && !req.path.endsWith(".html"))
      ) {
        return res.status(404).send("Not Found");
      }
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);

    setTimeout(() => {
      try {
        initShopCatalogAndSeed();
      } catch (e) {
        console.warn("[ShopSeed] Initialization notice:", e);
      }

      // Initialize Primary Database (PostgreSQL SSOT) -> Rehydrate Secondary Cache (SQLite WAL) + Start Incremental Delta Sync & Write-Through Outbox
      initPostgresDb()
        .then(async () => {
          if (process.env.AUTO_REHYDRATE_FROM_SUPABASE !== "false") {
            const rehydrated = await rehydrateSqliteFromSupabase();
            if (rehydrated.success && rehydrated.totalRestoredRows > 0) {
              console.log(
                `[HybridDB] Startup SSOT Rehydration loaded ${rehydrated.totalRestoredRows} records across ${rehydrated.tablesRestored} tables from PostgreSQL Primary SSOT into SQLite WAL Cache.`,
              );
            } else {
              const status = await getSupabaseServerStatus();
              if (
                status.erpSyncTable?.exists &&
                (status.erpSyncTable?.rowCount || 0) === 0
              ) {
                await runFullMigration();
              }
            }
          }
          // Ensure any stale Back-Office users in production_manpower rehydrated from cloud SSOT are purged with CDC active
          try {
            const { db: sqliteDb, seedMasterBaseline } = await import("./src/db/database.ts");
            sqliteDb.prepare(`
              DELETE FROM production_manpower
              WHERE user_username IN (
                SELECT username FROM users WHERE UPPER(TRIM(COALESCE(role, ''))) != 'OPERATOR'
              )
            `).run();
            seedMasterBaseline(sqliteDb);
          } catch (_e) {}
          startPostgresDeltaSyncWorker(15000);
        })
        .catch((err) => {
          console.warn(
            "[HybridDB] Background initialization notice:",
            err?.message,
          );
        });

      startOutboxWorker(6000);

      // Periodic Automated Integrity Health Check & Snapshot Assurance
      import("./src/routes/integrity.ts")
        .then(({ performStockAndGlIntegrityCheck, ensureBackupTableExists }) => {
          ensureBackupTableExists().catch(() => {});
          try {
            const initialAudit = performStockAndGlIntegrityCheck();
            console.log(
              `[IntegrityEngine] Stock Health: ${initialAudit.stockIntegrity.isHealthy ? "OPTIMAL (0 Discrepancy)" : initialAudit.stockIntegrity.discrepancyCount + " Discrepancies"} | GL Health: ${initialAudit.generalLedgerIntegrity.isHealthy ? "BALANCED (Debit = Kredit)" : "Variance: " + initialAudit.generalLedgerIntegrity.variance}`,
            );
          } catch (e) {}
        })
        .catch(() => {});
    }, 500);
  });
}

startServer();
