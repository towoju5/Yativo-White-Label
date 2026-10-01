import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // VITE_API_BASE_URL is baked into the bundle at build time. Without it the code falls back to
  // http://localhost:4000, which "works" on a dev box but sends every real visitor's browser to
  // their own machine — so a production build without it fails here instead of shipping silently.
  // scripts/ensure-web-env.sh generates apps/web/.env.production for a deployed instance.
  if (mode === "production" && !loadEnv(mode, __dirname, "VITE_").VITE_API_BASE_URL) {
    throw new Error(
      "VITE_API_BASE_URL is not set for this production build. Create apps/web/.env.production (run ./scripts/ensure-web-env.sh on the server) or set it in the environment.",
    );
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
    },
  };
});
