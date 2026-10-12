import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import { Button, Tooltip, TooltipTrigger } from "react-aria-components"
import { styles } from "./InfoTooltip.styles"

export function InfoTooltip({
  label,
  content,
  detail,
  descriptionId,
}: {
  label: string
  content: string
  detail?: string
  descriptionId?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {descriptionId ? (
        <span id={descriptionId} {...stylex.props(styles.visuallyHidden)}>
          {content} {detail}
        </span>
      ) : null}
      <TooltipTrigger delay={200} closeDelay={100} isOpen={open} onOpenChange={setOpen}>
        <Button
          type="button"
          aria-label={`Información sobre ${label}`}
          onPress={() => setOpen(true)}
          {...stylex.props(styles.trigger)}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <circle cx="12" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
          </svg>
        </Button>
        <Tooltip placement="top" offset={8} {...stylex.props(styles.tooltip)}>
          <span>{content}</span>
          {detail ? <span {...stylex.props(styles.detail)}>{detail}</span> : null}
        </Tooltip>
      </TooltipTrigger>
    </>
  )
}
