import * as stylex from "@stylexjs/stylex"
import type { ReactNode } from "react"
import { styles } from "../App.styles"

export type AppTabId = "controller" | "automation" | "connection" | "settings"

const icons: Record<AppTabId, ReactNode> = {
  controller: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  automation: <path d="M2 12h4l3-8 6 16 3-8h4" />,
  connection: (
    <>
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <path d="M12 8v4M5 16v-4h14v4" />
      <rect x="2" y="16" width="6" height="5" rx="1" />
      <rect x="16" y="16" width="6" height="5" rx="1" />
    </>
  ),
  settings: (
    <>
      <path d="m9.5 3-.6 2.3-1.6.9L5 5.6 2.5 10l1.7 1.7v1.8L2.5 15 5 19.4l2.3-.6 1.6.9.6 2.3h5l.6-2.3 1.6-.9 2.3.6 2.5-4.4-1.7-1.5v-1.8L21.5 10 19 5.6l-2.3.6-1.6-.9L14.5 3Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </>
  ),
}

export function AppTabIcon({ tab }: { tab: AppTabId }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.tabIcon)}
    >
      {icons[tab]}
    </svg>
  )
}
