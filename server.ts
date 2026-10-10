import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initDb } from './src/db/database.ts';
import { initPostgresDb } from './src/db/postgresClient.ts';
import { runFullPostgresMigration } from './src/db/postgresMigrationEngine.ts';

// Guarantee SQLite database schema initialization before mounting routes
try {
  initDb();
  console.log('[Server] SQLite database initialized successfully.');
} catch (err) {
  console.error('[Server] Failed to initialize SQLite database:', err);
}

const app = express();
const PORT = 3000;

// Security & Performance middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Managed per SPA / asset route
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Rate limiting for sensitive authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 minutes
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Secure static uploads with nosniff, restrictive CSP, and attachment headers for non-images
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'");
      const ext = path.extname(filePath).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  })
);

// Health & Time endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/time", (req, res) => {
  res.json({ timestamp: Date.now(), time: new Date().toISOString() });
});

// Routes
import jwt from 'jsonwebtoken';
import { JWT_SECRET, populateUserSession } from './src/middleware/auth.ts';
import { idempotencyMiddleware } from './src/middleware/idempotency.ts';
import { router as adminRouter } from './src/routes/admin_routes.ts';
import { router as authRouter } from './src/routes/auth_routes.ts';
import { chatRouter } from './src/routes/chat.ts';
import { router as dashboardRouter } from './src/routes/dashboard.ts';
import { router as datacenterRouter } from './src/routes/datacenter.ts';
import { router as financeRouter } from './src/routes/finance.ts';
import { forumRouter } from './src/routes/forum.ts';
import { hrAttendanceRouter } from './src/routes/hr-attendance.ts';
import { hrRouter } from './src/routes/hr.ts';
import { router as hrPayrollRouter } from './src/routes/hr_payroll.ts';
import { inventoryRouter } from './src/routes/inventory.ts';
import { router as migrationRouter } from './src/routes/migration_routes.ts';
import { router as productionRouter } from './src/routes/production.ts';
import { router as projectsRouter } from './src/routes/projects.ts';
import { purchasingRouter } from './src/routes/purchasing.ts';
import { salesRouter } from './src/routes/sales.ts';
import { shopRouter } from './src/routes/shop.ts';
import { initShopCatalogAndSeed } from './src/db/shopSeed.ts';
import { router as systemRouter } from './src/routes/system_routes.ts';
import { usersRouter } from './src/routes/users.ts';
import { router as workflowRouter } from './src/routes/workflow.ts';
import { uploadRouter } from './src/routes/upload_routes.ts';
import { generalRequestsRouter } from './src/routes/general_requests.ts';

// 1. Session populator
app.use(populateUserSession);

// 2. Global Deny-by-Default API Security Guard
// Protects all 200+ internal ERP endpoints while whitelisting public store & careers
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const isPublicRoute =
    req.path === "/api/health" ||
    req.path === "/api/time" ||
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/register" ||
    req.path.startsWith("/api/shop") ||
    req.path.startsWith("/api/public") ||
    req.path === "/api/hr/jobs-public" ||
    req.path === "/api/hr/track" ||
    req.path === "/api/hr/apply" ||
    (req.method === "GET" && req.path.startsWith("/api/cms/")) ||
    (req.path === "/api/upload" && req.method === "POST");

  if (isPublicRoute) {
    return next();
  }

  const authenticatedReq = req as any;
  if (!authenticatedReq.userId || !authenticatedReq.userRole) {
    return res.status(401).json({
      error: "Authentication required. Please log in to access internal ERP services.",
      path: req.path,
    });
  }

  next();
});

// 3. Idempotency Guard for Transactional Retries & Offline Sync
app.use(idempotencyMiddleware);

app.use(uploadRouter);
app.use(adminRouter);
app.use(authRouter);
app.use(chatRouter);
app.use(dashboardRouter);
app.use(datacenterRouter);
app.use(financeRouter);
app.use(forumRouter);
app.use(hrAttendanceRouter);
app.use(hrRouter);
app.use(hrPayrollRouter);
app.use(inventoryRouter);
app.use(migrationRouter);
app.use(productionRouter);
app.use(projectsRouter);
app.use(purchasingRouter);
app.use(salesRouter);
app.use(shopRouter);
app.use(systemRouter);
app.use(usersRouter);
app.use(workflowRouter);
app.use(generalRequestsRouter);

// 4. Global Safe Error Handler - Prevents raw SQL / internal errors leaking to client
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[Unhandled Error] ${req.method} ${req.path}:`, err);
  if (res.headersSent) {
    return next(err);
  }
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({
    error: status === 500 ? "Internal server error. Please contact system administrator." : (err?.message || "An error occurred."),
    success: false,
  });
});



async function startServer() {
  const httpServer = createServer(app);
  
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });
  
  (global as any).io = io;

  // Socket.io JWT handshake authentication & session attachment
  io.use((socket, next) => {
    const rawToken =
      socket.handshake.auth?.token ||
      (typeof socket.handshake.headers?.authorization === 'string'
        ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
        : null) ||
      (typeof socket.handshake.headers?.cookie === 'string'
        ? socket.handshake.headers.cookie.match(/auth_token=([^;]+)/)?.[1]
        : null);

    if (rawToken) {
      try {
        const decoded = jwt.verify(rawToken, JWT_SECRET) as any;
        (socket as any).user = decoded;
      } catch {
        // Discard expired or invalid socket token
      }
    }
    next();
  });
  
  io.on('connection', (socket) => {
    console.log('[Socket.io] Client connected:', socket.id);
    socket.on('disconnect', () => {
      console.log('[Socket.io] Client disconnected:', socket.id);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist'))
      ? path.join(process.cwd(), 'dist')
      : path.join(process.cwd(), 'build');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Initialize and seed B2C shop catalog and demo data
  initShopCatalogAndSeed();

  // PostgreSQL background replication engine - run only when explicitly enabled
  if (process.env.ENABLE_POSTGRES_BG_SYNC === "true") {
    initPostgresDb()
      .then(() => runFullPostgresMigration())
      .then((summary) => {
        console.log(
          `[Server] PostgreSQL initialization & data migration complete (${summary.totalMigratedRows} rows across ${summary.totalTables} tables).`,
        );
      })
      .catch((err) => {
        console.error('[Server] PostgreSQL background migration error:', err);
      });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
