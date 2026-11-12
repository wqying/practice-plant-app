import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "service-worker.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      devOptions: { enabled: true, type: "module" },
      manifest: {
        name: "PlantsVSHumans",
        short_name: "Plants",
        description: "Shared plant care for roommates",
        display: "standalone",
        start_url: "/dashboard",
        theme_color: "#2f6b3a",
        background_color: "#f7f5ef",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: false } },
  },
});
