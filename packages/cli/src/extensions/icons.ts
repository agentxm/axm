/**
 * Extension type icon paths keyed by ExtensionType.
 *
 * Each icon is an SVG file under ./icons.
 */

import type { ExtensionType } from "./common.js";

export const EXTENSION_TYPE_ICON_PATHS = {
  skill: "./icons/skill.svg",
  command: "./icons/command.svg",
  pack: "./icons/pack.svg",
  "mcp-server": "./icons/mcp-server.svg",
} as const satisfies Record<ExtensionType, string>;

export const getExtensionTypeIconPath = (extensionType: ExtensionType): string =>
  EXTENSION_TYPE_ICON_PATHS[extensionType];
