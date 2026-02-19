/**
 * Agent icon paths keyed by AgentId.
 *
 * Each icon is an SVG file under ./icons.
 */

import type { AgentId } from "./types.js";

export const AGENT_ICON_PATHS = {
  adal: "./icons/adal.svg",
  amp: "./icons/amp.svg",
  antigravity: "./icons/antigravity.svg",
  augment: "./icons/augment.svg",
  "claude-code": "./icons/claude-code.svg",
  cline: "./icons/cline.svg",
  codebuddy: "./icons/codebuddy.svg",
  codex: "./icons/codex.svg",
  "command-code": "./icons/command-code.svg",
  continue: "./icons/continue.svg",
  crush: "./icons/crush.svg",
  cursor: "./icons/cursor.svg",
  droid: "./icons/droid.svg",
  "gemini-cli": "./icons/gemini-cli.svg",
  "github-copilot": "./icons/github-copilot.svg",
  goose: "./icons/goose.svg",
  "iflow-cli": "./icons/iflow-cli.svg",
  junie: "./icons/junie.svg",
  kilo: "./icons/kilo.svg",
  "kimi-cli": "./icons/kimi-cli.svg",
  "kiro-cli": "./icons/kiro-cli.svg",
  kode: "./icons/kode.svg",
  mcpjam: "./icons/mcpjam.svg",
  "mistral-vibe": "./icons/mistral-vibe.svg",
  mux: "./icons/mux.svg",
  neovate: "./icons/neovate.svg",
  openclaw: "./icons/openclaw.svg",
  opencode: "./icons/opencode.svg",
  openhands: "./icons/openhands.svg",
  pi: "./icons/pi.svg",
  pochi: "./icons/pochi.svg",
  qoder: "./icons/qoder.svg",
  "qwen-code": "./icons/qwen-code.svg",
  replit: "./icons/replit.svg",
  roo: "./icons/roo.svg",
  trae: "./icons/trae.svg",
  "trae-cn": "./icons/trae-cn.svg",
  windsurf: "./icons/windsurf.svg",
  zencoder: "./icons/zencoder.svg",
} as const satisfies Record<AgentId, string>;

export const getAgentIconPath = (agentId: AgentId): string => AGENT_ICON_PATHS[agentId];
