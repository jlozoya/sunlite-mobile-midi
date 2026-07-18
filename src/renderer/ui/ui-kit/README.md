# Sunlite UI kit

This kit distills the patterns already present in the application into reusable
primitives. It is intentionally small: each component represents a pattern that
appears repeatedly in the controller, connection setup or automation studio.

## Foundations

- Canvas and surfaces use deep navy tones to keep MIDI feedback visually dominant.
- Violet identifies product actions; cyan is reserved for automation and analysis.
- Green, amber and red are semantic states and should not be used decoratively.
- Controls use 12–14 px radii; content surfaces use 22–24 px radii.

## Components

- `ActionButton`: primary, secondary, ghost and danger actions in violet or cyan.
- `Surface`: panel, solid, subtle, inset and raised content containers.
- `StatusBadge`: compact connection and process state.
- `Notice`: neutral, informational, success, warning and danger feedback.
- `SectionHeader`: consistent title, optional eyebrow and description hierarchy.
- `TextInputField`: accessible labelled text input with optional help text.

Import components from `ui-kit` and design values from `tokens.stylex`. Prefer a
kit primitive before adding a new local button, panel, alert or field style.
