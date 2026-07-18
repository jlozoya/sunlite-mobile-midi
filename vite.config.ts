import react from "@vitejs/plugin-react"
import styleX from "vite-plugin-stylex"
import { defineConfig, type PluginOption } from "vite"

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react(), styleX() as unknown as PluginOption],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${process.env.PORT || 3000}`,
      "/ws": {
        target: `ws://127.0.0.1:${process.env.PORT || 3000}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
})
