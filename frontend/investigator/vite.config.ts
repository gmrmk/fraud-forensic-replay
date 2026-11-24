import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { themeCssPlugin } from "./vite-plugin-theme-css";

// FastAPI dev server runs on 8000; Vite proxies /api/* to it so the
// browser sees one origin and CORS is a non-issue in dev.
export default defineConfig({
  // "/" for the live app. scripts/build-static.mjs sets VITE_BASE=./ so the static site
  // works under any sub-path (Vite then writes every asset URL relative to its file).
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), themeCssPlugin()],
  server: {
    // Bound to localhost for presenting: no other device on the network can reach the dev server
    // or its unauthenticated /api proxy. For phone verification over
    // Wi-Fi, temporarily set host: true (binds 0.0.0.0 + ::). DEV-only; the /api proxy still
    // targets the IPv4 backend (127.0.0.1:8000) below.
    host: "localhost",
    port: 5173,
    strictPort: false,
    // DEV-only: allow the cloudflared quick-tunnel host so the running app is
    // reachable from a phone off-Wi-Fi. The LAN IP works without this; a tunnel
    // domain is rejected by Vite's host check unless listed here.
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        // Literal 127.0.0.1, not "localhost": on Windows boxes where localhost
        // resolves ::1 (IPv6) first, a "localhost" target misses the IPv4-only
        // uvicorn backend and the globe loads with no data. (FIX: 2026-06-14)
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
