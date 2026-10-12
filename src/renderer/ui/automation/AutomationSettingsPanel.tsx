import * as stylex from "@stylexjs/stylex"
import { useEffect, useId, useState } from "react"
import type { AutomationSettings } from "../../../shared/automation-types"
import { AnimatedDisclosure } from "../components/AnimatedDisclosure"
import { ActionButton, InfoTooltip, Surface } from "../ui-kit"
import { styles } from "./AutomationStudio.styles"
import { SettingsGroup, NumberField, MidiListField } from "./AutomationSettingsFields"
import type { AutomationStudioState } from "./types"

export function AutomationSettingsPanel({
  automation,
  controlsDisabled,
}: {
  automation: AutomationStudioState
  controlsDisabled: boolean
}) {
  const deckFieldId = useId()
  const deckHelpId = useId()
  const status = automation.status
  const [settingsDraft, setSettingsDraft] = useState<AutomationSettings | null>(null)

  const [settingsDirty, setSettingsDirty] = useState(false)

  const settings = settingsDraft ?? status?.settings ?? null

  function setSetting<K extends keyof AutomationSettings>(
    key: K,
    value: AutomationSettings[K],
  ) {
    if (!settings) return
    setSettingsDraft({ ...settings, [key]: value })
    setSettingsDirty(true)
  }

  async function saveSettings() {
    if (!settingsDraft) return
    if (await automation.updateSettings(settingsDraft)) setSettingsDirty(false)
  }
  useEffect(() => {
    if (automation.status && !settingsDirty) {
      setSettingsDraft(automation.status.settings)
    }
  }, [automation.status, settingsDirty])
  return (
    <Surface
      as="article"
      variant="subtle"
      padding="custom"
      {...stylex.props(styles.subPanel)}
    >
      <AnimatedDisclosure
        summary={
          <span {...stylex.props(styles.rulesSummaryContent)}>
            <strong>Reglas de seguridad</strong>
            <span {...stylex.props(styles.cardDetail)}>
              {settingsDirty ? "Cambios sin guardar" : "Ajustes avanzados"}
            </span>
          </span>
        }
        summaryActions={
          <InfoTooltip
            label="Reglas de seguridad"
            content="Estas reglas limitan lo que puede hacer el modo automático. Los valores actuales se mantienen hasta que guardes algún cambio."
          />
        }
        buttonProps={stylex.props(styles.disclosureTrigger, styles.rulesSummary)}
      >
        {settings ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!controlsDisabled) void saveSettings()
            }}
          >
            <fieldset
              disabled={controlsDisabled}
              {...stylex.props(styles.settingsFieldset)}
            >
              <SettingsGroup
                title="Cuándo puede actuar"
                description="Evita que la automatización dispare de más o con poca certeza."
              >
                <NumberField
                  label="Confianza mínima"
                  unit="%"
                  min={25}
                  max={98}
                  value={Math.round(settings.confidenceThreshold * 100)}
                  help="Descarta la sugerencia si el modelo está menos seguro que esto."
                  onChange={(value) => setSetting("confidenceThreshold", value / 100)}
                />
                <NumberField
                  label="Intervalo mínimo"
                  unit="ms"
                  min={250}
                  max={30000}
                  value={settings.minActionIntervalMs}
                  isDuration
                  help="Tiempo que debe pasar entre dos acciones automáticas cualesquiera."
                  onChange={(value) => setSetting("minActionIntervalMs", value)}
                />
                <NumberField
                  label="Espera para repetir"
                  unit="ms"
                  min={500}
                  max={120000}
                  value={settings.repeatActionCooldownMs}
                  isDuration
                  help="Igual que el anterior, pero solo para repetir la misma nota o CC."
                  onChange={(value) => setSetting("repeatActionCooldownMs", value)}
                />
              </SettingsGroup>

              <SettingsGroup
                title="Qué no debe tocar nunca"
                description="Números MIDI de tu mapeo de luces, separados por comas."
              >
                <MidiListField
                  label="Notas protegidas"
                  kind="notas"
                  values={settings.blockedNotes}
                  help="La automatización nunca envía estas notas. Reserva aquí lo que quieras controlar solo a mano."
                  onChange={(values) => setSetting("blockedNotes", values)}
                />
                <MidiListField
                  label="CC protegidos"
                  kind="CC"
                  values={settings.blockedControllers}
                  help="Controles continuos que la automatización nunca mueve, como el máster de intensidad."
                  onChange={(values) => setSetting("blockedControllers", values)}
                />
              </SettingsGroup>

              <SettingsGroup
                title="Strobe"
                description="Los strobes llevan su propio límite, aparte del resto de acciones."
              >
                <MidiListField
                  label="Notas strobe"
                  kind="notas"
                  values={settings.strobeNotes}
                  help="Notas que se tratan como strobe y quedan sujetas a la espera de abajo."
                  onChange={(values) => setSetting("strobeNotes", values)}
                />
                <NumberField
                  label="Espera entre strobes"
                  unit="ms"
                  min={1000}
                  max={120000}
                  value={settings.strobeCooldownMs}
                  isDuration
                  isDisabled={settings.strobeNotes.length === 0}
                  help={
                    settings.strobeNotes.length === 0
                      ? "Sin efecto mientras no haya ninguna nota strobe declarada."
                      : "Tiempo mínimo entre dos disparos de cualquier nota strobe."
                  }
                  onChange={(value) => setSetting("strobeCooldownMs", value)}
                />
              </SettingsGroup>

              <SettingsGroup
                title="Control manual y deck"
                description="Quién manda cuando intervienes tú, y de qué deck se lee el audio."
              >
                <NumberField
                  label="Pausa tras control manual"
                  unit="ms"
                  min={1000}
                  max={60000}
                  value={settings.manualOverrideMs}
                  isDuration
                  help="Al tocar un control a mano, la automatización se detiene este tiempo."
                  onChange={(value) => setSetting("manualOverrideMs", value)}
                />
                <div {...stylex.props(styles.field)}>
                  <div {...stylex.props(styles.fieldLabel)}>
                    <span {...stylex.props(styles.fieldLabelCopy)}>
                      <label htmlFor={deckFieldId}>Deck preferido</label>
                      <InfoTooltip
                        label="Deck preferido"
                        content="Automático sigue al deck que esté sonando. Fíjalo si siempre pinchas desde el mismo."
                        descriptionId={deckHelpId}
                      />
                    </span>
                  </div>
                  <select
                    id={deckFieldId}
                    aria-describedby={deckHelpId}
                    {...stylex.props(styles.select)}
                    value={settings.preferredDeck ?? ""}
                    onChange={(event) =>
                      setSetting(
                        "preferredDeck",
                        event.target.value ? Number(event.target.value) : null,
                      )
                    }
                  >
                    <option value="">Automático</option>
                    {[1, 2, 3, 4, 5, 6].map((deck) => (
                      <option key={deck} value={deck}>
                        Deck {deck}
                      </option>
                    ))}
                  </select>
                </div>
              </SettingsGroup>

              <div {...stylex.props(styles.rulesFooter)}>
                <span {...stylex.props(styles.dirtyHint)}>
                  {settingsDirty
                    ? "Tienes cambios sin guardar; se aplican al pulsar Guardar."
                    : "Sin cambios pendientes."}
                </span>
                <ActionButton
                  tone="cyan"
                  isDisabled={!settingsDirty || controlsDisabled}
                  type="submit"
                >
                  {automation.busy === "settings" ? "Guardando…" : "Guardar reglas"}
                </ActionButton>
              </div>
            </fieldset>
          </form>
        ) : null}
      </AnimatedDisclosure>
    </Surface>
  )
}
