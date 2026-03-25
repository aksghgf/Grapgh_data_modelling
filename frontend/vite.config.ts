import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * Proxies `/api` to the Express backend. Default port matches `PORT` in `Backend/.env` (5000).
 * Override with `VITE_DEV_API_PROXY_TARGET` in `frontend/.env` if your API runs elsewhere.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget =
    env.VITE_DEV_API_PROXY_TARGET ||
    env.VITE_API_PROXY_TARGET ||
    "http://127.0.0.1:5000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
