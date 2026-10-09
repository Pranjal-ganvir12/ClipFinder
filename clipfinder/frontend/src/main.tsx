import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initSession } from "./api";

// Render the app IMMEDIATELY. Do NOT await any network call here — a slow or
// unreachable backend must never blank the UI (previous white-screen bug).
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Warm the session cookie in the background. Fire-and-forget: failures are
// swallowed inside initSession and never affect rendering.
void initSession();
