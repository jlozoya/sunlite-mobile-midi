import fs from "node:fs"
import path from "node:path"
import {
  DEFAULT_CONTROLLER_CUSTOMIZATION,
  mergeControllerCustomization,
  type ControllerCustomization,
} from "../../shared/controller-config.js"

export function createControllerStore(lightingProfilePath: () => string) {
  let controllerCustomization: ControllerCustomization = DEFAULT_CONTROLLER_CUSTOMIZATION

  function getControllerConfigPath(): string {
    return path.join(lightingProfilePath(), "controller-config.json")
  }

  function loadControllerCustomization(): ControllerCustomization {
    const configPath = getControllerConfigPath()

    try {
      if (!fs.existsSync(configPath)) {
        controllerCustomization = DEFAULT_CONTROLLER_CUSTOMIZATION
        return controllerCustomization
      }

      const raw = fs.readFileSync(configPath, "utf8")
      controllerCustomization = mergeControllerCustomization(JSON.parse(raw))
      return controllerCustomization
    } catch {
      controllerCustomization = DEFAULT_CONTROLLER_CUSTOMIZATION
      return controllerCustomization
    }
  }

  function saveControllerCustomization(
    nextCustomization: ControllerCustomization,
  ): ControllerCustomization {
    controllerCustomization = mergeControllerCustomization(nextCustomization)
    const configPath = getControllerConfigPath()
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(controllerCustomization, null, 2), "utf8")
    return controllerCustomization
  }
  return {
    loadControllerCustomization,
    saveControllerCustomization,
    getCustomization: () => controllerCustomization,
  }
}
