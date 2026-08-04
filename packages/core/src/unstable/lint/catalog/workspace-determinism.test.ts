/**
 * Determinism harness for workspace autofixing rules (task 3c.19).
 *
 * For each autofixing `workspace/*` rule plus a seed `WorkspaceState` that
 * exercises one of its cascade arms, the harness:
 *
 * 1. Runs `rule.check` and expects at least one `AutofixableFinding`.
 * 2. Invokes `rule.fix(context, finding)` for every autofixable finding.
 * 3. Applies each returned `Operation` intent via `applyOperationIntent`,
 *    mutating the same `WorkspaceState` in place.
 * 4. Rebuilds a fresh `WorkspaceRuleContext` backed by the mutated state
 *    and re-runs `rule.check`.
 * 5. Asserts `rule.check` returns **zero findings** post-apply.
 *
 * The assertion is the "apply(fix) + re-run(rule) === [] from that rule"
 * contract from `contributing/guides/lint-rule-authoring.md` ("Writing `fix`").
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { AutofixableFinding, AutofixingRule, LintFinding } from "../rule.js";
import type { WorkspaceRuleContext } from "../context.js";
import { lockfileValidRule } from "./workspace/lockfile-valid.js";
import { skillsArtifactsCorrectRule } from "./workspace/skills-artifacts-correct.js";
import { skillsIntegrityValidRule } from "./workspace/skills-integrity-valid.js";
import { skillsLockfileAlignedRule } from "./workspace/skills-lockfile-aligned.js";
import {
  applyOperationIntent,
  emptyWorkspaceState,
  type WorkspaceState,
} from "./workspace-fixtures/interpret-ops.js";
import { makeWorkspaceReadModel } from "../../workspace/read-model/service.js";
import { WorkspaceReadModelTest } from "../../workspace/read-model/__fixtures__/test-layer.js";
import { scopeFilesFromWorkspaceState } from "./workspace-fixtures/fixture-state.js";

// -----------------------------------------------------------------------------
// Harness core
// -----------------------------------------------------------------------------

const contextFor = (state: WorkspaceState): Effect.Effect<WorkspaceRuleContext> => {
  const project = scopeFilesFromWorkspaceState(state);
  return Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    return {
      subject: { root: "/tmp/ws", scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(state.existingPaths.has(".axm")),
      displayRoot: "",
    } satisfies WorkspaceRuleContext;
  }).pipe(
    Effect.provide(
      WorkspaceReadModelTest({
        workspaceRoot: "/tmp/ws",
        userHome: "/tmp/user",
        project,
      }),
    ),
    Effect.orDie,
  );
};

const runCheck = (
  rule: AutofixingRule<WorkspaceRuleContext>,
  state: WorkspaceState,
): Effect.Effect<ReadonlyArray<LintFinding>> =>
  Effect.gen(function* () {
    const ctx = yield* contextFor(state);
    return yield* rule.check(ctx);
  });

const applyFixes = (
  rule: AutofixingRule<WorkspaceRuleContext>,
  state: WorkspaceState,
  findings: ReadonlyArray<LintFinding>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const ctx = yield* contextFor(state);
    for (const finding of findings) {
      if (finding.kind !== "autofixable") {
        continue;
      }
      const ops = yield* rule.fix(ctx, finding as AutofixableFinding);
      for (const op of ops) {
        applyOperationIntent(state, op);
      }
    }
  });

const determinism = (
  rule: AutofixingRule<WorkspaceRuleContext>,
  seed: WorkspaceState,
): Effect.Effect<{
  readonly preFindings: ReadonlyArray<LintFinding>;
  readonly postFindings: ReadonlyArray<LintFinding>;
}> =>
  Effect.gen(function* () {
    const preFindings = yield* runCheck(rule, seed);
    yield* applyFixes(rule, seed, preFindings);
    const postFindings = yield* runCheck(rule, seed);
    return { preFindings, postFindings };
  });

// -----------------------------------------------------------------------------
// Seeded state builders
// -----------------------------------------------------------------------------

const CLAUDE_CODE_SKILLS_DIR = ".claude/skills";

const seedDeclaredAgents = (state: WorkspaceState): void => {
  state.settings = {
    agents: ["claude-code"],
    skills: {},
  };
};

/** Seed state for `workspace/lockfile-valid` missing arm: declared skill, no lockfile. */
const seedLockfileMissing = (): WorkspaceState => {
  const state = emptyWorkspaceState();
  state.settings = {
    agents: ["claude-code"],
    skills: {
      reviewer: "@acme/skills/reviewer@1.0.0",
    },
  };
  state.existingPaths.add(".axm");
  state.existingPaths.add(".axm/settings.json");
  state.listings.set(CLAUDE_CODE_SKILLS_DIR, []);
  return state;
};

/**
 * `workspace/lockfile-valid` missing arm with one declaration of every
 * installable type. The missing-arm autofix used to emit install ops for only
 * four of the nine families, so `axm lint --fix` rebuilt a partial lockfile
 * and a second run still reported the same finding.
 */
const seedLockfileMissingEveryType = (): WorkspaceState => {
  const state = emptyWorkspaceState();
  state.settings = {
    agents: ["claude-code"],
    skills: { reviewer: "@acme/skills/reviewer@1.0.0" },
    commands: { deploy: "@acme/commands/deploy@1.0.0" },
    subagents: { critic: "@acme/subagents/critic@1.0.0" },
    mcpServers: { database: "@acme/mcps/database@1.0.0" },
    files: { "house-style": "@acme/files/house-style@1.0.0" },
    rules: { conventions: "@acme/rules/conventions@1.0.0" },
    hooks: { "pre-commit": "@acme/hooks/pre-commit@1.0.0" },
    knowledge: { domain: "@acme/knowledge/domain@1.0.0" },
    packs: { starter: "@acme/packs/starter@1.0.0" },
  };
  state.existingPaths.add(".axm");
  state.existingPaths.add(".axm/settings.json");
  state.listings.set(CLAUDE_CODE_SKILLS_DIR, []);
  return state;
};

/** Seed for `workspace/skills-lockfile-aligned` missing arm. */
const seedSkillMissingFromLockfile = (): WorkspaceState => {
  const state = emptyWorkspaceState();
  state.settings = {
    agents: ["claude-code"],
    skills: { reviewer: "@acme/skills/reviewer@1.0.0" },
  };
  state.lockfile = { lockfileVersion: 3, skills: {} };
  return state;
};

/** Seed for `workspace/skills-lockfile-aligned` orphan arm. */
const seedSkillOrphanInLockfile = (): WorkspaceState => {
  const state = emptyWorkspaceState();
  state.settings = {
    agents: ["claude-code"],
    skills: {},
  };
  state.lockfile = {
    lockfileVersion: 3,
    skills: {
      stale: {
        type: "registry",
        owner: "@acme",
        name: "stale",
        resolvedVersion: "1.0.0",
        integrity: "sha512-stub",
        sourceName: "default",

        publisherBindingId: "hbnd_test",
        agents: ["claude-code"],
        installedAt: "2026-04-21T00:00:00.000Z",
        updatedAt: "2026-04-21T00:00:00.000Z",
        sourceHash: "sha",
      },
    },
  };
  return state;
};

/** Seed for `workspace/skills-integrity-valid`: lock entry, missing canonical src. */
const seedSkillIntegrityMismatch = (): WorkspaceState => {
  const state = emptyWorkspaceState();
  state.settings = {
    agents: ["claude-code"],
    skills: { reviewer: "@acme/skills/reviewer@1.0.0" },
  };
  state.lockfile = {
    lockfileVersion: 3,
    skills: {
      reviewer: {
        type: "registry",
        owner: "@acme",
        name: "reviewer",
        resolvedVersion: "1.0.0",
        integrity: "sha512-stub",
        sourceName: "default",

        publisherBindingId: "hbnd_test",
        agents: ["claude-code"],
        installedAt: "2026-04-21T00:00:00.000Z",
        updatedAt: "2026-04-21T00:00:00.000Z",
        sourceHash: "sha",
      },
    },
  };
  // No install directory on disk.
  return state;
};

/** Seed for `workspace/skills-artifacts-correct` enabled-not-linked. */
const seedEnabledNotLinked = (): WorkspaceState => {
  const state = emptyWorkspaceState();
  state.settings = {
    agents: ["claude-code"],
    skills: { reviewer: "@acme/skills/reviewer@1.0.0" },
  };
  return state;
};

/** Seed for `workspace/skills-artifacts-correct` disabled-but-still-present. */
const seedDisabledStillPresent = (): WorkspaceState => {
  const state = emptyWorkspaceState();
  state.settings = {
    agents: ["claude-code"],
    skills: {
      reviewer: { source: "@acme/skills/reviewer@1.0.0", enabled: false },
    },
  };
  state.existingPaths.add(".claude/skills/reviewer");
  return state;
};

// -----------------------------------------------------------------------------
// Harness specs
// -----------------------------------------------------------------------------

interface HarnessCase {
  readonly label: string;
  readonly rule: AutofixingRule<WorkspaceRuleContext>;
  readonly seed: () => WorkspaceState;
  readonly expectsAdvisoryOnly?: boolean;
}

// Reference seedDeclaredAgents to avoid unused-import diagnostics.
void seedDeclaredAgents;

const cases: ReadonlyArray<HarnessCase> = [
  {
    label: "workspace/lockfile-valid — missing-arm reinstalls declared extensions",
    rule: lockfileValidRule as AutofixingRule<WorkspaceRuleContext>,
    seed: seedLockfileMissing,
  },
  {
    label: "workspace/lockfile-valid — missing arm covers every installable type",
    rule: lockfileValidRule as AutofixingRule<WorkspaceRuleContext>,
    seed: seedLockfileMissingEveryType,
  },
  {
    label: "workspace/skills-lockfile-aligned — missing arm installs the skill",
    rule: skillsLockfileAlignedRule as AutofixingRule<WorkspaceRuleContext>,
    seed: seedSkillMissingFromLockfile,
  },
  {
    label: "workspace/skills-lockfile-aligned — orphan arm uninstalls the lock entry",
    rule: skillsLockfileAlignedRule as AutofixingRule<WorkspaceRuleContext>,
    seed: seedSkillOrphanInLockfile,
  },
  {
    label: "workspace/skills-integrity-valid — reinstalls on missing src",
    rule: skillsIntegrityValidRule as AutofixingRule<WorkspaceRuleContext>,
    seed: seedSkillIntegrityMismatch,
  },
  {
    label: "workspace/skills-artifacts-correct — enable-skill recreates artifacts",
    rule: skillsArtifactsCorrectRule as AutofixingRule<WorkspaceRuleContext>,
    seed: seedEnabledNotLinked,
  },
  {
    label: "workspace/skills-artifacts-correct — disable-skill removes artifacts",
    rule: skillsArtifactsCorrectRule as AutofixingRule<WorkspaceRuleContext>,
    seed: seedDisabledStillPresent,
  },
];

describe("workspace catalog determinism harness", () => {
  for (const c of cases) {
    it.effect(c.label, () =>
      Effect.gen(function* () {
        const state = c.seed();
        const result = yield* determinism(c.rule, state);
        expect(
          result.preFindings.length,
          `seed should surface at least one finding before applying the fix`,
        ).toBeGreaterThan(0);
        if (c.expectsAdvisoryOnly === true) {
          // Advisory arms don't autofix; harness asserts the finding is
          // advisory and post-check still sees it.
          expect(result.postFindings.length).toBeGreaterThan(0);
          return;
        }
        expect(
          result.postFindings,
          `after applying fix, ${c.rule.id} must report zero findings`,
        ).toEqual([]);
      }),
    );
  }
});
