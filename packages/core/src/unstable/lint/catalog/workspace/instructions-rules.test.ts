import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { InstructionsGitignoreStatus, InstructionsStatus } from "../../../agents/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import { instructionsAgentSupportedRule } from "./instructions-agent-supported.js";
import { instructionsGitignoreCurrentRule } from "./instructions-gitignore-current.js";
import { instructionsSourcePresentRule } from "./instructions-source-present.js";
import { instructionsTargetCurrentRule } from "./instructions-target-current.js";

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
  items: [],
};

const gitignoreCurrent: InstructionsGitignoreStatus = {
  file: `${root}/.gitignore`,
  desired: true,
  current: true,
  trackedAliases: [],
};

const contextFor = (args: {
  readonly status?: Option.Option<InstructionsStatus>;
  readonly gitignore?: Option.Option<InstructionsGitignoreStatus>;
}): WorkspaceRuleContext => ({
  subject: { root, scope: "project" },
  // Assertion needed: these focused rule tests exercise only the instruction accessor.
  workspace: {} as unknown as WorkspaceRuleContext["workspace"],
  axmDirExists: Effect.succeed(true),
  instructions: {
    status: Effect.succeed(args.status ?? Option.some(baseStatus)),
    gitignore: Effect.succeed(args.gitignore ?? Option.some(gitignoreCurrent)),
  },
  displayRoot: "",
});

describe("instruction workspace rules", () => {
  it.effect("self-gate when instruction config is disabled", () =>
    Effect.gen(function* () {
      const context = contextFor({
        status: Option.none(),
        gitignore: Option.none(),
      });

      expect(yield* instructionsSourcePresentRule.check(context)).toEqual([]);
      expect(yield* instructionsTargetCurrentRule.check(context)).toEqual([]);
      expect(yield* instructionsAgentSupportedRule.check(context)).toEqual([]);
      expect(yield* instructionsGitignoreCurrentRule.check(context)).toEqual([]);
    }),
  );

  it.effect("reports missing source files as advisory errors", () =>
    Effect.gen(function* () {
      const context = contextFor({
        status: Option.some({
          ...baseStatus,
          items: [
            {
              root,
              agentId: "claude-code",
              agentName: "Claude Code",
              sourceFile: `${root}/AGENTS.md`,
              targetFile: `${root}/CLAUDE.md`,
              mechanism: "symlink",
              health: "missing-source",
              details: "Instruction file needs attention.",
            },
          ],
        }),
      });

      const findings = yield* instructionsSourcePresentRule.check(context);
      expect(findings).toMatchObject([
        {
          kind: "advisory",
          ruleId: "workspace/instructions-source-present",
          severity: "error",
          location: { file: "AGENTS.md" },
        },
      ]);
    }),
  );

  it.effect("reports target drift as a fact without a mutation capability", () =>
    Effect.gen(function* () {
      const context = contextFor({
        status: Option.some({
          ...baseStatus,
          items: [
            {
              root,
              agentId: "claude-code",
              agentName: "Claude Code",
              sourceFile: `${root}/AGENTS.md`,
              targetFile: `${root}/CLAUDE.md`,
              mechanism: "copy",
              health: "drift",
              details: "Instruction file needs attention.",
            },
          ],
        }),
      });

      const findings = yield* instructionsTargetCurrentRule.check(context);
      expect(findings).toMatchObject([
        {
          kind: "advisory",
          ruleId: "workspace/instructions-target-current",
          severity: "warning",
          location: { file: "CLAUDE.md" },
        },
      ]);
      expect("fix" in instructionsTargetCurrentRule).toBe(false);
    }),
  );

  it.effect("reports unsupported instruction conventions", () =>
    Effect.gen(function* () {
      const context = contextFor({
        status: Option.some({
          ...baseStatus,
          items: [
            {
              root,
              agentId: "cursor",
              agentName: "Cursor",
              sourceFile: `${root}/AGENTS.md`,
              targetFile: `${root}/.cursor/rules`,
              mechanism: "adapter",
              health: "unsupported",
              details: "Instruction file needs attention.",
            },
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
        gitignore: Option.some({
          file: `${root}/.gitignore`,
          desired: false,
          current: false,
          trackedAliases: [],
        }),
      });

      const findings = yield* instructionsGitignoreCurrentRule.check(context);
      expect(findings).toMatchObject([
        {
          kind: "advisory",
          ruleId: "workspace/instructions-gitignore-current",
          severity: "info",
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
          gitignore: Option.some({
            ...gitignoreCurrent,
            trackedAliases: ["CLAUDE.md"],
          }),
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
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
