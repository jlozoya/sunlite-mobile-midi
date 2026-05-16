import React from "react"
import "./stylex.css"
import "./apc-led.css"
import { createRoot } from "react-dom/client"
import * as stylex from "@stylexjs/stylex"
import { App } from "./ui/App"

const globalStyles = stylex.create({
  base: {
    margin: 0,
    minHeight: "100%",
    backgroundColor: "#080a12",
    color: "#f8fafc",
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  root: {
    minHeight: "100vh",
  },
})

document.documentElement.style.colorScheme = "dark"
document.body.className = stylex.props(globalStyles.base).className ?? ""

const root = document.querySelector("#root")

if (!root) {
  throw new Error("Root element not found.")
}

root.className = stylex.props(globalStyles.root).className ?? ""

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
