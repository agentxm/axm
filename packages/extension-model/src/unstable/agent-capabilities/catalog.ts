/**
 * Agent capability catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import type { Agent } from "./schema.js";
import {
  adalAgent,
  aiderDeskAgent,
  ampAgent,
  antigravityCliAgent,
  antigravityAgent,
  augmentAgent,
  chatgptAgent,
  claudeAiAgent,
  claudeCodeAgent,
  clineAgent,
  codeartsAgentAgent,
  codebuddyAgent,
  codemakerAgent,
  codestudioAgent,
  codexAgent,
  commandCodeAgent,
  continueAgent,
  cortexAgent,
  coworkAgent,
  crushAgent,
  cursorAgent,
  deepagentsAgent,
  devinAgent,
  dextoAgent,
  droidAgent,
  firebenderAgent,
  forgecodeAgent,
  geminiCliAgent,
  geminiAppAgent,
  githubCopilotCliAgent,
  gooseAgent,
  grokCliAgent,
  hermesAgent,
  ibmBobAgent,
  iflowCliAgent,
  junieAgent,
  lingmaAgent,
  kiloAgent,
  kimiCliAgent,
  kiroCliAgent,
  kodeAgent,
  mcpjamAgent,
  minimaxCodeAgent,
  mistralVibeAgent,
  muxAgent,
  neovateAgent,
  openclawAgent,
  opencodeAgent,
  openhandsAgent,
  onaAgent,
  piAgent,
  pochiAgent,
  qoderAgent,
  qoderCnAgent,
  qwenCodeAgent,
  replitAgent,
  rooAgent,
  rovodevAgent,
  tabnineCliAgent,
  traeCnAgent,
  traeAgent,
  warpAgent,
  windsurfAgent,
  zencoderAgent,
  zedAgent,
  zenflowAgent,
} from "./data/agents/index.js";

const defineCatalog = <const T extends Record<string, Agent>>(
  entries: T & { readonly [K in keyof T]: { readonly id: K } },
): T => entries;

/** @experimental This API is unstable and may change without notice. */
export const CONFIGURABLE_AGENTS_BY_ID = defineCatalog({
  adal: adalAgent,
  "aider-desk": aiderDeskAgent,
  amp: ampAgent,
  antigravity: antigravityAgent,
  "antigravity-cli": antigravityCliAgent,
  augment: augmentAgent,
  "claude-code": claudeCodeAgent,
  cline: clineAgent,
  "codearts-agent": codeartsAgentAgent,
  codebuddy: codebuddyAgent,
  codemaker: codemakerAgent,
  codestudio: codestudioAgent,
  codex: codexAgent,
  "command-code": commandCodeAgent,
  continue: continueAgent,
  cortex: cortexAgent,
  crush: crushAgent,
  cursor: cursorAgent,
  deepagents: deepagentsAgent,
  devin: devinAgent,
  dexto: dextoAgent,
  droid: droidAgent,
  firebender: firebenderAgent,
  forgecode: forgecodeAgent,
  "gemini-cli": geminiCliAgent,
  "github-copilot-cli": githubCopilotCliAgent,
  goose: gooseAgent,
  "grok-cli": grokCliAgent,
  hermes: hermesAgent,
  "ibm-bob": ibmBobAgent,
  "iflow-cli": iflowCliAgent,
  junie: junieAgent,
  lingma: lingmaAgent,
  kilo: kiloAgent,
  "kimi-cli": kimiCliAgent,
  "kiro-cli": kiroCliAgent,
  kode: kodeAgent,
  mcpjam: mcpjamAgent,
  "minimax-code": minimaxCodeAgent,
  "mistral-vibe": mistralVibeAgent,
  mux: muxAgent,
  neovate: neovateAgent,
  openclaw: openclawAgent,
  opencode: opencodeAgent,
  openhands: openhandsAgent,
  ona: onaAgent,
  pi: piAgent,
  pochi: pochiAgent,
  qoder: qoderAgent,
  "qoder-cn": qoderCnAgent,
  "qwen-code": qwenCodeAgent,
  replit: replitAgent,
  roo: rooAgent,
  rovodev: rovodevAgent,
  "tabnine-cli": tabnineCliAgent,
  "trae-cn": traeCnAgent,
  trae: traeAgent,
  warp: warpAgent,
  windsurf: windsurfAgent,
  zencoder: zencoderAgent,
  zed: zedAgent,
  zenflow: zenflowAgent,
});

/** @experimental This API is unstable and may change without notice. */
export const CONFIGURABLE_AGENT_IDS = [
  "adal",
  "aider-desk",
  "amp",
  "antigravity",
  "antigravity-cli",
  "augment",
  "claude-code",
  "cline",
  "codearts-agent",
  "codebuddy",
  "codemaker",
  "codestudio",
  "codex",
  "command-code",
  "continue",
  "cortex",
  "crush",
  "cursor",
  "deepagents",
  "devin",
  "dexto",
  "droid",
  "firebender",
  "forgecode",
  "gemini-cli",
  "github-copilot-cli",
  "goose",
  "grok-cli",
  "hermes",
  "ibm-bob",
  "iflow-cli",
  "junie",
  "lingma",
  "kilo",
  "kimi-cli",
  "kiro-cli",
  "kode",
  "mcpjam",
  "minimax-code",
  "mistral-vibe",
  "mux",
  "neovate",
  "openclaw",
  "opencode",
  "openhands",
  "ona",
  "pi",
  "pochi",
  "qoder",
  "qoder-cn",
  "qwen-code",
  "replit",
  "roo",
  "rovodev",
  "tabnine-cli",
  "trae-cn",
  "trae",
  "warp",
  "windsurf",
  "zencoder",
  "zed",
  "zenflow",
] as const satisfies ReadonlyArray<keyof typeof CONFIGURABLE_AGENTS_BY_ID & string>;

/** @experimental This API is unstable and may change without notice. */
export type ConfigurableAgentId = (typeof CONFIGURABLE_AGENT_IDS)[number];

/** @experimental This API is unstable and may change without notice. */
export const HOSTED_AGENTS_BY_ID = defineCatalog({
  chatgpt: chatgptAgent,
  "claude-ai": claudeAiAgent,
  cowork: coworkAgent,
  "gemini-app": geminiAppAgent,
});

/** @experimental This API is unstable and may change without notice. */
export const HOSTED_AGENT_IDS = [
  "chatgpt",
  "claude-ai",
  "cowork",
  "gemini-app",
] as const satisfies ReadonlyArray<keyof typeof HOSTED_AGENTS_BY_ID & string>;

/** @experimental This API is unstable and may change without notice. */
export type HostedAgentId = (typeof HOSTED_AGENT_IDS)[number];

/** @experimental This API is unstable and may change without notice. */
export const AGENTS_BY_ID = defineCatalog({
  ...CONFIGURABLE_AGENTS_BY_ID,
  ...HOSTED_AGENTS_BY_ID,
});

/** @experimental This API is unstable and may change without notice. */
export const AGENT_IDS = [
  ...CONFIGURABLE_AGENT_IDS,
  ...HOSTED_AGENT_IDS,
] as const satisfies ReadonlyArray<keyof typeof AGENTS_BY_ID & string>;

/** @experimental This API is unstable and may change without notice. */
export type AgentId = (typeof AGENT_IDS)[number];

/** @experimental This API is unstable and may change without notice. */
export const AgentIdSchema = Schema.Literals(AGENT_IDS).annotate({
  identifier: "AgentId",
  title: "Agent ID",
  description: "Verified coding agent identifier in the capability catalog.",
  examples: ["claude-code", "codex", "cursor"],
});

/** @experimental This API is unstable and may change without notice. */
export const AGENTS = Object.values(AGENTS_BY_ID);
