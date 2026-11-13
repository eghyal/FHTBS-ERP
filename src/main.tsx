import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global error handler to prevent blank white screens in production
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    console.error("[Global Error Caught]:", event.error || event.message);
    const root = document.getElementById("root");
    if (root && (!root.hasChildNodes() || root.innerHTML.trim() === "")) {
      root.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #fafaf9; padding: 24px; box-sizing: border-box;">
          <div style="max-width: 440px; width: 100%; background: #ffffff; border: 1px solid #fee2e2; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); text-align: center;">
            <div style="width: 48px; height: 48px; background: #fee2e2; color: #dc2626; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 22px; font-weight: bold;">!</div>
            <h2 style="font-size: 18px; font-weight: 700; color: #1c1917; margin: 0 0 8px 0;">Memuat Ulang Aplikasi</h2>
            <p style="font-size: 13px; color: #78716c; margin: 0 0 20px 0; line-height: 1.5;">Terjadi pembaruan versi pada sistem. Silakan muat ulang halaman untuk memuat versi terbaru.</p>
            <button onclick="window.location.reload(true)" style="background: #b02524; color: #ffffff; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; box-shadow: 0 2px 4px rgba(176,37,36,0.2);">Muat Ulang Sekarang</button>
          </div>
        </div>
      `;
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("[Unhandled Rejection Caught]:", event.reason);
  });
}

// Background authoritative time synchronization without breaking native window.Date
let serverTimeOffset = 0;
export function getServerTimeOffset(): number {
  return serverTimeOffset;
}

export function getSyncedTime(): number {
  return Date.now() + serverTimeOffset;
}

async function syncGlobalTime() {
  // 1. Authoritative internal server time (same-origin, zero CORS issues)
  try {
    const res = await fetch("/api/time");
    if (res.ok) {
      const data = await res.json();
      if (data && (data.timestamp || data.time)) {
        const officialDate = data.timestamp
          ? new Date(data.timestamp)
          : new Date(data.time);
        if (!isNaN(officialDate.getTime())) {
          serverTimeOffset = officialDate.getTime() - Date.now();
          return;
        }
      }
    }
  } catch {
    // Graceful fallback to client system time
  }

  // 2. Secondary fallback: /api/health
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      if (data && data.time) {
        const officialDate = new Date(data.time);
        if (!isNaN(officialDate.getTime())) {
          serverTimeOffset = officialDate.getTime() - Date.now();
          return;
        }
      }
    }
  } catch {
    // Graceful fallback
  }
}

// Fire off background synchronization
syncGlobalTime();

// Safe storage access to prevent SecurityError in restrictive browser contexts
let cachedUserEmail: string | null = null;
let lastStorageCheck = 0;

function getUserEmail(): string | null {
  const now = Date.now();
  if (now - lastStorageCheck > 2000) {
    lastStorageCheck = now;
    try {
      const storedUser = localStorage.getItem("erp_user");
      if (storedUser) {
        const user = JSON.parse(storedUser);
        cachedUserEmail = user?.username || null;
      } else {
        cachedUserEmail = null;
      }
    } catch {
      cachedUserEmail = null;
    }
  }
  return cachedUserEmail;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "erp_user") {
      lastStorageCheck = 0;
    }
  });
}

// Resilient fetch interceptor for /api/ authentication headers
try {
  const originalFetch = window.fetch;
  Object.defineProperty(window, "fetch", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: async function (resource: RequestInfo | URL, config?: RequestInit) {
      try {
        const url =
          typeof resource === "string"
            ? resource
            : resource instanceof URL
              ? resource.pathname
              : (resource as Request)?.url || "";

        if (url.startsWith("/api/") || url.includes("/api/")) {
          const email = getUserEmail();
          if (email) {
            config = config || {};
            if (config.headers instanceof Headers) {
              config.headers.set("x-user-email", email);
            } else if (Array.isArray(config.headers)) {
              config.headers.push(["x-user-email", email]);
            } else {
              config.headers = {
                ...config.headers,
                "x-user-email": email,
              };
            }
          }
        }
      } catch (err) {
        console.warn("[Fetch Interceptor] Non-fatal header injection warning:", err);
      }

      return originalFetch.call(window, resource, config);
    },
  });
} catch {
  // In environments where window.fetch is non-configurable, apiFetch handles auth headers directly
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
