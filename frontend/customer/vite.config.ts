import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Customer app on :5174. Proxies /api/* to FastAPI :8000 - same shared backend
// the investigator reads. The two apps communicate ONLY through this backend.
// node_modules may be a junction into another worktree; Vite's allow list is checked on the
// resolved path, so the real directory is allowed too (or the fontsource woff2 files 403).
export default defineConfig({
  // "/" for the live app. scripts/build-static.mjs sets VITE_BASE=./ so the static site
  // works under any sub-path.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: false,
    fs: { allow: [".", realpathSync(resolve("node_modules"))] },
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
});
