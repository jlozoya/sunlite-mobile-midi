import react from "@vitejs/plugin-react"
import styleX from "vite-plugin-stylex"
import { defineConfig, type PluginOption } from "vite"

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react(), styleX() as unknown as PluginOption],
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
})
