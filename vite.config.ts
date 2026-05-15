import react from "@vitejs/plugin-react"
import styleX from "vite-plugin-stylex"
import { defineConfig } from "vite"

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react(), styleX()],
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
})
