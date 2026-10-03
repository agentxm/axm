import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as Effect from "effect/Effect";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Ref from "effect/Ref";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { writeLocalSubagentPackage } from "../testing/local-packages.js";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { SyncWorkspace } from "./index.js";
import { syncRequest } from "./testing.js";
import {
  countUnitStates,
  deriveOperationOutcome,
  previewPlanExecution,
  operationNativeLocations,
} from "@agentxm/workspace-kernel/operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  previewSync,
  writeLocalSkillPackage,
  writeAuthoredKnowledge,
  writeAuthoredRule,
  type SyncFixture,
} from "../testing/sync-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preview-is-pure",
  title: "Sync preview describes required changes without applying them",
  statement:
    "When sync runs in preview mode against a workspace whose managed state has drifted from desired state, it shall report the reconciliation it would apply with a previewed outcome, including the physical native ownership units, their configured consumers, aliases and proposed changes before first acquisition when source content is known, and shall not change settings, the lockfile, canonical content, or agent projections. Combining dependent work into one closure shall preserve those native unit details without multiplying shared physical units. Applying a prepared reconciliation under changed captured native routing inputs shall refuse the stale candidate without writes and require a fresh proposal for the new locations.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/sync/realizes-desired-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

// Route flag grammar (`--preview` accepted, `--yes` unrecognized) is owned by
// cli/preview-uses-the-canonical-flag and
// cli/confirmation-flags-have-a-supported-purpose, which sweep every route
// from the command-route allocation. A convergence check (`--fail-on-change`)
// is this same preview with the divergence flag the adapter adds afterwards,
// so that it too writes nothing is witnessed across process boundaries by
// cli/sync/check-reports-convergence.

const SKILL = "code-review";
const PROJECTION = `.claude/skills/${SKILL}`;

describe("Sync preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const fixture = (settings: Readonly<Record<string, unknown>> = {}): SyncFixture => {
    const workspace = makeSyncFixture({
      settings: { owner: "@acme", agents: ["claude-code"], ...settings },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  it.effect(
    "reports native Subagent units before first acquisition from known source content",
    () => {
      const workspace = fixture({
        agents: ["claude-code", "codex"],
        subagents: { reviewer: "./vendor/reviewer" },
      });
      writeLocalSubagentPackage(workspace.root, { name: "reviewer" });
      return workspace
        .provide(
          Effect.gen(function* () {
            const before = workspace.snapshot();
            const resolution = expectResolved(yield* previewSync());
            const proposed = operationNativeLocations(resolution);
            expect(proposed.map((unit) => unit.address.path).sort()).toEqual(
              [
                nodePath.join(workspace.root, ".claude/agents/reviewer.md"),
                nodePath.join(workspace.root, ".codex/agents/reviewer.toml"),
              ].sort(),
            );
            expect(
              proposed.every(
                (unit) =>
                  unit.ownership === "absent" &&
                  unit.state === "created" &&
                  unit.proof === undefined,
              ),
            ).toBe(true);
            expect(proposed.flatMap((unit) => unit.configuredConsumers).sort()).toEqual([
              "claude-code",
              "codex",
            ]);
            expect(workspace.snapshot()).toEqual(before);
            const applied = expectResolved(yield* applySync());
            expect(
              operationNativeLocations(applied)
                .map((unit) => unit.address.path)
                .sort(),
            ).toEqual(proposed.map((unit) => unit.address.path).sort());
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("describes inline MCP native units and consumers without applying them", () => {
    const workspace = fixture({
      agents: ["claude-code", "cursor"],
      mcpServers: {
        demo: { connection: { transport: "streamable-http", url: "https://example.test/mcp" } },
      },
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();
          const resolution = expectResolved(yield* previewSync());
          const native = operationNativeLocations(resolution);
          expect(native).toHaveLength(2);
          expect(native.map((unit) => unit.address)).toEqual(
            expect.arrayContaining([
              {
                kind: "key-path",
                path: `${workspace.root}/.mcp.json`,
                keys: ["mcpServers", "demo"],
              },
              {
                kind: "key-path",
                path: `${workspace.root}/.cursor/mcp.json`,
                keys: ["mcpServers", "demo"],
              },
            ]),
          );
          expect(native.flatMap((unit) => unit.configuredConsumers)).toEqual(
            expect.arrayContaining(["claude-code", "cursor"]),
          );
          expect(
            native.every((unit) => unit.state === "created" && unit.ownership === "absent"),
          ).toBe(true);
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("describes the Knowledge region required by a stale discovery preview", () => {
    const workspace = fixture({
      agents: ["codex"],
      knowledge: { alpha: "workspace" },
      instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
    });
    writeAuthoredKnowledge(workspace.root, "alpha", "Original description.");
    return workspace
      .provide(
        Effect.gen(function* () {
          const initial = expectResolved(yield* applySync());
          expect(deriveOperationOutcome(initial), JSON.stringify(initial)).toBe("applied");
          writeAuthoredKnowledge(workspace.root, "alpha", "Changed description.");
          const before = workspace.snapshot();
          const resolution = expectResolved(yield* previewSync());
          expect(operationNativeLocations(resolution)).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                address: {
                  kind: "region",
                  path: `${workspace.root}/AGENTS.md`,
                  region: "knowledge",
                },
                configuredConsumers: ["codex"],
                state: "updated",
              }),
            ]),
          );
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reports one MCP key with both consumers and aliases for a shared file", () => {
    const workspace = fixture({
      agents: ["claude-code", "cursor"],
      mcpServers: {
        demo: { connection: { transport: "stdio", command: "node", args: ["server.js"] } },
      },
    });
    workspace.writeFile(".mcp.json", "{}\n");
    workspace.writeFile(".cursor/preserve.txt", "foreign file\n");
    fs.symlinkSync("../.mcp.json", nodePath.join(workspace.root, ".cursor/mcp.json"), "file");
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();
          const resolution = expectResolved(yield* previewSync());
          expect(resolution.units.filter((unit) => unit.state === "blocked")).toEqual([]);
          const native = operationNativeLocations(resolution);
          expect(native).toHaveLength(1);
          expect(native[0]).toMatchObject({
            address: {
              kind: "key-path",
              path: nodePath.join(workspace.root, ".mcp.json"),
              keys: ["mcpServers", "demo"],
            },
            configuredConsumers: ["claude-code", "cursor"],
            aliases: [
              nodePath.join(workspace.root, ".cursor/mcp.json"),
              nodePath.join(workspace.root, ".mcp.json"),
            ].sort(),
            state: "created",
            ownership: "absent",
          });
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "retains prospective Rules and Knowledge units when dependent contributors form one closure",
    () => {
      const workspace = fixture({
        agents: ["codex"],
        rules: { guide: "workspace" },
        knowledge: { alpha: "workspace", beta: "workspace" },
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
      });
      writeAuthoredRule(workspace.root, "guide", "Keep all changes reviewable.");
      writeAuthoredKnowledge(workspace.root, "alpha", "Alpha description.");
      writeAuthoredKnowledge(workspace.root, "beta", "Beta description.");
      return workspace
        .provide(
          Effect.gen(function* () {
            const before = workspace.snapshot();
            const preview = expectResolved(yield* previewSync());
            const native = operationNativeLocations(preview);
            const regions = native.filter((unit) => unit.address.kind === "region");
            expect(regions).toHaveLength(2);
            expect(regions.map((unit) => unit.address)).toEqual(
              expect.arrayContaining([
                {
                  kind: "region",
                  path: nodePath.join(workspace.root, "AGENTS.md"),
                  region: "knowledge",
                },
                {
                  kind: "region",
                  path: nodePath.join(workspace.root, "AGENTS.md"),
                  region: "rules",
                },
              ]),
            );
            expect(new Set(regions.map((unit) => unit.address.path)).size).toBe(1);
            expect(regions.every((unit) => unit.configuredConsumers.includes("codex"))).toBe(true);
            expect(workspace.snapshot()).toEqual(before);
            const appliedResolution = expectResolved(yield* applySync());
            expect(
              deriveOperationOutcome(appliedResolution),
              JSON.stringify(appliedResolution),
            ).toBe("applied");
            const applied = operationNativeLocations(appliedResolution);
            expect(applied.map((unit) => unit.address)).toEqual(
              expect.arrayContaining(regions.map((unit) => unit.address)),
            );
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  /** An installed skill whose agent projection was deleted, so sync has work to do. */
  const driftedWorkspace = (workspace: SyncFixture) =>
    Effect.gen(function* () {
      writeLocalSkillPackage(workspace.root, { name: SKILL });
      workspace.writeSettings({
        owner: "@acme",
        agents: ["claude-code"],
        skills: { [SKILL]: `./vendor/${SKILL}` },
      });
      yield* applySync();
      expect(workspace.exists(PROJECTION)).toBe(true);
      workspace.remove(PROJECTION);
      expect(workspace.exists(PROJECTION)).toBe(false);
    });

  it.effect("rejects a prepared reconciliation after its desired authority changes", () => {
    const workspace = fixture();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* driftedWorkspace(workspace);
          const candidate = yield* SyncWorkspace.prepare(syncRequest());
          if (candidate._tag === "AlreadyReconciled")
            throw new Error("Expected reconciliation work");
          yield* SyncWorkspace.previewOrApply(candidate, previewPlanExecution);
          workspace.writeFile("axm.json", `${workspace.readFile("axm.json")}\n`);
          const before = workspace.snapshot();
          const resolution = yield* SyncWorkspace.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          );
          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect.each([
    { agent: "claude-code", key: "AXM_CLAUDE_SKILLS_DIR" },
    { agent: "gemini-cli", key: "AXM_GEMINI_CLI_SKILLS_DIR" },
  ])(
    "refuses a stale proposal after $key changes and replans its native location",
    ({ agent, key }) =>
      Effect.gen(function* () {
        const directory = yield* Ref.make("native/first");
        const workspace = makeSyncFixture({
          settings: {
            owner: "@acme",
            agents: [agent],
            skills: { [SKILL]: `./vendor/${SKILL}` },
          },
          configureConfigProvider: (original) =>
            ConfigProvider.make((path) =>
              path[0] === key
                ? Ref.get(directory).pipe(Effect.map(ConfigProvider.makeValue))
                : original.load(path),
            ),
        });
        cleanups.push(workspace.cleanup);
        writeLocalSkillPackage(workspace.root, { name: SKILL });
        yield* workspace.provide(applySync());
        const originalPath = `native/first/${SKILL}`;
        const replacementPath = `native/second/${SKILL}`;
        expect(workspace.exists(originalPath)).toBe(true);
        workspace.remove(originalPath);

        const candidate = yield* workspace.provide(SyncWorkspace.prepare(syncRequest()));
        if (candidate._tag === "AlreadyReconciled") throw new Error("Expected missing Skill work");
        const preview = yield* workspace.provide(
          SyncWorkspace.previewOrApply(candidate, previewPlanExecution),
        );
        expect(operationNativeLocations(preview).map((unit) => unit.address.path)).toContain(
          nodePath.join(workspace.root, originalPath),
        );
        const before = workspace.snapshot();
        const homeBefore = workspace.homeSnapshot();

        // A second invocation captures the changed environment through the same
        // provider port; services are rebuilt before observing or applying it.
        yield* Ref.set(directory, "native/second");
        const stale = yield* workspace.provide(
          SyncWorkspace.previewOrApply(candidate, preapprovedPlanExecution),
        );
        expect(deriveOperationOutcome(stale)).toBe("blocked");
        expect(workspace.snapshot()).toEqual(before);
        expect(workspace.homeSnapshot()).toEqual(homeBefore);

        const fresh = yield* workspace.provide(SyncWorkspace.prepare(syncRequest()));
        if (fresh._tag === "AlreadyReconciled") throw new Error("Expected the new Skill location");
        const replanned = yield* workspace.provide(
          SyncWorkspace.previewOrApply(fresh, previewPlanExecution),
        );
        expect(operationNativeLocations(replanned).map((unit) => unit.address.path)).toContain(
          nodePath.join(workspace.root, replacementPath),
        );
        expect(fresh.execution.id).not.toBe(candidate.execution.id);
        expect(workspace.snapshot()).toEqual(before);
        const applied = yield* workspace.provide(
          SyncWorkspace.previewOrApply(fresh, preapprovedPlanExecution),
        );
        expect(deriveOperationOutcome(applied)).toBe("applied");
        expect(workspace.exists(replacementPath)).toBe(true);
        expect(workspace.exists(originalPath)).toBe(false);
        expect(workspace.readFile(`${replacementPath}/SKILL.md`)).toBe(
          workspace.readFile(`vendor/${SKILL}/src/SKILL.md`),
        );
        expect(workspace.homeSnapshot()).toEqual(homeBefore);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects changed local source bytes before first accepted acquisition", () => {
    const workspace = fixture({ skills: { [SKILL]: `./vendor/${SKILL}` } });
    writeLocalSkillPackage(workspace.root, { name: SKILL });
    return workspace
      .provide(
        Effect.gen(function* () {
          const candidate = yield* SyncWorkspace.prepare(syncRequest());
          if (candidate._tag === "AlreadyReconciled") throw new Error("Expected first acquisition");
          yield* SyncWorkspace.previewOrApply(candidate, previewPlanExecution);
          const source = `vendor/${SKILL}/src/SKILL.md`;
          workspace.writeFile(
            source,
            `${workspace.readFile(source)}\nChanged after preparation.\n`,
          );
          const before = workspace.snapshot();
          const result = yield* SyncWorkspace.previewOrApply(candidate, preapprovedPlanExecution);
          expect(deriveOperationOutcome(result)).toBe("blocked");
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a previewed reconciliation changes no protected state", () => {
    const workspace = fixture();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* driftedWorkspace(workspace);
          const before = workspace.snapshot();
          const homeBefore = workspace.homeSnapshot();

          const resolution = expectResolved(yield* previewSync());

          expect(resolution.mode).toBe("preview");
          expect(deriveOperationOutcome(resolution)).toBe("previewed");
          expect(countUnitStates(resolution.units).committed).toBe(0);
          expect(workspace.snapshot()).toEqual(before);
          expect(workspace.homeSnapshot()).toEqual(homeBefore);
          expect(workspace.exists(PROJECTION)).toBe(false);
          expect(operationNativeLocations(resolution)).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                address: { kind: "entry", path: `${workspace.root}/${PROJECTION}` },
                state: "created",
                ownership: "absent",
                configuredConsumers: ["claude-code"],
              }),
              expect.objectContaining({ policyReasons: ["workspace-shared-skills"] }),
            ]),
          );
          expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "the previewed reconciliation is real: applying it afterwards restores what the preview left missing",
    () => {
      const workspace = fixture();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* driftedWorkspace(workspace);
            const before = workspace.snapshot();

            expectResolved(yield* previewSync());
            expect(workspace.snapshot()).toEqual(before);

            const applied = expectResolved(yield* applySync());

            expect(deriveOperationOutcome(applied)).toBe("applied");
            expect(workspace.exists(PROJECTION)).toBe(true);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "a previewed reconciliation of a desired extension whose source is missing reports it and changes nothing",
    () => {
      const workspace = fixture({ skills: { ghost: "./vendor/ghost" } });
      const before = workspace.snapshot();
      return workspace
        .provide(
          Effect.gen(function* () {
            const failure = yield* previewSync().pipe(Effect.flip);

            expect(JSON.stringify(failure)).toContain("ghost");
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.exists(".claude/skills/ghost")).toBe(false);
            expect(workspace.readFile("axm-lock.yaml")).not.toContain("ghost");
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
