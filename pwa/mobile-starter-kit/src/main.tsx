import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import MobileStarterApp from "./App";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <MobileStarterApp />
    </React.StrictMode>,
  );
}
