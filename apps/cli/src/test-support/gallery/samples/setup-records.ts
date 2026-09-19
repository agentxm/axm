import type { SetupOutcome, SetupPlanRow } from "@agentxm/workspace/configuration";

import { confirmAnswer } from "../../../screen/ask/confirm.js";
import { chooseAnswer } from "../../../screen/ask/choose.js";
import { pickAnswer } from "../../../screen/ask/pick.js";
import type { Doc } from "../../../screen/doc.js";
import { setupAgentScanDoc, setupTitleDoc } from "../../../root/setup/view.js";
import { agentsSource, instructionSource } from "./instruction-source-asks.js";
import { agentsPick } from "./pick-asks.js";
import {
  instructionSyncAsk,
  setupPlanAsk,
} from "../../../workspace-initialization-interaction-live.js";

/**
 * The storefront the playable setup board runs against (canvas *Direction:
 * Ledger*, board `Ledger-setup-play`): four agents found, three of them
 * picked, and an existing AGENTS.md the instructions stay sourced from.
 */
const WHERE = "~/code/storefront";

const yes = { key: "y", word: "yes", value: true } as const;
const no = { key: "n", word: "no", value: false } as const;

export const syncAsk = instructionSyncAsk(true);

/** The standard apply gate: nothing has been written yet, so it proceeds by default. */
export const applyAsk = setupPlanAsk;

/** The record as it opens: the title line and what the scan found. */
export const setupOpening = (preview = false): Doc => [
  ...setupTitleDoc({ preview, where: WHERE, scope: "project" }),
  ...setupAgentScanDoc({ detectedCount: 4, retiredAgents: [] }),
];

/** Each answered question leaves one line, and nothing between them. */
export const agentsAnswered: Doc = [...setupOpening(), ...pickAnswer(agentsPick, [0, 1, 2])];

export const syncAnswered = (sync: boolean): Doc => [
  ...agentsAnswered,
  ...confirmAnswer(syncAsk, sync ? yes : no),
];

export const sourceAnswered: Doc = [
  ...syncAnswered(true),
  ...chooseAnswer(instructionSource, agentsSource),
];

const settings: SetupPlanRow = {
  target: "axm.json",
  action: "create",
  detail: { _tag: "settings", agentIds: ["claude-code", "codex", "cursor"] },
};
const gitignore: SetupPlanRow = {
  target: ".gitignore",
  action: "update",
  detail: { _tag: "gitignore" },
};

/** What setup would touch with instructions synced from the existing AGENTS.md. */
export const syncedPlan: ReadonlyArray<SetupPlanRow> = [
  settings,
  gitignore,
  { target: "AGENTS.md", action: "in sync", detail: { _tag: "instructionSource" } },
  {
    target: "CLAUDE.md",
    action: "link",
    detail: { _tag: "instructionTarget", agentName: "Claude Code" },
  },
  {
    target: "AGENTS.md",
    action: "in sync",
    detail: { _tag: "instructionTarget", agentName: "Codex" },
  },
  {
    target: ".cursor/rules/agents.mdc",
    action: "copy",
    detail: { _tag: "instructionTarget", agentName: "Cursor" },
  },
];

/** A declined sync leaves every instruction file alone, so its plan names none. */
export const unsyncedPlan: ReadonlyArray<SetupPlanRow> = [settings, gitignore];

const agents = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "cursor", name: "Cursor" },
];

/** The outcome fields every setup report carries, around the ones a frame varies. */
const outcomeBase = {
  planName: "Set up AXM workspace",
  planDescription: "Set up AXM (project)",
  totalSteps: 0,
  readyCount: 0,
  warningCount: 0,
  errorCount: 0,
  appliedCount: 0,
  failedCount: 0,
  blockedCount: 0,
  steps: [],
  changed: false,
  defaultSkillInstalled: false,
  scope: "project",
  agents,
  scopeSupport: [],
  settingsPath: "axm.json",
  telemetryEnabled: false,
} satisfies Partial<SetupOutcome>;

const workspaceStep = {
  label: "Workspace configuration",
  status: "applied",
  artifact: {
    path: "axm.json",
    scope: "project",
    change: "created",
    targets: [
      { path: "axm.json", change: "created" },
      { path: "axm-lock.yaml", change: "created" },
      { path: ".gitignore", change: "updated" },
    ],
  },
} satisfies SetupOutcome["steps"][number];

const instructionsStep = {
  label: "Instruction files",
  status: "applied",
  artifact: {
    path: "AGENTS.md",
    scope: "project",
    change: "created",
    targets: [
      { path: "AGENTS.md", change: "unchanged" },
      { path: "CLAUDE.md", change: "created" },
      { path: ".cursor/rules/agents.mdc", change: "created" },
    ],
  },
} satisfies SetupOutcome["steps"][number];

const skillStep = {
  label: "@agentxm/skills/axm",
  status: "applied",
  artifact: {
    path: "agent_extensions/registry/@agentxm/skills/axm",
    scope: "project",
    agents: ["claude-code", "codex", "cursor"],
    version: "0.31.1",
    change: "created",
    targets: [
      { path: "agent_extensions/registry/@agentxm/skills/axm", change: "created" },
      { path: ".claude/skills/axm", change: "created", agentIds: ["claude-code"] },
      { path: ".agents/skills/axm", change: "created", agentIds: ["codex"] },
      { path: ".cursor/skills/axm", change: "created", agentIds: ["cursor"] },
    ],
  },
} satisfies SetupOutcome["steps"][number];

export const initializedOutcome: SetupOutcome = {
  ...outcomeBase,
  outcome: "applied",
  status: "initialized",
  changed: true,
  defaultSkillInstalled: true,
  totalSteps: 3,
  appliedCount: 3,
  steps: [workspaceStep, instructionsStep, skillStep],
  message: "Initialized with agents: Claude Code, Codex, Cursor",
  scopeSupport: [
    {
      type: "hook",
      label: "Hook",
      placement: "per-agent",
      outcomes: [
        {
          target: "agent",
          agentId: "cursor",
          agentName: "Cursor",
          status: "unsupported",
          reasonCode: "axm-capability-unavailable",
          reason: "AXM cannot write Cursor hooks yet.",
        },
      ],
    },
  ],
};

export const cancelledOutcome: SetupOutcome = {
  ...outcomeBase,
  outcome: "cancelled",
  status: "cancelled",
  agents: [],
  message: "Setup cancelled — no changes applied",
};

export const previewOutcome: SetupOutcome = {
  ...outcomeBase,
  outcome: "previewed",
  status: "preview",
  message: "Setup plan ready",
  previewDefaults: {
    agents: "detected",
    instructions: { enabled: true, fileName: "AGENTS.md" },
  },
};

/** The suggestions a first project setup ends with, trimmed to the board's two. */
export const setupNext = [
  { description: "Discover recommended extensions", cmd: "axm discover" },
  { description: "Preview workspace reconciliation", cmd: "axm sync --preview" },
];
