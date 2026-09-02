import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type {
  InstructionProjectionSnapshot,
  InstructionsGitignoreStatus,
  InstructionsStatus,
  InstructionStatusItem,
} from "@agentxm/extension-workspace";
import type { WorkspaceRuleContext } from "../../../../workspace-context.js";
import { instructionsAgentSupportedRule } from "../../instructions-agent-supported.js";
import { instructionsGitignoreCurrentRule } from "../../instructions-gitignore-current.js";
import { instructionsSourcePresentRule } from "../../instructions-source-present.js";
import { instructionsTargetCurrentRule } from "../../instructions-target-current.js";
import { instructionsTargetStaleRule } from "../../instructions-target-stale.js";
import { instructionsTargetUnownedRule } from "../../instructions-target-unowned.js";
import {
  contextFor,
  validLockfile,
  validSettings,
  type WorkspaceRuleConformanceCase,
} from "../test-helpers.js";

export const instructionRoot = "/workspace";

export const baseInstructionStatus: InstructionsStatus = {
  enabled: true,
  sourceFileName: "AGENTS.md",
  gitignoreAliases: true,
  roots: [instructionRoot],
  missingSources: [],
  items: [],
  staleTargets: [],
};

export const currentGitignore: InstructionsGitignoreStatus = {
  file: `${instructionRoot}/.gitignore`,
  present: true,
  managed: true,
  desired: true,
  current: true,
  trackedAliases: [],
};

export const claudeInstructionItem = (
  overrides: Partial<InstructionStatusItem>,
): InstructionStatusItem => ({
  root: instructionRoot,
  agentId: "claude-code",
  agentName: "Claude Code",
  sourceFile: `${instructionRoot}/AGENTS.md`,
  targetFile: `${instructionRoot}/CLAUDE.md`,
  mechanism: "symlink",
  health: "ok",
  ownership: "owned-current",
  observedForm: "symlink",
  details: "Instruction file is current.",
  ...overrides,
});

export const instructionContext = (args: {
  readonly status?: Option.Option<InstructionsStatus>;
  readonly gitignore?: InstructionsGitignoreStatus;
}): Effect.Effect<WorkspaceRuleContext> => {
  const snapshot: Option.Option<InstructionProjectionSnapshot> =
    args.status === undefined
      ? Option.some({
          plan: { roots: [instructionRoot], items: [] },
          symlinkSupported: true,
          status: baseInstructionStatus,
          gitignore: args.gitignore ?? currentGitignore,
        })
      : Option.map(args.status, (status) => ({
          plan: { roots: status.roots, items: [] },
          symlinkSupported: true,
          status,
          gitignore: args.gitignore ?? currentGitignore,
        }));

  return contextFor({ settings: validSettings(), lockfile: validLockfile }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          instructions: { snapshot: Effect.succeed(snapshot) },
        }) satisfies WorkspaceRuleContext,
    ),
  );
};

const satisfied = () => instructionContext({});
const inapplicable = () => instructionContext({ status: Option.none() });

export const instructionsSourcePresentConformance: WorkspaceRuleConformanceCase = {
  rule: instructionsSourcePresentRule,
  satisfied,
  violated: () =>
    instructionContext({
      status: Option.some({
        ...baseInstructionStatus,
        missingSources: [`${instructionRoot}/docs/AGENTS.md`],
        items: [
          claudeInstructionItem({
            sourceFile: `${instructionRoot}/docs/AGENTS.md`,
            health: "missing-source",
            ownership: "absent",
            observedForm: "none",
          }),
        ],
      }),
    }),
  expectedFindings: [
    {
      message: "The configured instruction source file is missing.",
      location: { file: "docs/AGENTS.md" },
    },
  ],
  inapplicable,
};

export const instructionsTargetCurrentConformance: WorkspaceRuleConformanceCase = {
  rule: instructionsTargetCurrentRule,
  satisfied,
  violated: () =>
    instructionContext({
      status: Option.some({
        ...baseInstructionStatus,
        items: [
          claudeInstructionItem({
            mechanism: "copy",
            health: "drift",
            ownership: "owned-drift",
            observedForm: "copy",
          }),
        ],
      }),
    }),
  expectedFindings: [
    {
      message: "The AXM-managed Claude Code instruction copy differs from the source file.",
      location: { file: "CLAUDE.md" },
    },
  ],
  inapplicable,
};

export const instructionsTargetUnownedConformance: WorkspaceRuleConformanceCase = {
  rule: instructionsTargetUnownedRule,
  satisfied,
  violated: () =>
    instructionContext({
      status: Option.some({
        ...baseInstructionStatus,
        items: [
          claudeInstructionItem({
            health: "drift",
            ownership: "unowned",
            observedForm: "file",
          }),
        ],
      }),
    }),
  expectedFindings: [
    {
      message:
        "An unowned file occupies the Claude Code instruction target; AXM will not modify it. Remove or rename it, or make it the canonical source with `axm instructions enable --file`.",
      location: { file: "CLAUDE.md" },
    },
  ],
  inapplicable,
};

export const instructionsTargetStaleConformance: WorkspaceRuleConformanceCase = {
  rule: instructionsTargetStaleRule,
  satisfied,
  violated: () =>
    instructionContext({
      status: Option.some({
        ...baseInstructionStatus,
        staleTargets: [
          claudeInstructionItem({
            agentId: "gemini-cli",
            agentName: "Gemini CLI",
            targetFile: `${instructionRoot}/docs/GEMINI.md`,
            sourceFile: `${instructionRoot}/docs/AGENTS.md`,
            health: "stale",
            observedForm: "broken-link",
          }),
        ],
      }),
    }),
  expectedFindings: [
    {
      message:
        "The AXM-owned Gemini CLI instruction symlink is no longer desired by the current instruction configuration.",
      location: { file: "docs/GEMINI.md" },
    },
  ],
  inapplicable,
};

export const instructionsAgentSupportedConformance: WorkspaceRuleConformanceCase = {
  rule: instructionsAgentSupportedRule,
  satisfied,
  violated: () =>
    instructionContext({
      status: Option.some({
        ...baseInstructionStatus,
        items: [
          claudeInstructionItem({
            agentId: "cursor",
            agentName: "Cursor",
            targetFile: `${instructionRoot}/.cursor/rules`,
            mechanism: "adapter",
            health: "unsupported",
            ownership: "absent",
            observedForm: "none",
          }),
        ],
      }),
    }),
  expectedFindings: [
    {
      message:
        "Cursor does not support automatic instruction-file propagation. Manage that agent's instruction file manually.",
      location: { file: ".cursor/rules" },
    },
  ],
  inapplicable,
};

export const instructionsGitignoreCurrentConformance: WorkspaceRuleConformanceCase = {
  rule: instructionsGitignoreCurrentRule,
  satisfied,
  violated: () =>
    instructionContext({
      gitignore: { ...currentGitignore, current: false },
    }),
  expectedFindings: [
    {
      message: "Instruction-file ignore entries are missing or stale.",
      location: { file: ".gitignore" },
    },
  ],
  inapplicable,
};

export const instructionConformanceCases: ReadonlyArray<WorkspaceRuleConformanceCase> = [
  instructionsSourcePresentConformance,
  instructionsTargetCurrentConformance,
  instructionsTargetUnownedConformance,
  instructionsTargetStaleConformance,
  instructionsAgentSupportedConformance,
  instructionsGitignoreCurrentConformance,
];
