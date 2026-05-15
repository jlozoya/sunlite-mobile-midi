const NAMED_PAD_LABELS = {
    36: "Blackout",
    37: "Full On",
    38: "Scene 1",
    39: "Scene 2",
    40: "Scene 3",
    41: "Scene 4",
    42: "Strobe",
    43: "Move 1",
    44: "Move 2",
    45: "Chase",
};
const NAMED_PAD_COLORS = {
    36: "red",
    37: "amber",
    38: "purple",
    39: "purple",
    40: "purple",
    41: "purple",
    42: "yellow",
    43: "cyan",
    44: "cyan",
    45: "green",
};
export const PAD_GRID = Array.from({ length: 64 }, (_, index) => {
    const note = 36 + index;
    return {
        id: `pad-${note}`,
        label: NAMED_PAD_LABELS[note] ?? `Pad ${index + 1}`,
        note,
        row: Math.floor(index / 8),
        column: index % 8,
        defaultColor: NAMED_PAD_COLORS[note] ?? "off",
    };
});
export const SCENE_BUTTONS = Array.from({ length: 8 }, (_, index) => ({
    id: `scene-launch-${index + 1}`,
    label: `Scene ${index + 1}`,
    note: 100 + index,
}));
export const FADERS = [
    { id: "fader-1", label: "Dimmer", controller: 1, defaultValue: 127 },
    { id: "fader-2", label: "Speed", controller: 2, defaultValue: 64 },
    { id: "fader-3", label: "Red", controller: 3, defaultValue: 0 },
    { id: "fader-4", label: "Green", controller: 4, defaultValue: 0 },
    { id: "fader-5", label: "Blue", controller: 5, defaultValue: 0 },
    { id: "fader-6", label: "White", controller: 6, defaultValue: 0 },
    { id: "fader-7", label: "FX 1", controller: 7, defaultValue: 0 },
    { id: "fader-8", label: "FX 2", controller: 8, defaultValue: 0 },
    { id: "fader-9", label: "Master", controller: 9, defaultValue: 127 },
];
export const PAD_COLOR_OPTIONS = ["off", "red", "amber", "yellow", "green", "cyan", "blue", "purple", "white"];
export const DEFAULT_CONTROLLER_CUSTOMIZATION = {
    pads: Object.fromEntries(PAD_GRID.map((pad) => [
        String(pad.note),
        {
            label: pad.label,
            offColor: pad.defaultColor ?? "off",
            onColor: pad.defaultColor && pad.defaultColor !== "off" ? pad.defaultColor : "green",
        },
    ])),
    sceneButtons: Object.fromEntries(SCENE_BUTTONS.map((button) => [
        String(button.note),
        {
            label: button.label,
            offColor: "blue",
            onColor: "white",
        },
    ])),
    faders: Object.fromEntries(FADERS.map((fader) => [
        String(fader.controller),
        {
            label: fader.label,
        },
    ])),
};
export function mergeControllerCustomization(value) {
    const partial = value && typeof value === "object" ? value : {};
    const pads = { ...DEFAULT_CONTROLLER_CUSTOMIZATION.pads };
    for (const [key, customization] of Object.entries(partial.pads ?? {})) {
        if (!customization || typeof customization !== "object")
            continue;
        const current = pads[key] ?? { label: `Pad ${key}`, offColor: "off", onColor: "green" };
        pads[key] = {
            label: typeof customization.label === "string" ? customization.label : current.label,
            offColor: isPadColor(customization.offColor) ? customization.offColor : current.offColor,
            onColor: isPadColor(customization.onColor) ? customization.onColor : current.onColor,
        };
    }
    const sceneButtons = { ...DEFAULT_CONTROLLER_CUSTOMIZATION.sceneButtons };
    for (const [key, customization] of Object.entries(partial.sceneButtons ?? {})) {
        if (!customization || typeof customization !== "object")
            continue;
        const current = sceneButtons[key] ?? { label: `Scene ${key}`, offColor: "blue", onColor: "white" };
        sceneButtons[key] = {
            label: typeof customization.label === "string" ? customization.label : current.label,
            offColor: isPadColor(customization.offColor) ? customization.offColor : current.offColor,
            onColor: isPadColor(customization.onColor) ? customization.onColor : current.onColor,
        };
    }
    const faders = { ...DEFAULT_CONTROLLER_CUSTOMIZATION.faders };
    for (const [key, customization] of Object.entries(partial.faders ?? {})) {
        if (!customization || typeof customization !== "object")
            continue;
        const current = faders[key] ?? { label: `CC ${key}` };
        faders[key] = {
            label: typeof customization.label === "string" ? customization.label : current.label,
        };
    }
    return { pads, sceneButtons, faders };
}
function isPadColor(value) {
    return typeof value === "string" && PAD_COLOR_OPTIONS.includes(value);
}
