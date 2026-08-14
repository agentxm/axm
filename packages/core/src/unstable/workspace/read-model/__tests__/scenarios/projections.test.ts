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
 * Pack membership comes only from the authored manifest. Accepted-resolution
 * rows never supply membership or create desired inventory.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { FixtureSpec } from "../../__fixtures__/builder.js";
import {
  expectFirst,
  runScenario,
  SCENARIO_USER_HOME,
  SCENARIO_WORKSPACE_ROOT,
} from "./_harness.js";

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

const lockfileWithSkill = (skillName: string): object => ({
  lockfileVersion: 4,
  skills: {
    [skillName]: {
      type: "github",
      owner: "owner",
      repo: "repo",
      ref: "main",
      resolvedCommit: "commit-main",
      resolvedTree: "tree-main",
      contentIdentity: "content-main",
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
  it.effect("authored pack membership produces an implicit pack-member skill row", () =>
    runScenario(
      projectSpec({
        settings: {
          _tag: "valid",
          contents: settingsJson({
            packs: { "team-pack": "workspace:@team/packs/team-pack" },
          }),
        },
        axmExtensions: authoredPackFiles("team-pack", {
          "@team/skills/review-tool": "1.0.0",
        }),
      }),
      (ctx) =>
        Effect.gen(function* () {
          const installed = yield* ctx.scope("project").skills.installed;
          const memberRows = installed.filter((r) => r.installationOrigin._tag === "pack-member");
          expect(memberRows).toHaveLength(1);
          const row = expectFirst(memberRows);
          expect(row.key.name).toBe("review-tool");
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
            packs: { "team-pack": "workspace:@team/packs/team-pack" },
            skills: { "review-tool": "github:owner/review-tool" },
          }),
        },
        axmExtensions: authoredPackFiles("team-pack", {
          "@team/skills/review-tool": "1.0.0",
        }),
      }),
      (ctx) =>
        Effect.gen(function* () {
          const installed = yield* ctx.scope("project").skills.installed;
          const rows = installed.filter((r) => r.key.name === "review-tool");
          const row = expectFirst(rows);
          expect(rows).toHaveLength(1);
          expect(row.installationOrigin._tag).toBe("direct");
          expect(row.providingPacks).toHaveLength(1);
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
            packs: { "team-pack": "workspace:@team/packs/team-pack" },
          }),
        },
        axmExtensions: authoredPackFiles("team-pack", {
          "@team/subagents/code-reviewer": "1.0.0",
        }),
      }),
      (ctx) =>
        Effect.gen(function* () {
          const installed = yield* ctx.scope("project").subagents.installed;
          const memberRows = installed.filter((r) => r.installationOrigin._tag === "pack-member");
          expect(memberRows).toHaveLength(1);
          expect(memberRows[0]?.key.name).toBe("code-reviewer");
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
  // `direct` row with `disabled` activation, excluded from active.
  it.effect(
    "disabled direct subagent: installed `direct` + activation `disabled`, excluded from active",
    () =>
      runScenario(
        projectSpec({
          settings: {
            _tag: "valid",
            contents: settingsJson({
              packs: { "team-pack": "workspace:@team/packs/team-pack" },
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
            const active = yield* project.subagents.active;
            const reviewer = expectFirst(
              installed.filter((r) => r.key.name === "code-reviewer"),
              "expected installed row for code-reviewer",
            );
            expect(reviewer.installationOrigin._tag).toBe("direct");
            expect(reviewer.activation).toBe("disabled");
            expect(active.some((a) => a.key.name === "code-reviewer")).toBe(false);
          }),
      ),
  );
});

describe("projection: disabled direct skill still claims actual materialization", () => {
  it.effect(
    "disabled direct skill is installed (disabled), excluded from active and from unmanaged",
    () =>
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
            const active = yield* project.skills.active;
            const unmanaged = yield* project.skills.unmanaged;

            const row = expectFirst(
              installed.filter((r) => r.key.name === "review-tool"),
              "expected installed row for review-tool",
            );
            expect(row.activation).toBe("disabled");
            expect(active.some((a) => a.key.name === "review-tool")).toBe(false);
            expect(unmanaged.some((u) => u.key.name === "review-tool")).toBe(false);
          }),
      ),
  );
});

describe("projection: subject lockfile entry alone does not create implicit inventory", () => {
  it.effect("lockfile-only skill is not installed and is reported as an orphan fact", () =>
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
          const warnings = yield* project.diagnostics;
          const warning = warnings.find((item) => item.message.includes("review-tool"));
          expect(warning).toMatchObject({ source: "lockfile", code: "orphan-resolved" });
          expect(warning?.message).not.toContain("axm ");
        }),
    ),
  );
});

describe("projection: packs are not installed as pack members", () => {
  it.effect(
    "platform-pack declared, lockfile mentions nested-pack-like reference → nested-pack is not installed via pack-member",
    () =>
      // The pack subject's own `installed` projection passes an empty
      // installed-pack set into the projection helper, so a pack can never
      // appear in `packs.installed` via a pack-member origin. Verified by
      // construction; we exercise it here via a real lockfile with two packs.
      runScenario(
        projectSpec({
          settings: {
            _tag: "valid",
            contents: settingsJson({
              packs: { "platform-pack": "workspace:@team/packs/platform-pack" },
            }),
          },
          axmExtensions: authoredPackFiles("platform-pack", {}),
          lockfile: {
            _tag: "valid",
            contents: {
              lockfileVersion: 4,
              skills: {},
              packs: {
                // nested-pack is in the lockfile but not declared in settings;
                // it must not appear in `packs.installed` as a pack member.
                "nested-pack": {
                  type: "registry",
                  owner: "@team",
                  name: "nested-pack",
                  resolvedVersion: "1.0.0",
                  integrity: "sha256-nested",
                  sourceName: "registry",
                  publisherBindingId: "hbnd_test",
                  manifestContentIdentity: "nested-content",
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
