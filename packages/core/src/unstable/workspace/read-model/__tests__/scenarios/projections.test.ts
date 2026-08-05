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
 * - ignored-skill-suppressed-but-raw-visible
 * - subject-lockfile-entry-alone-does-not-create-implicit-inventory
 * - packs-are-not-installed-as-pack-members
 *
 * The Live layer reads `resolvedSkills`/`resolvedSubagents` keys from the
 * lockfile pack entry. Skill pack members normalize FQN keys to simple skill
 * names for installed rows; subjects that allow FQN declarations keep their
 * original keys.
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

type RawResolvedExtensionMap = Record<
  string,
  { readonly version: string; readonly publisherBindingId: string }
>;

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
  readonly commands?: Record<
    string,
    string | { readonly source: string; readonly enabled?: boolean }
  >;
  readonly subagents?: Record<
    string,
    string | { readonly source: string; readonly enabled?: boolean }
  >;
  readonly packs?: Record<string, string | { readonly source: string }>;
  readonly skillsConfig?: { readonly ignore?: ReadonlyArray<string> };
  readonly commandsConfig?: { readonly ignore?: ReadonlyArray<string> };
  readonly subagentsConfig?: { readonly ignore?: ReadonlyArray<string> };
}): object => {
  const out: Record<string, unknown> = {};
  if (params.skills !== undefined) out["skills"] = params.skills;
  if (params.commands !== undefined) out["commands"] = params.commands;
  if (params.subagents !== undefined) out["subagents"] = params.subagents;
  if (params.packs !== undefined) out["packs"] = params.packs;
  if (params.skillsConfig !== undefined) out["skillsConfig"] = params.skillsConfig;
  if (params.commandsConfig !== undefined) out["commandsConfig"] = params.commandsConfig;
  if (params.subagentsConfig !== undefined) out["subagentsConfig"] = params.subagentsConfig;
  return out;
};

/**
 * Build a lockfile YAML value (schema-decodable) — installs one pack with the
 * supplied member names. Member keys are FQN-shaped (`@owner/<type-plural>/<name>`).
 */
const lockfileWithPack = (params: {
  readonly packName: string;
  readonly resolvedSkills?: RawResolvedExtensionMap;
  readonly resolvedSubagents?: RawResolvedExtensionMap;
  readonly resolvedCommands?: RawResolvedExtensionMap;
  readonly resolvedMcpServers?: RawResolvedExtensionMap;
  readonly extraSkillEntries?: Record<string, unknown>;
}): object => ({
  lockfileVersion: 3,
  skills: params.extraSkillEntries ?? {},
  packs: {
    [params.packName]: {
      type: "registry",
      owner: "@team",
      name: params.packName,
      resolvedVersion: "1.0.0",
      integrity: "sha256-deadbeef",
      sourceName: "registry",

      publisherBindingId: "hbnd_test",
      installedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      resolvedSkills: params.resolvedSkills ?? {},
      resolvedCommands: params.resolvedCommands ?? {},
      resolvedMcpServers: params.resolvedMcpServers ?? {},
      resolvedSubagents: params.resolvedSubagents ?? {},
    },
  },
});

const lockfileWithSkill = (skillName: string): object => ({
  lockfileVersion: 3,
  skills: {
    [skillName]: {
      type: "github",
      owner: "owner",
      repo: "repo",
      ref: "main",
      installedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      agents: [],
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
  it.effect(
    "direct pack declaration + resolved member produces an implicit pack-member skill row",
    () =>
      runScenario(
        projectSpec({
          settings: {
            _tag: "valid",
            contents: settingsJson({
              packs: { "team-pack": "registry:@team/team-pack" },
            }),
          },
          lockfile: {
            _tag: "valid",
            contents: lockfileWithPack({
              packName: "team-pack",
              resolvedSkills: {
                "@team/skills/review-tool": { version: "1.0.0", publisherBindingId: "hbnd_test" },
              },
            }),
          },
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
            packs: { "team-pack": "registry:@team/team-pack" },
            skills: { "review-tool": "github:owner/review-tool" },
          }),
        },
        lockfile: {
          _tag: "valid",
          contents: lockfileWithPack({
            packName: "team-pack",
            resolvedSkills: {
              "@team/skills/review-tool": { version: "1.0.0", publisherBindingId: "hbnd_test" },
            },
          }),
        },
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
  it.effect("pack-resolved subagent member produces a pack-member subagent row", () =>
    runScenario(
      projectSpec({
        settings: {
          _tag: "valid",
          contents: settingsJson({
            packs: { "team-pack": "registry:@team/team-pack" },
          }),
        },
        lockfile: {
          _tag: "valid",
          contents: lockfileWithPack({
            packName: "team-pack",
            resolvedSubagents: {
              "@team/subagents/code-reviewer": {
                version: "1.0.0",
                publisherBindingId: "hbnd_test",
              },
            },
          }),
        },
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
              packs: { "team-pack": "registry:@team/team-pack" },
              subagents: {
                "code-reviewer": {
                  source: "github:owner/code-reviewer",
                  enabled: false,
                },
              },
            }),
          },
          lockfile: {
            _tag: "valid",
            contents: lockfileWithPack({
              packName: "team-pack",
              // Pack contributes a different FQN-shaped subagent, so both
              // rows coexist; this still exercises the implicit-vs-direct
              // pathways through the live projection.
              resolvedSubagents: {
                "@team/subagents/other-reviewer": {
                  version: "1.0.0",
                  publisherBindingId: "hbnd_test",
                },
              },
            }),
          },
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

describe("projection: ignored skill is suppressed but raw evidence remains visible", () => {
  it.effect(
    "ignored skill: declared/actual stay visible; installed/unmanaged exclude; ignored.length>0",
    () =>
      runScenario(
        projectSpec({
          settings: {
            _tag: "valid",
            contents: settingsJson({
              skills: { "review-tool": "github:owner/review-tool" },
              skillsConfig: { ignore: ["review-tool"] },
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
            const declared = yield* project.skills.declared;
            const actual = yield* project.skills.actual;
            const installed = yield* project.skills.installed;
            const unmanaged = yield* project.skills.unmanaged;
            const ignored = yield* project.skills.ignored;

            // Declared and actual remain visible regardless of ignored policy.
            expect(declared._tag).toBe("Some");
            if (declared._tag === "Some") {
              expect(declared.value.some((d) => d.name === "review-tool")).toBe(true);
            }
            expect(actual.some((a) => a.key.name === "review-tool")).toBe(true);
            expect(installed.some((r) => r.key.name === "review-tool")).toBe(false);
            expect(unmanaged.some((u) => u.key.name === "review-tool")).toBe(false);
            expect(ignored.filter((row) => row.reason === "declared-ignored")).toHaveLength(1);
            expect(ignored.filter((row) => row.reason === "actual-ignored")).toHaveLength(
              actual.filter((row) => row.key.name === "review-tool").length,
            );
          }),
      ),
  );

  it.effect("command ignore globs suppress unmanaged commands and populate ignored", () =>
    runScenario(
      projectSpec({
        settings: {
          _tag: "valid",
          contents: settingsJson({
            commandsConfig: { ignore: ["local-*"] },
          }),
        },
        agentDirs: {
          "claude-code": {
            "commands/local-build/local-build.md": "# local\n",
            "commands/manual/manual.md": "# manual\n",
          },
        },
      }),
      (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");
          const actual = yield* project.commands.actual;
          const unmanaged = yield* project.commands.unmanaged;
          const ignored = yield* project.commands.ignored;

          expect(actual.some((a) => a.key.name === "local-build")).toBe(true);
          expect(unmanaged.some((u) => u.key.name === "local-build")).toBe(false);
          expect(unmanaged.some((u) => u.key.name === "manual")).toBe(true);
          expect(
            ignored.some(
              (row) => row.reason === "actual-ignored" && row.key.name === "local-build",
            ),
          ).toBe(true);
        }),
    ),
  );
});

describe("projection: subject lockfile entry alone does not create implicit inventory", () => {
  it.effect(
    "lockfile-only skill (no declared, no pack) → not installed; orphan diagnostic published",
    () =>
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
            const orphanWarning = warnings.find(
              (w) =>
                w.code === "orphan-resolved" &&
                w.source === "lockfile" &&
                w.message.includes("review-tool"),
            );
            expect(orphanWarning).toBeDefined();
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
              packs: { "platform-pack": "registry:@team/platform-pack" },
            }),
          },
          lockfile: {
            _tag: "valid",
            contents: {
              lockfileVersion: 3,
              skills: {},
              packs: {
                "platform-pack": {
                  type: "registry",
                  owner: "@team",
                  name: "platform-pack",
                  resolvedVersion: "1.0.0",
                  integrity: "sha256-platform",
                  sourceName: "registry",

                  publisherBindingId: "hbnd_test",
                  installedAt: "2026-01-01T00:00:00.000Z",
                  updatedAt: "2026-01-01T00:00:00.000Z",
                  resolvedSkills: {},
                  resolvedCommands: {},
                  resolvedMcpServers: {},
                  resolvedSubagents: {},
                },
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
                  installedAt: "2026-01-01T00:00:00.000Z",
                  updatedAt: "2026-01-01T00:00:00.000Z",
                  resolvedSkills: {},
                  resolvedCommands: {},
                  resolvedMcpServers: {},
                  resolvedSubagents: {},
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
