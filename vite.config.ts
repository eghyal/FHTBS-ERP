import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    {
      name: "disable-vite-client-ws",
      enforce: "post",
      transform(code, id) {
        if (id.includes("vite/dist/client/client.mjs")) {
          return {
            code: code.replace(
              "transport.connect(createHMRHandler(handleMessage));",
              "/* HMR WebSocket connection disabled */"
            ),
            map: null,
          };
        }
      },
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "logo.png"],
      manifest: {
        id: "/",
        name: "Paving Joss ERP & MES",
        short_name: "PavingJoss",
        description: "Comprehensive Operational ERP, MES & HRIS system for Paving Joss.",
        theme_color: "#b02524",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/logo.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{html,css,png,ico,svg,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/api\/(public|shop\/products).*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "public-catalog-api-cache",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 3000,
    host: "0.0.0.0",
    hmr: false,
    watch: {
      ignored: ["**/pwa/**", "**/dist/**", "**/build/**"],
    },
  },
  optimizeDeps: {
    entries: ["index.html"],
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router-dom",
      "lucide-react",
      "motion/react",
      "@xyflow/react",
      "recharts",
      "jspdf",
      "jspdf-autotable",
      "html-to-image",
      "html5-qrcode",
      "qrcode",
      "qrcode.react",
      "papaparse",
      "react-markdown",
      "react-joyride",
      "date-fns",
      "socket.io-client",
      "zustand",
      "dexie",
      "dexie-react-hooks",
      "@supabase/supabase-js",
      "@google/genai",
      "clsx",
      "tailwind-merge",
      "copy-to-clipboard",
      "idb-keyval",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    cssMinify: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("/node_modules/react/") ||
              id.includes("/node_modules/react-dom/") ||
              id.includes("/node_modules/react-router/") ||
              id.includes("/node_modules/react-router-dom/")
            ) {
              return "vendor-react";
            }
            if (id.includes("/node_modules/lucide-react/")) {
              return "vendor-icons";
            }
            if (id.includes("/node_modules/motion/") || id.includes("/node_modules/framer-motion/")) {
              return "vendor-motion";
            }
            if (id.includes("/node_modules/recharts/") || id.includes("/node_modules/d3-")) {
              return "vendor-charts";
            }
            if (id.includes("/node_modules/jspdf/") || id.includes("/node_modules/jspdf-autotable/")) {
              return "vendor-pdf";
            }
            if (id.includes("/node_modules/firebase/") || id.includes("/node_modules/@firebase/")) {
              return "vendor-firebase";
            }
          }
        },
      },
    },
  },
});
