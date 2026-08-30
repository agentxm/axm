import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type {
  InstructionProjectionSnapshot,
  InstructionsGitignoreStatus,
  InstructionsStatus,
  InstructionStatusItem,
} from "../../../agents/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { instructionsAgentSupportedRule } from "./instructions-agent-supported.js";
import { instructionsGitignoreCurrentRule } from "./instructions-gitignore-current.js";
import { instructionsSourcePresentRule } from "./instructions-source-present.js";
import { instructionsTargetCurrentRule } from "./instructions-target-current.js";
import { instructionsTargetStaleRule } from "./instructions-target-stale.js";
import { instructionsTargetUnownedRule } from "./instructions-target-unowned.js";

const root = "/repo";
const trackedAliasFixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../__fixtures__/workspace/instructions-gitignore-current",
);

const baseStatus: InstructionsStatus = {
  enabled: true,
  sourceFileName: "AGENTS.md",
  gitignoreAliases: true,
  roots: [root],
  missingSources: [],
  items: [],
  staleTargets: [],
};

const gitignoreCurrent: InstructionsGitignoreStatus = {
  file: `${root}/.gitignore`,
  present: true,
  managed: true,
  desired: true,
  current: true,
  trackedAliases: [],
};

const claudeItem = (overrides: Partial<InstructionStatusItem>): InstructionStatusItem => ({
  root,
  agentId: "claude-code",
  agentName: "Claude Code",
  sourceFile: `${root}/AGENTS.md`,
  targetFile: `${root}/CLAUDE.md`,
  mechanism: "symlink",
  health: "ok",
  ownership: "owned-current",
  observedForm: "symlink",
  details: "Instruction file is current.",
  ...overrides,
});

const contextFor = (args: {
  readonly status?: Option.Option<InstructionsStatus>;
  readonly gitignore?: InstructionsGitignoreStatus;
}): WorkspaceRuleContext => {
  const snapshot: Option.Option<InstructionProjectionSnapshot> =
    args.status === undefined
      ? Option.some({
          plan: { roots: [root], items: [] },
          symlinkSupported: true,
          status: baseStatus,
          gitignore: args.gitignore ?? gitignoreCurrent,
        })
      : Option.map(args.status, (status) => ({
          plan: { roots: status.roots, items: [] },
          symlinkSupported: true,
          status,
          gitignore: args.gitignore ?? gitignoreCurrent,
        }));
  return {
    subject: { root, scope: "project" },
    // Assertion needed: these focused rule tests exercise only the instruction accessor.
    workspace: {} as unknown as WorkspaceRuleContext["workspace"],
    axmDirExists: Effect.succeed(true),
    instructions: { snapshot: Effect.succeed(snapshot) },
    displayRoot: "",
  };
};

describe("instruction workspace rules", () => {
  it.effect("self-gate when instruction config is disabled", () =>
    Effect.gen(function* () {
      const context = contextFor({ status: Option.none() });

      expect(yield* instructionsSourcePresentRule.check(context)).toEqual([]);
      expect(yield* instructionsTargetCurrentRule.check(context)).toEqual([]);
      expect(yield* instructionsTargetUnownedRule.check(context)).toEqual([]);
      expect(yield* instructionsTargetStaleRule.check(context)).toEqual([]);
      expect(yield* instructionsAgentSupportedRule.check(context)).toEqual([]);
      expect(yield* instructionsGitignoreCurrentRule.check(context)).toEqual([]);
    }),
  );

  it.effect("reports missing source files as advisory errors", () =>
    Effect.gen(function* () {
      const context = contextFor({
        status: Option.some({
          ...baseStatus,
          missingSources: [`${root}/docs/AGENTS.md`],
          items: [
            claudeItem({
              health: "missing-source",
              ownership: "absent",
              observedForm: "none",
              details: "Instruction file needs attention.",
            }),
          ],
        }),
      });

      const findings = yield* instructionsSourcePresentRule.check(context);
      expect(findings).toMatchObject([
        {
          kind: "advisory",
          ruleId: "workspace/instructions-source-present",
          severity: "error",
          location: { file: "docs/AGENTS.md" },
        },
        {
          kind: "advisory",
          ruleId: "workspace/instructions-source-present",
          severity: "error",
          location: { file: "AGENTS.md" },
        },
      ]);
    }),
  );

  it.effect("reports AXM-owned drift as regenerable without a mutation capability", () =>
    Effect.gen(function* () {
      const context = contextFor({
        status: Option.some({
          ...baseStatus,
          items: [
            claudeItem({
              mechanism: "copy",
              health: "drift",
              ownership: "owned-drift",
              observedForm: "copy",
              details: "Instruction file needs attention.",
            }),
          ],
        }),
      });

      const findings = yield* instructionsTargetCurrentRule.check(context);
      expect(findings).toMatchObject([
        {
          kind: "advisory",
          ruleId: "workspace/instructions-target-current",
          severity: "warning",
          message: "The AXM-managed Claude Code instruction copy differs from the source file.",
          location: { file: "CLAUDE.md" },
        },
      ]);
      expect("fix" in instructionsTargetCurrentRule).toBe(false);
      expect(yield* instructionsTargetUnownedRule.check(context)).toEqual([]);
    }),
  );

  it.effect("reports an unowned collision as its own finding, never as drift", () =>
    Effect.gen(function* () {
      const context = contextFor({
        status: Option.some({
          ...baseStatus,
          items: [
            claudeItem({
              health: "drift",
              ownership: "unowned",
              observedForm: "file",
              details: "An unowned file occupies the instruction target; AXM will not modify it.",
            }),
          ],
        }),
      });

      expect(yield* instructionsTargetCurrentRule.check(context)).toEqual([]);
      const findings = yield* instructionsTargetUnownedRule.check(context);
      expect(findings).toMatchObject([
        {
          kind: "advisory",
          ruleId: "workspace/instructions-target-unowned",
          severity: "warning",
          location: { file: "CLAUDE.md" },
        },
      ]);
      expect(findings[0]?.message).toContain(
        "An unowned file occupies the Claude Code instruction target",
      );
      expect(findings[0]?.message).toContain("AXM will not modify it");
      expect("fix" in instructionsTargetUnownedRule).toBe(false);
    }),
  );

  it.effect("reports stale AXM-owned aliases the plan no longer desires", () =>
    Effect.gen(function* () {
      const context = contextFor({
        status: Option.some({
          ...baseStatus,
          staleTargets: [
            claudeItem({
              agentId: "gemini-cli",
              agentName: "Gemini CLI",
              targetFile: `${root}/docs/GEMINI.md`,
              sourceFile: `${root}/docs/AGENTS.md`,
              health: "stale",
              observedForm: "broken-link",
            }),
          ],
        }),
      });

      const findings = yield* instructionsTargetStaleRule.check(context);
      expect(findings).toMatchObject([
        {
          kind: "advisory",
          ruleId: "workspace/instructions-target-stale",
          severity: "warning",
          message:
            "The AXM-owned Gemini CLI instruction symlink is no longer desired by the current instruction configuration.",
          location: { file: "docs/GEMINI.md" },
        },
      ]);
      expect(yield* instructionsTargetCurrentRule.check(context)).toEqual([]);
    }),
  );

  it.effect("reports unsupported instruction conventions", () =>
    Effect.gen(function* () {
      const context = contextFor({
        status: Option.some({
          ...baseStatus,
          items: [
            claudeItem({
              agentId: "cursor",
              agentName: "Cursor",
              targetFile: `${root}/.cursor/rules`,
              mechanism: "adapter",
              health: "unsupported",
              ownership: "absent",
              observedForm: "none",
              details: "Instruction file needs attention.",
            }),
          ],
        }),
      });

      const findings = yield* instructionsAgentSupportedRule.check(context);
      expect(findings).toMatchObject([
        {
          kind: "advisory",
          ruleId: "workspace/instructions-agent-supported",
          severity: "warning",
          location: { file: ".cursor/rules" },
        },
      ]);
    }),
  );

  it.effect("reports stale gitignore state without a mutation capability", () =>
    Effect.gen(function* () {
      const context = contextFor({
        gitignore: {
          file: `${root}/.gitignore`,
          present: true,
          managed: true,
          desired: true,
          current: false,
          trackedAliases: [],
        },
      });

      const findings = yield* instructionsGitignoreCurrentRule.check(context);
      expect(findings).toMatchObject([
        {
          kind: "advisory",
          ruleId: "workspace/instructions-gitignore-current",
          severity: "info",
          message: "Instruction-file ignore entries are missing or stale.",
          location: { file: ".gitignore" },
        },
      ]);
      expect("fix" in instructionsGitignoreCurrentRule).toBe(false);
    }),
  );

  it.effect("reports tracked aliases and names the reconciling setting", () =>
    Effect.gen(function* () {
      expect(fs.readFileSync(path.join(trackedAliasFixture, ".gitignore"), "utf8")).toContain(
        "**/CLAUDE.md",
      );
      expect(fs.existsSync(path.join(trackedAliasFixture, "CLAUDE.md"))).toBe(true);
      const findings = yield* instructionsGitignoreCurrentRule.check(
        contextFor({
          gitignore: {
            ...gitignoreCurrent,
            trackedAliases: ["CLAUDE.md"],
          },
        }),
      );
      expect(findings).toEqual([
        {
          kind: "advisory",
          ruleId: "workspace/instructions-gitignore-current",
          severity: "info",
          message:
            "Managed ignore entries cover paths already present in the Git index (CLAUDE.md); set gitignoreAliases: false to reconcile tracked instruction aliases.",
          location: { file: ".gitignore" },
        },
      ]);
    }),
  );
});
