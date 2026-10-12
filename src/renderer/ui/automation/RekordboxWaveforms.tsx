import * as stylex from "@stylexjs/stylex"
import {
  REKORDBOX_EXPORT_REGIONS,
  type RekordboxCaptureRegion,
} from "../../../shared/rekordbox-capture"
import { AnimatedDisclosure } from "../components/AnimatedDisclosure"
import { styles } from "./RekordboxWaveforms.styles"
import { LoadingIndicator, LiveDeckCanvas } from "./LiveDeckCanvas"
import { useRekordboxRegions } from "./useRekordboxRegions"

const decks = [1, 2, 3, 4] as const

function regionStyle(region: RekordboxCaptureRegion) {
  return {
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.width * 100}%`,
    height: `${region.height * 100}%`,
  }
}

export function RekordboxWaveforms({ enabled = true }: { enabled?: boolean }) {
  const {
    status,
    statusLoaded,
    preview,
    previewReady,
    setPreviewReady,
    selecting,
    draft,
    hidden,
    error,
    selectDeck,
    finishSelection,
    toggleDeck,
    beginDrag,
    moveDrag,
    finishDrag,
    deleteDeck,
    configured,
    saveRegions,
    cancelDrag,
    invalidatePreview,
  } = useRekordboxRegions(enabled)
  return (
    <section {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.heading)}>
        <div>
          <span {...stylex.props(styles.eyebrow)}>REKORDBOX</span>
          <strong>Waveforms de los decks</strong>
        </div>
        <span {...stylex.props(styles.detail)}>
          {status.available ? "En vivo" : "Esperando Rekordbox"}
        </span>
      </div>

      {configured.length ? (
        <div {...stylex.props(styles.grid)}>
          {configured.map((deck) => (
            <div key={deck} {...stylex.props(styles.deck)}>
              <div
                {...stylex.props(
                  styles.deckHeading,
                  hidden[deck] && styles.deckHeadingCollapsed,
                )}
              >
                <strong>Deck {deck}</strong>
                {window.rekordboxCapture ? (
                  <div {...stylex.props(styles.deckActions)}>
                    <button
                      type="button"
                      {...stylex.props(styles.iconButton)}
                      aria-label={`${hidden[deck] ? "Mostrar" : "Ocultar"} waveform del deck ${deck}`}
                      aria-controls={`rekordbox-deck-waveform-${deck}`}
                      aria-expanded={!hidden[deck]}
                      title={hidden[deck] ? "Mostrar waveform" : "Ocultar waveform"}
                      onClick={() => toggleDeck(deck)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="19"
                        height="19"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                        {hidden[deck] ? <path d="M3 21 21 3" /> : null}
                      </svg>
                    </button>
                    <button
                      type="button"
                      {...stylex.props(
                        styles.iconButton,
                        selecting === deck && styles.iconButtonActive,
                      )}
                      aria-label={`${selecting === deck ? "Finalizar ajuste" : "Ajustar zona"} del deck ${deck}`}
                      aria-pressed={selecting === deck}
                      title={selecting === deck ? "Finalizar ajuste" : "Ajustar zona"}
                      onClick={() => selectDeck(deck)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="19"
                        height="19"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      {...stylex.props(styles.iconButton, styles.iconButtonDanger)}
                      aria-label={`Eliminar selección del deck ${deck}`}
                      title="Eliminar selección"
                      onClick={() => deleteDeck(deck)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="19"
                        height="19"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6m4-6v6" />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
              <div
                id={`rekordbox-deck-waveform-${deck}`}
                aria-hidden={hidden[deck]}
                {...stylex.props(
                  styles.waveformArea,
                  hidden[deck] && styles.waveformAreaCollapsed,
                )}
              >
                <div {...stylex.props(styles.waveformContent)}>
                  {status.available ? (
                    <LiveDeckCanvas
                      deck={deck}
                      region={status.regions[deck]!}
                      enabled={enabled && !hidden[deck]}
                    />
                  ) : (
                    <span {...stylex.props(styles.detail)}>
                      Abre Rekordbox para ver el deck.
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !statusLoaded ? (
        <LoadingIndicator label="Buscando waveforms de Rekordbox…" />
      ) : (
        <p {...stylex.props(styles.detail)}>
          {window.rekordboxCapture
            ? "Selecciona en la ventana de Rekordbox la onda completa de cada deck."
            : "Configura las zonas de los decks desde la aplicación de este PC."}
        </p>
      )}

      {window.rekordboxCapture ? (
        <AnimatedDisclosure
          summary="Configurar decks"
          containerProps={stylex.props(styles.deckConfiguration)}
          buttonProps={stylex.props(styles.deckConfigurationTrigger)}
          indicatorPosition="start"
        >
          <div {...stylex.props(styles.controls)}>
            <button
              type="button"
              {...stylex.props(styles.button)}
              onClick={() => void saveRegions(REKORDBOX_EXPORT_REGIONS)}
            >
              Vista estándar (2 decks)
            </button>
            {decks
              .filter((deck) => !status.regions[deck])
              .map((deck) => (
                <button
                  key={deck}
                  type="button"
                  {...stylex.props(
                    styles.button,
                    selecting === deck && styles.activeButton,
                  )}
                  onClick={() => selectDeck(deck)}
                  disabled={!status.available}
                >
                  Seleccionar deck {deck}
                </button>
              ))}
          </div>
        </AnimatedDisclosure>
      ) : null}

      {selecting ? (
        <div>
          <div {...stylex.props(styles.editingHeader)}>
            <p {...stylex.props(styles.detail)}>
              Arrastra para crear la zona del deck {selecting}. Usa las esquinas para
              cambiar su tamaño o el icono central para moverla.
            </p>
            <button
              type="button"
              {...stylex.props(styles.button)}
              onClick={finishSelection}
            >
              Finalizar ajuste
            </button>
          </div>
          <div
            aria-busy={status.available && !previewReady}
            {...stylex.props(styles.previewShell)}
          >
            {preview ? (
              <div
                {...stylex.props(styles.preview, !previewReady && styles.previewPending)}
                onPointerDown={previewReady ? beginDrag : undefined}
                onPointerMove={previewReady ? moveDrag : undefined}
                onPointerUp={previewReady ? finishDrag : undefined}
                onPointerCancel={() => cancelDrag(selecting)}
              >
                <img
                  src={preview}
                  alt="Ventana de Rekordbox para elegir la zona del deck"
                  draggable={false}
                  onLoad={() => setPreviewReady(true)}
                  onError={invalidatePreview}
                  {...stylex.props(styles.previewImage)}
                />
                {previewReady
                  ? decks.map((deck) => {
                      const region = deck === selecting ? draft : status.regions[deck]
                      if (!region) return null
                      return (
                        <span
                          key={deck}
                          style={regionStyle(region)}
                          {...stylex.props(
                            styles.region,
                            deck === selecting && styles.activeRegion,
                          )}
                        >
                          <span {...stylex.props(styles.regionLabel)}>{deck}</span>
                          {deck === selecting ? (
                            <>
                              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                                <button
                                  key={corner}
                                  type="button"
                                  data-region-control={corner}
                                  aria-label={`Redimensionar esquina ${corner} del deck ${deck}`}
                                  {...stylex.props(
                                    styles.corner,
                                    corner === "nw" && styles.nw,
                                    corner === "ne" && styles.ne,
                                    corner === "sw" && styles.sw,
                                    corner === "se" && styles.se,
                                  )}
                                />
                              ))}
                              <button
                                type="button"
                                data-region-control="move"
                                aria-label={`Mover zona del deck ${deck}`}
                                title="Mover zona"
                                {...stylex.props(styles.moveHandle)}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  width="20"
                                  height="20"
                                  aria-hidden="true"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" />
                                </svg>
                              </button>
                            </>
                          ) : null}
                        </span>
                      )
                    })
                  : null}
              </div>
            ) : null}
            {!previewReady ? (
              <div {...stylex.props(styles.previewLoading)}>
                {status.available ? (
                  <LoadingIndicator label="Capturando vista de Rekordbox…" />
                ) : (
                  <span {...stylex.props(styles.detail)}>
                    Abre Rekordbox para ajustar la zona.
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : null}
    </section>
  )
}
