import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted Editorial Premium fonts: Fraunces (display) + Hanken Grotesk (body).
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/hanken-grotesk/index.css";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>
);
