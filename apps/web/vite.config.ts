import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: { outDir: "dist", sourcemap: true },
  preview: {
    host: true,
    port: Number(process.env.PORT ?? 4173),
    strictPort: true,
  },
});
