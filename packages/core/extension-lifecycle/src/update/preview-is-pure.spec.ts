import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { countUnitStates, deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import {
  makeLifecycleFixture,
  makeLifecycleRegistry,
  writeLocalHookPackage,
  writeLocalRulePackage,
  type LifecycleFixture,
  type LifecycleRegistry,
} from "../testing.js";
import { applyInstall, installRequest } from "../install/test-helpers.js";
import {
  applyUpdate,
  configuredUpdateRequest,
  expectResolved,
  previewUpdate,
  targetedUpdateRequest,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/update/preview-is-pure",
  title: "Update preview describes the advance without changing any state",
  statement:
    "When update runs in preview mode against a configured extension of any type whose source offers a newer version the recorded intent allows, it shall report the advance it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections; when the selection names nothing the workspace has configured, it shall report that and change nothing; and when the source cannot supply the advance, it shall report the problem and still change nothing.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/update/advances-resolution-within-intent",
    "cli/hooks/update/preview-is-pure",
    "cli/knowledge/update/preview-is-pure",
    "cli/mcps/update/preview-is-pure",
    "cli/packs/update/preview-is-pure",
    "cli/rules/update/preview-is-pure",
    "cli/skills/update/preview-is-pure",
    "cli/subagents/update/preview-is-pure",
  ],
  supersedes: [
    "cli/hooks/update/preview-is-pure",
    "cli/knowledge/update/preview-is-pure",
    "cli/mcps/update/preview-is-pure",
    "cli/packs/update/preview-is-pure",
    "cli/rules/update/preview-is-pure",
    "cli/skills/update/preview-is-pure",
    "cli/subagents/update/preview-is-pure",
  ],
  assumptions: [],
  openQuestions: [],
});

// A previewed update that would replace the accepted publisher binding is
// stated once for every route that can make that acceptance, by
// `cli/publisher-changes-require-interactive-approval` (its "skills update",
// "update targeted at the extension" rows and its typed-Subagent-update
// examples). This file keeps only the purity rule for an ordinary advance.

const installFrom = (source: string, type: InstallableExtensionType) =>
  applyInstall(installRequest({ type, subject: { kind: "source", source } })).pipe(Effect.asVoid);

/** What seeding one row costs the environment: an install, and nothing more. */
type SeedEffect = ReturnType<typeof installFrom>;

interface PreviewRow {
  readonly label: string;
  readonly type: InstallableExtensionType;
  /** The installed name the sweep will find configured. */
  readonly name: string;
  /**
   * Seed the workspace with an accepted entry, then make a newer version
   * available from the same source, so an applying update would advance it.
   */
  readonly seed: (args: {
    readonly workspace: LifecycleFixture;
    readonly registry: LifecycleRegistry;
  }) => SeedEffect;
  /** What must still be true after a preview: the accepted state, unchanged. */
  readonly expectUnadvanced: (workspace: LifecycleFixture) => void;
}

const REVIEW = "code-review";
const RESEARCHER = "researcher";
const COMMIT_STYLE = "commit-style";
const TOOL_AUDIT = "tool-audit";
const PLATFORM = "platform";
const CONTEXT = "context";
const TOOLKIT = "toolkit";

const rows: ReadonlyArray<PreviewRow> = [
  {
    label: "skill",
    type: "skill",
    name: REVIEW,
    seed: ({ workspace, registry }) =>
      Effect.gen(function* () {
        registry.writeSkill(REVIEW, [{ version: "1.0.0", body: "First guidance." }]);
        yield* installFrom(`@acme/skills/${REVIEW}`, "skill");
        expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 1.0.0");
        registry.writeSkill(REVIEW, [
          { version: "2.0.0", body: "Second guidance." },
          { version: "1.0.0", body: "First guidance." },
        ]);
      }),
    expectUnadvanced: (workspace) => {
      expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 1.0.0");
      expect(workspace.readFile(`.claude/skills/${REVIEW}/SKILL.md`)).toContain("First guidance.");
    },
  },
  {
    label: "subagent",
    type: "subagent",
    name: RESEARCHER,
    seed: ({ workspace, registry }) =>
      Effect.gen(function* () {
        registry.writeSubagent(RESEARCHER, [{ version: "1.0.0", body: "Research carefully." }]);
        yield* installFrom(`@acme/subagents/${RESEARCHER}`, "subagent");
        expect(workspace.readFile(`.claude/agents/${RESEARCHER}.md`)).toContain(
          "Research carefully.",
        );
        registry.writeSubagent(RESEARCHER, [
          { version: "2.0.0", body: "Research thoroughly." },
          { version: "1.0.0", body: "Research carefully." },
        ]);
      }),
    expectUnadvanced: (workspace) => {
      expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 1.0.0");
      expect(workspace.readFile(`.claude/agents/${RESEARCHER}.md`)).toContain(
        "Research carefully.",
      );
    },
  },
  {
    label: "rule",
    type: "rule",
    name: COMMIT_STYLE,
    // A rule acquired from a directory: the source revision is a later
    // version written over the same package, so the installed copy is behind.
    seed: ({ workspace }) =>
      Effect.gen(function* () {
        const source = writeLocalRulePackage(workspace.root, { name: COMMIT_STYLE });
        yield* installFrom(source, "rule");
        writeLocalRulePackage(workspace.root, {
          name: COMMIT_STYLE,
          version: "1.1.0",
          description: "The revised commit-style rule.",
        });
      }),
    expectUnadvanced: (workspace) => {
      expect(
        workspace.readFile(`agent_extensions/local/vendor/${COMMIT_STYLE}/rule.json`),
      ).toContain('"version": "1.0.0"');
      expect(workspace.readFile("AGENTS.md")).not.toContain("revised");
    },
  },
  {
    label: "hook",
    type: "hook",
    name: TOOL_AUDIT,
    seed: ({ workspace }) =>
      Effect.gen(function* () {
        const source = writeLocalHookPackage(workspace.root, { name: TOOL_AUDIT });
        yield* installFrom(source, "hook");
        writeLocalHookPackage(workspace.root, {
          name: TOOL_AUDIT,
          version: "1.1.0",
          description: "The revised tool-audit hook.",
        });
      }),
    expectUnadvanced: (workspace) => {
      expect(workspace.readFile(`agent_extensions/local/vendor/${TOOL_AUDIT}/hook.json`)).toContain(
        '"version": "1.0.0"',
      );
    },
  },
  {
    label: "knowledge bundle",
    type: "knowledge",
    name: PLATFORM,
    seed: ({ workspace, registry }) =>
      Effect.gen(function* () {
        registry.writeKnowledge(PLATFORM, [{ version: "1.0.0", body: "First guidance." }]);
        yield* installFrom(`@acme/knowledge/${PLATFORM}`, "knowledge");
        expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 1.0.0");
        registry.writeKnowledge(PLATFORM, [
          { version: "1.0.0", body: "First guidance." },
          { version: "2.0.0", body: "Second guidance." },
        ]);
      }),
    expectUnadvanced: (workspace) => {
      const lock = workspace.readFile("axm-lock.yaml");
      expect(lock).toContain("resolvedVersion: 1.0.0");
      expect(lock).not.toContain("resolvedVersion: 2.0.0");
    },
  },
  {
    label: "MCP server",
    type: "mcp-server",
    name: CONTEXT,
    seed: ({ registry }) =>
      Effect.gen(function* () {
        registry.writeMcp(CONTEXT, [{ version: "1.0.0" }]);
        yield* installFrom(`@acme/mcps/${CONTEXT}`, "mcp-server");
        registry.writeMcp(CONTEXT, [{ version: "1.0.0" }, { version: "2.0.0" }]);
      }),
    expectUnadvanced: (workspace) => {
      const lock = workspace.readFile("axm-lock.yaml");
      expect(lock).toContain("resolvedVersion: 1.0.0");
      expect(lock).not.toContain("2.0.0");
    },
  },
  {
    label: "pack",
    type: "pack",
    name: TOOLKIT,
    // A Pack the workspace desires without an accepted resolution: an
    // applying update would resolve, accept, and realize the whole closure.
    seed: () => Effect.void,
    expectUnadvanced: (workspace) => {
      expect(workspace.readFile("axm-lock.yaml")).not.toContain(TOOLKIT);
      expect(workspace.exists("agent_extensions")).toBe(false);
    },
  },
];

describe("Update preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /**
   * A project workspace with one configured agent and a `file://` Registry as
   * its only source. The pack row declares its Pack up front, because the
   * Pack it previews is one the workspace desires and has never accepted.
   */
  const world = (
    options: { readonly settings?: Readonly<Record<string, unknown>> } = {},
  ): { workspace: LifecycleFixture; registry: LifecycleRegistry } => {
    const registry = makeLifecycleRegistry();
    cleanups.push(registry.cleanup);
    const workspace = makeLifecycleFixture({
      sources: "live",
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        sources: [registry.source],
        ...options.settings,
      },
    });
    cleanups.push(workspace.cleanup);
    return { workspace, registry };
  };

  const worldFor = (row: PreviewRow) =>
    row.type === "pack"
      ? world({ settings: { packs: { [TOOLKIT]: `@acme/packs/${TOOLKIT}` } } })
      : world();

  const publishToolkit = (registry: LifecycleRegistry): void => {
    registry.writeSkill("member-skill", [{ version: "1.0.0", body: "Member guidance." }]);
    registry.writePack(TOOLKIT, [
      { version: "1.0.0", dependencies: { "@acme/skills/member-skill": "^1.0.0" } },
    ]);
  };

  it.effect.each(rows)(
    "a previewed $label update reports the advance and writes nothing",
    (row) => {
      const { workspace, registry } = worldFor(row);
      if (row.type === "pack") publishToolkit(registry);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* row.seed({ workspace, registry });
            const before = workspace.snapshot();

            const outcome = yield* previewUpdate(
              configuredUpdateRequest({ type: row.type, planName: `Update ${row.label}` }),
            );

            const resolution = expectResolved(outcome);
            expect(resolution.mode).toBe("preview");
            expect(deriveOperationOutcome(resolution)).toBe("previewed");
            expect(resolution.units.map((unit) => unit.label)).toEqual(
              expect.arrayContaining([expect.stringContaining(row.name)]),
            );
            expect(resolution.units.every((unit) => unit.state === "ready")).toBe(true);
            expect(countUnitStates(resolution.units).committed).toBe(0);
            expect(workspace.snapshot()).toEqual(before);
            row.expectUnadvanced(workspace);
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(rows)(
    "a previewed $label update whose selection names nothing configured reports that and writes nothing",
    (row) => {
      const { workspace, registry } = worldFor(row);
      if (row.type === "pack") publishToolkit(registry);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* row.seed({ workspace, registry });
            const before = workspace.snapshot();

            const outcome = yield* previewUpdate(
              configuredUpdateRequest({
                type: row.type,
                nameFilters: ["absent-selection"],
                planName: `Update ${row.label}`,
              }),
            );

            expect(outcome._tag).toBe("NothingConfigured");
            expect(workspace.snapshot()).toEqual(before);
            row.expectUnadvanced(workspace);
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "a previewed update of a desired Pack the Registry does not publish reports the problem and writes nothing",
    () => {
      const { workspace } = world({
        settings: { packs: { [TOOLKIT]: `@acme/packs/${TOOLKIT}` } },
      });
      const before = workspace.snapshot();
      return workspace
        .provide(
          Effect.gen(function* () {
            const resolution = expectResolved(
              yield* previewUpdate(
                configuredUpdateRequest({ type: "pack", planName: "Update pack" }),
              ),
            );

            // The Pack cannot be planned, so the preview reports the planning
            // error against the Pack rather than proposing work.
            expect(resolution.units).toEqual([
              expect.objectContaining({ id: `pack:${TOOLKIT}:planning-error`, label: TOOLKIT }),
            ]);
            expect(countUnitStates(resolution.units).committed).toBe(0);
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.readFile("axm-lock.yaml")).not.toContain(TOOLKIT);
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "the previewed advance is real: applying a targeted update afterwards advances what the preview left alone",
    () => {
      const { workspace, registry } = world();
      registry.writeSkill(REVIEW, [{ version: "1.0.0", body: "First guidance." }]);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* installFrom(`@acme/skills/${REVIEW}`, "skill");
            registry.writeSkill(REVIEW, [
              { version: "1.1.0", body: "Second guidance." },
              { version: "1.0.0", body: "First guidance." },
            ]);
            const before = workspace.snapshot();

            const previewed = expectResolved(
              yield* previewUpdate(targetedUpdateRequest({ source: `@acme/skills/${REVIEW}` })),
            );

            expect(deriveOperationOutcome(previewed)).toBe("previewed");
            expect(countUnitStates(previewed.units)).toMatchObject({ total: 1, committed: 0 });
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 1.0.0");
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);

            const applied = expectResolved(
              yield* applyUpdate(targetedUpdateRequest({ source: `@acme/skills/${REVIEW}` })),
            );

            expect(deriveOperationOutcome(applied)).toBe("applied");
            expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 1.1.0");
            expect(workspace.readFile(`.claude/skills/${REVIEW}/SKILL.md`)).toContain(
              "Second guidance.",
            );
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each([
    {
      label: "skill",
      type: "skill",
      projection: `.claude/skills/${REVIEW}/SKILL.md`,
      advanced: "Second guidance.",
    },
    {
      label: "subagent",
      type: "subagent",
      projection: `.claude/agents/${RESEARCHER}.md`,
      advanced: "Research thoroughly.",
    },
  ] as const)(
    "the previewed $label sweep is real: applying it afterwards advances what the preview left alone",
    ({ type, projection, advanced }) => {
      const row = rows.find((candidate) => candidate.type === type);
      if (row === undefined) throw new Error(`No preview row for ${type}`);
      const { workspace, registry } = world();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* row.seed({ workspace, registry });
            const before = workspace.snapshot();

            const previewed = expectResolved(
              yield* previewUpdate(configuredUpdateRequest({ type, planName: `Update ${type}` })),
            );

            expect(deriveOperationOutcome(previewed)).toBe("previewed");
            expect(workspace.snapshot()).toEqual(before);

            const applied = expectResolved(
              yield* applyUpdate(configuredUpdateRequest({ type, planName: `Update ${type}` })),
            );

            expect(deriveOperationOutcome(applied)).toBe("applied");
            expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 2.0.0");
            expect(workspace.readFile(projection)).toContain(advanced);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
