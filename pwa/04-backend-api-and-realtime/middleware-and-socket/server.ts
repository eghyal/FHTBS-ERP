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
import sqliteDb, { initDb } from "./src/db/database.ts";
import { populateUserSession } from "./src/middleware/auth.ts";
import { idempotencyMiddleware } from "./src/middleware/idempotency.ts";
import {
  apiGatewayAuthMiddleware,
  globalApiErrorHandler,
  attachSocketServer,
  runServerStartupTasks,
} from "./src/middleware/serverBootstrap.ts";
import { router as adminRouter } from "./src/routes/admin.ts";
import { router as authRouter } from "./src/routes/auth.ts";
import { chatRouter } from "./src/routes/chat.ts";
import { router as dashboardRouter } from "./src/routes/dashboard.ts";
import { router as datacenterRouter } from "./src/routes/datacenter.ts";
import { router as financeRouter } from "./src/routes/finance.ts";
import { closingRouter } from "./src/routes/closing.ts";
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
import systemRouter from "./src/routes/system.ts";
import { usersRouter } from "./src/routes/users.ts";
import { router as workflowRouter } from "./src/routes/workflow.ts";
import { uploadRouter } from "./src/routes/upload.ts";
import { generalRequestsRouter } from "./src/routes/requests.ts";
import { workspaceDocumentsRouter } from "./src/routes/documents.ts";
import { integrityRouter } from "./src/routes/integrity.ts";
import { mobileRouter } from "./src/routes/mobile.ts";

process.on("unhandledRejection", (reason: any) => {
  console.warn(
    "[Server] Unhandled promise rejection caught:",
    reason?.message || reason,
  );
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

// DB fallback for legacy /uploads/:filename URLs if container local disk was reset
app.get("/uploads/:filename", (req, res) => {
  try {
    const filename = String(req.params.filename || "").trim();
    if (!filename) return res.status(404).end();
    const row = sqliteDb
      .prepare(
        "SELECT mime_type, data_base64 FROM media_assets WHERE filename = ? OR id = ? LIMIT 1",
      )
      .get(filename, filename) as
      | { mime_type?: string; data_base64?: string }
      | undefined;
    if (!row?.data_base64) {
      return res.status(404).json({ error: "Media file not found" });
    }
    const buf = Buffer.from(row.data_base64, "base64");
    res.setHeader("Content-Type", row.mime_type || "image/webp");
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.send(buf);
  } catch {
    return res.status(404).end();
  }
});

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

app.use(populateUserSession);
app.use(apiGatewayAuthMiddleware);
app.use(idempotencyMiddleware);

// API Routers (Deduplicated mounts)
app.use(uploadRouter);
app.use(adminRouter);
app.use(authRouter);
app.use(chatRouter);
app.use(dashboardRouter);
app.use(datacenterRouter);
app.use(closingRouter);
app.use(financeRouter);
app.use(forumRouter);
app.use(hrAttendanceRouter);
app.use(hrRouter);
app.use(hrPayrollRouter);
app.use(inventoryRouter);
app.use("/api", migrationRouter);
app.use(productionRouter);
app.use(projectsRouter);
app.use(purchasingRouter);
app.use(salesRouter);
app.use(shopRouter);
app.use("/api", systemRouter);
app.use(usersRouter);
app.use(workflowRouter);
app.use(generalRequestsRouter);
app.use(workspaceDocumentsRouter);
app.use(integrityRouter);
app.use(mobileRouter);

app.use(globalApiErrorHandler);

async function startServer() {
  const httpServer = createServer(app);
  attachSocketServer(httpServer);

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
    runServerStartupTasks();
  });
}

startServer();
