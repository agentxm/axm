/**
 * Scenario: Resilient projections degrade through diagnostics.
 *
 * Spec requirement coverage — every named scenario in the projection family:
 *
 * - installed-skills-are-managed-inventory
 * - actual-only-skills-remain-visible-outside-installed
 * - pack-provided-skill-is-implicit-installed-inventory
 * - direct-skill-declaration-wins-over-pack-membership
 * - actual-only-pack-does-not-install-member-skills
 * - pack-provided-subagent-is-implicit
 * - direct-subagent-wins-over-pack-membership (with disabled)
 * - disabled-direct-skill-still-claims-actual
 * - subject-lockfile-entry-alone-does-not-create-implicit-inventory
 * - packs-are-not-installed-as-pack-members
 *
 * Pack membership and member activation are decided by the desired-state
 * graph; the read model shapes the member rows it is handed. Accepted-
 * resolution rows never supply membership or create desired inventory.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import type { FixtureSpec } from "../../__fixtures__/builder.js";
import type { PackMemberBinding } from "../../extensions/projection.js";
import {
  expectFirst,
  runScenario,
  SCENARIO_USER_HOME,
  SCENARIO_WORKSPACE_ROOT,
} from "../../__fixtures__/scenario-harness.js";

// ---------------------------------------------------------------------------
// Spec helpers
// ---------------------------------------------------------------------------

const projectSpec = (project: NonNullable<FixtureSpec["project"]>): FixtureSpec => ({
  workspaceRoot: SCENARIO_WORKSPACE_ROOT,
  userHome: SCENARIO_USER_HOME,
  project,
});

/**
 * Build a settings JSON value (schema-decodable) given declarations. Skill /
 * subagent / pack maps accept simple string sources or `{ source, enabled }`.
 */
const settingsJson = (params: {
  readonly skills?: Record<
    string,
    string | { readonly source: string; readonly enabled?: boolean }
  >;
  readonly subagents?: Record<
    string,
    string | { readonly source: string; readonly enabled?: boolean }
  >;
  readonly packs?: Record<string, string | { readonly source: string }>;
}): object => {
  const out: Record<string, unknown> = {};
  if (params.skills !== undefined) out["skills"] = params.skills;
  if (params.subagents !== undefined) out["subagents"] = params.subagents;
  if (params.packs !== undefined) out["packs"] = params.packs;
  return out;
};

const authoredPackFiles = (
  packName: string,
  dependencies: Readonly<Record<string, string>>,
): Record<string, string> => ({
  [`@team/packs/${packName}/pack.json`]: JSON.stringify({
    owner: "@team",
    type: "pack",
    name: packName,
    version: "1.0.0",
    dependencies,
  }),
});

/** A member as the desired-state graph would bind it to an installed pack. */
const packMemberBinding = (name: string, pack: string, enabled = true): PackMemberBinding => ({
  name: decodeExtensionNameSync(name),
  pack: { key: { scope: "project", type: "pack", name: decodeExtensionNameSync(pack) } },
  enabled,
});

const lockfileWithSkill = (skillName: string): object => ({
  lockfileVersion: 8,
  skills: {
    [skillName]: {
      source: {
        type: "git",
        url: "https://github.com/owner/repo.git",
        revision: "main",
      },
      identity: { owner: "@owner", name: skillName },
      resolved: { commit: "commit-main", tree: "tree-main" },
      treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
    },
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("projection: installed skills are managed inventory", () => {
  it.effect("declared skill becomes installed; actual-only skill does not", () =>
    runScenario(
      projectSpec({
        settings: {
          _tag: "valid",
          contents: settingsJson({
            skills: { "managed-tool": "github:owner/repo" },
          }),
        },
        agentDirs: {
          "claude-code": {
            "skills/legacy-tool/SKILL.md": "# legacy\n",
          },
        },
      }),
      (ctx) =>
        Effect.gen(function* () {
          const installed = yield* ctx.scope("project").skills.installed;
          const names = installed.map((r) => r.key.name);
          expect(names).toContain("managed-tool");
          expect(names).not.toContain("legacy-tool");
        }),
    ),
  );
});

describe("projection: actual-only skills remain visible outside installed", () => {
  it.effect("legacy-tool is in actual + unmanaged but not installed", () =>
    runScenario(
      projectSpec({
        agentDirs: {
          "claude-code": {
            "skills/legacy-tool/SKILL.md": "# legacy\n",
          },
        },
      }),
      (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");
          const actual = yield* project.skills.actual;
          const installed = yield* project.skills.installed;
          const unmanaged = yield* project.skills.unmanaged;

          expect(actual.some((a) => a.key.name === "legacy-tool")).toBe(true);
          expect(installed.some((r) => r.key.name === "legacy-tool")).toBe(false);
          expect(unmanaged.some((u) => u.key.name === "legacy-tool")).toBe(true);
        }),
    ),
  );
});

describe("projection: pack-provided skill is implicit installed inventory", () => {
  it.effect("a bound pack member produces a pack-member skill row, never a direct one", () =>
    runScenario(
      projectSpec({
        settings: {
          _tag: "valid",
          contents: settingsJson({
            packs: { "team-pack": "workspace" },
          }),
        },
        axmExtensions: authoredPackFiles("team-pack", {
          "@team/skills/review-tool": "1.0.0",
        }),
      }),
      (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");
          expect(yield* project.skills.installed).toHaveLength(0);
          const memberRows = yield* project.skills.packMemberRows([
            packMemberBinding("review-tool", "team-pack"),
          ]);
          expect(memberRows).toHaveLength(1);
          const row = expectFirst(memberRows);
          expect(row.key.name).toBe("review-tool");
          expect(row.installationOrigin._tag).toBe("pack-member");
          expect(row.activation).toBe("enabled");
        }),
    ),
  );
});

describe("projection: direct skill declaration wins over pack membership", () => {
  it.effect("direct row wins when a pack-member FQN normalizes to the same skill name", () =>
    runScenario(
      projectSpec({
        settings: {
          _tag: "valid",
          contents: settingsJson({
            packs: { "team-pack": "workspace" },
            skills: { "review-tool": "github:owner/review-tool" },
          }),
        },
        axmExtensions: authoredPackFiles("team-pack", {
          "@team/skills/review-tool": "1.0.0",
        }),
      }),
      (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");
          const installed = yield* project.skills.installed;
          const rows = installed.filter((r) => r.key.name === "review-tool");
          const row = expectFirst(rows);
          expect(rows).toHaveLength(1);
          expect(row.installationOrigin._tag).toBe("direct");
          const memberRows = yield* project.skills.packMemberRows([
            packMemberBinding("review-tool", "team-pack"),
          ]);
          expect(memberRows).toHaveLength(0);
        }),
    ),
  );
});

describe("projection: actual-only pack does not install member skills", () => {
  it.effect("team-pack as actual-only + actual review-tool → no installed row for either", () =>
    runScenario(
      projectSpec({
        axmExtensions: {
          "@team/packs/team-pack/src/package.json": "{}",
        },
        agentDirs: {
          "claude-code": {
            "skills/review-tool/SKILL.md": "# review\n",
          },
        },
      }),
      (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");
          const installedPacks = yield* project.packs.installed;
          const installedSkills = yield* project.skills.installed;
          // Actual-only pack is not installed.
          expect(installedPacks).toHaveLength(0);
          // No implicit skill row for review-tool.
          expect(installedSkills.some((r) => r.key.name === "review-tool")).toBe(false);
        }),
    ),
  );
});

describe("projection: pack-provided subagent is implicit installed inventory", () => {
  it.effect("authored subagent member produces a pack-member subagent row", () =>
    runScenario(
      projectSpec({
        settings: {
          _tag: "valid",
          contents: settingsJson({
            packs: { "team-pack": "workspace" },
          }),
        },
        axmExtensions: authoredPackFiles("team-pack", {
          "@team/subagents/code-reviewer": "1.0.0",
        }),
      }),
      (ctx) =>
        Effect.gen(function* () {
          const memberRows = yield* ctx
            .scope("project")
            .subagents.packMemberRows([packMemberBinding("code-reviewer", "team-pack")]);
          expect(memberRows).toHaveLength(1);
          expect(memberRows[0]?.key.name).toBe("code-reviewer");
          expect(memberRows[0]?.installationOrigin._tag).toBe("pack-member");
        }),
    ),
  );
});

describe("projection: direct subagent declaration wins (disabled) over pack membership", () => {
  // Same FQN-vs-simple-name reality as the skill scenario above: direct
  // settings declarations use simple names (`code-reviewer`), pack-member
  // resolved subagents are FQN keys. The shared projection helper's
  // direct-over-pack precedence is unit-tested in
  // `__tests__/projection.test.ts`. Here we assert what the live
  // composition exposes: the disabled direct subagent appears as a
  // `direct` row with `disabled` activation.
  it.effect("disabled direct subagent: installed `direct` + activation `disabled`", () =>
    runScenario(
      projectSpec({
        settings: {
          _tag: "valid",
          contents: settingsJson({
            packs: { "team-pack": "workspace" },
            subagents: {
              "code-reviewer": {
                source: "github:owner/code-reviewer",
                enabled: false,
              },
            },
          }),
        },
        axmExtensions: authoredPackFiles("team-pack", {
          "@team/subagents/other-reviewer": "1.0.0",
        }),
      }),
      (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");
          const installed = yield* project.subagents.installed;
          const reviewer = expectFirst(
            installed.filter((r) => r.key.name === "code-reviewer"),
            "expected installed row for code-reviewer",
          );
          expect(reviewer.installationOrigin._tag).toBe("direct");
          expect(reviewer.activation).toBe("disabled");
        }),
    ),
  );
});

describe("projection: disabled direct skill still claims actual materialization", () => {
  it.effect("disabled direct skill is installed (disabled) and excluded from unmanaged", () =>
    runScenario(
      projectSpec({
        settings: {
          _tag: "valid",
          contents: settingsJson({
            skills: {
              "review-tool": {
                source: "github:owner/review-tool",
                enabled: false,
              },
            },
          }),
        },
        agentDirs: {
          "claude-code": {
            "skills/review-tool/SKILL.md": "# review\n",
          },
        },
      }),
      (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");
          const installed = yield* project.skills.installed;
          const unmanaged = yield* project.skills.unmanaged;

          const row = expectFirst(
            installed.filter((r) => r.key.name === "review-tool"),
            "expected installed row for review-tool",
          );
          expect(row.activation).toBe("disabled");
          expect(unmanaged.some((u) => u.key.name === "review-tool")).toBe(false);
        }),
    ),
  );
});

describe("projection: subject lockfile entry alone does not create implicit inventory", () => {
  it.effect("lockfile-only skill is not installed", () =>
    runScenario(
      projectSpec({
        settings: {
          _tag: "valid",
          contents: settingsJson({}),
        },
        lockfile: {
          _tag: "valid",
          contents: lockfileWithSkill("review-tool"),
        },
      }),
      (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");
          const installed = yield* project.skills.installed;
          expect(installed.some((r) => r.key.name === "review-tool")).toBe(false);
          expect(yield* project.skills.packMemberRows([])).toHaveLength(0);
        }),
    ),
  );
});

describe("projection: packs are not installed as pack members", () => {
  it.effect(
    "platform-pack declared, lockfile mentions nested-pack-like reference → nested-pack is not installed via pack-member",
    () =>
      // The pack subject shapes no member rows, so a pack can never appear in
      // `packs.installed` via a pack-member origin. Verified by construction;
      // we exercise it here via a real lockfile with two packs.
      runScenario(
        projectSpec({
          settings: {
            _tag: "valid",
            contents: settingsJson({
              packs: { "platform-pack": "workspace" },
            }),
          },
          axmExtensions: authoredPackFiles("platform-pack", {}),
          lockfile: {
            _tag: "valid",
            contents: {
              lockfileVersion: 8,
              skills: {},
              packs: {
                // nested-pack is in the lockfile but not declared in settings;
                // it must not appear in `packs.installed` as a pack member.
                "nested-pack": {
                  source: { type: "registry", url: "https://registry.agentxm.ai" },
                  identity: { owner: "@team", name: "nested-pack" },
                  resolved: {
                    version: "1.0.0",
                    integrity: "sha256-nested",
                    publisherBindingId: "hbnd_test",
                  },
                  manifestVersion: "1.0.0",
                  manifestContentIdentity: "nested-content",
                  members: [],
                  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
                },
              },
            },
          },
        }),
        (ctx) =>
          Effect.gen(function* () {
            const installed = yield* ctx.scope("project").packs.installed;
            const nested = installed.find((r) => r.key.name === "nested-pack");
            // nested-pack is in the lockfile only, not declared. It is never
            // installed as a pack-member.
            expect(nested).toBeUndefined();
            const platform = installed.find((r) => r.key.name === "platform-pack");
            expect(platform).toBeDefined();
            expect(platform?.installationOrigin._tag).toBe("direct");
          }),
      ),
  );
});
