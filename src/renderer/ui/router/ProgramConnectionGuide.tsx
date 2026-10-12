import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import { PROGRAM_RECEIVE_PREFIX, PROGRAM_SEND_PREFIX } from "../../../shared/router-setup"
import { ActionButton, InfoTooltip } from "../ui-kit"
import { styles } from "./RouterPanel.styles"

export function ProgramConnectionGuide({ slots }: { slots: number }) {
  const [message, setMessage] = useState<string | null>(null)
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setMessage(`Copiado: ${value}`)
    } catch {
      setMessage("No se pudo copiar. Selecciona el nombre del puerto y cópialo.")
    }
  }
  return (
    <div {...stylex.props(styles.guideWrap)}>
      <div {...stylex.props(styles.tableScroll)}>
        <table {...stylex.props(styles.guideTable)}>
          <caption {...stylex.props(styles.srOnly)}>
            Puertos MIDI que debes elegir en cada programa
          </caption>
          <thead>
            <tr>
              <th scope="col" {...stylex.props(styles.guideCell)}>
                Programa
              </th>
              <th scope="col" {...stylex.props(styles.guideCell)}>
                <span {...stylex.props(styles.labelRow)}>
                  Entrada MIDI
                  <InfoTooltip
                    label="Entrada MIDI del programa"
                    content="El programa recibe los mensajes del dispositivo por este puerto."
                  />
                </span>
              </th>
              <th scope="col" {...stylex.props(styles.guideCell)}>
                <span {...stylex.props(styles.labelRow)}>
                  Salida MIDI
                  <InfoTooltip
                    label="Salida MIDI del programa"
                    content="El programa envía sus respuestas al dispositivo por este puerto. Entrada y salida usan nombres diferentes para evitar bucles."
                  />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: slots }, (_, index) => index + 1).map((slot) => (
              <tr key={slot}>
                <th scope="row" {...stylex.props(styles.guideCell)}>
                  Programa {slot}
                </th>
                {[
                  { name: `${PROGRAM_RECEIVE_PREFIX} ${slot}`, role: "entrada" },
                  { name: `${PROGRAM_SEND_PREFIX} ${slot}`, role: "salida" },
                ].map((port) => (
                  <td key={port.role} {...stylex.props(styles.guideCell)}>
                    <div {...stylex.props(styles.portCopyRow)}>
                      <code>{port.name}</code>
                      <ActionButton
                        variant="ghost"
                        size="small"
                        aria-label={`Copiar ${port.role} MIDI del Programa ${slot}`}
                        onPress={() => void copy(port.name)}
                        {...stylex.props(styles.copyButton)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="8" y="8" width="12" height="12" rx="2" />
                          <path d="M16 8V4H4v12h4" />
                        </svg>
                      </ActionButton>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message ? (
        <span role="status" {...stylex.props(styles.fieldHelp)}>
          {message}
        </span>
      ) : null}
    </div>
  )
}
