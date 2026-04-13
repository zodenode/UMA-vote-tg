import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: { port: 5173, host: true },
  build: { outDir: "dist", sourcemap: true },
  preview: {
    host: true,
    port: Number(process.env.PORT ?? 4173),
    strictPort: true,
    // Railway (and similar) use dynamic public hostnames; Vite blocks unknown Host headers by default.
    allowedHosts: true,
  },
});
