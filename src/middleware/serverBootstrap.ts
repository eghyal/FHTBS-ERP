import type express from "express";
import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import { JWT_SECRET, type AuthenticatedRequest } from "./auth.ts";
import {
  initPostgresDb,
  rehydrateSqliteFromSupabase,
  getSupabaseServerStatus,
  startPostgresDeltaSyncWorker,
} from "../db/postgresBridge.ts";
import { runFullMigration } from "../db/migrator.ts";
import { startOutboxWorker } from "../services/outboxService.ts";
import { initShopCatalogAndSeed } from "../db/shopSeed.ts";

const EXACT_PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/time",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/exchange-token",
  "/api/auth/consent",
  "/api/mobile/auth/login",
  "/api/mobile/blueprint",
  "/api/users/logout",
  "/api/hr/jobs-public",
  "/api/hr/track",
  "/api/hr/track/respond",
  "/api/hr/apply",
]);

const PUBLIC_API_PREFIXES = [
  "/api/shop",
  "/api/media",
  "/api/public",
  "/api/supabase",
];

const SIGNED_WORKSPACE_GATEWAY_REGEX =
  /^\/api\/workspace-documents\/[^/]+\/(file|callback|export\/pdf)$/;

export function apiGatewayAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const isPublicRoute =
    EXACT_PUBLIC_API_PATHS.has(req.path) ||
    PUBLIC_API_PREFIXES.some((prefix) => req.path.startsWith(prefix)) ||
    (req.method === "GET" && req.path === "/api/hr/jobs") ||
    (req.method === "POST" && req.path === "/api/hr/applications") ||
    (req.method === "GET" && req.path.startsWith("/api/cms/"));

  const isSignedWorkspaceDocGateway =
    SIGNED_WORKSPACE_GATEWAY_REGEX.test(req.path) &&
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
}

export function globalApiErrorHandler(
  err: any,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
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
}

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
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
      } catch {
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

  return io;
}

export function runServerStartupTasks(): void {
  setTimeout(() => {
    try {
      initShopCatalogAndSeed();
    } catch (e) {
      console.warn("[ShopSeed] Initialization notice:", e);
    }

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

        try {
          const { db: sqliteDb, seedMasterBaseline } = await import(
            "../db/database.ts"
          );
          sqliteDb
            .prepare(`
              DELETE FROM production_manpower
              WHERE user_username IN (
                SELECT username FROM users WHERE UPPER(TRIM(COALESCE(role, ''))) != 'OPERATOR'
              )
            `)
            .run();
          seedMasterBaseline(sqliteDb);
        } catch {}

        startPostgresDeltaSyncWorker(15000);
      })
      .catch((err) => {
        console.warn(
          "[HybridDB] Background initialization notice:",
          err?.message,
        );
      });

    startOutboxWorker(6000);

    import("../routes/integrity.ts")
      .then(({ performStockAndGlIntegrityCheck, ensureBackupTableExists }) => {
        ensureBackupTableExists().catch(() => {});
        try {
          const initialAudit = performStockAndGlIntegrityCheck();
          console.log(
            `[IntegrityEngine] Stock Health: ${initialAudit.stockIntegrity.isHealthy ? "OPTIMAL (0 Discrepancy)" : initialAudit.stockIntegrity.discrepancyCount + " Discrepancies"} | GL Health: ${initialAudit.generalLedgerIntegrity.isHealthy ? "BALANCED (Debit = Kredit)" : "Variance: " + initialAudit.generalLedgerIntegrity.variance}`,
          );
        } catch {}
      })
      .catch(() => {});
  }, 500);
}
