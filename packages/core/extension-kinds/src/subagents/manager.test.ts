/**
 * Unit tests for SubagentManager service.
 *
 * Tests cover fresh install with rendering, re-install rendering,
 * uninstall removing rendered files, and settings/lockfile CRUD.
 */

import {
  AcceptedResolutionWriter,
  ProjectionUnitPathSchema,
  UNCONSTRAINED_DESIRED_NODE,
  type Lockfile,
  type SubagentLockEntry,
  type Settings,
} from "@agentxm/workspace-kernel/workspace-state";
import { NativeWriteAuthorityPermissive } from "@agentxm/workspace-kernel/agent-adapters/testing";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it, vi } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import type { LocalSubagentRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import {
  codingAgentForId,
  type AddSubagentArgs,
  type CodingAgent,
} from "@agentxm/workspace-kernel/agent-adapters";
import { SubagentManager } from "@agentxm/workspace-kernel/materialization";
import { CodingAgentRepository } from "@agentxm/workspace-kernel/projection";
import {
  AcceptedResolutionWriterTest,
  WorkspaceReadTest,
  MockWorkspaceTransactionScope,
  TEST_TREE_INTEGRITY,
  describeTestFailure,
  exactVersion,
  extensionName,
  handle,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import { SourceHostProvidersTest } from "@agentxm/workspace-kernel/sources/testing";
import { SubagentManagerLive } from "./manager.js";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeLocalSubagentRef = (name: string, sourcePath: string): LocalSubagentRef => ({
  type: "subagent",
  refType: "local",
  owner: handle("@acme"),
  name: extensionName(name),
  subagent: {
    name: extensionName(name),
    description: Option.none(),
  },
  source: { type: "local", path: sourcePath },
  location: `file://${sourcePath}`,
  sourcePath: `sources/${name}`,
});

const makeSubagentContent = (name: string, description: string) =>
  `You are a ${name}. ${description}`;

const writeSubagentPackage = (packageRoot: string, name: string, description: string) => {
  nodeFs.mkdirSync(nodePath.join(packageRoot, "src"), { recursive: true });
  nodeFs.writeFileSync(
    nodePath.join(packageRoot, "subagent.json"),
    JSON.stringify({
      owner: "@acme",
      type: "subagent",
      name,
      version: "1.0.0",
      description,
      core: { instructions: `src/${name}.md` },
    }),
  );
  nodeFs.writeFileSync(
    nodePath.join(packageRoot, "src", `${name}.md`),
    makeSubagentContent(name, description),
  );
};

const makeMockCodingAgent = (
  id: MaterializationTargetId,
  overrides?: Partial<CodingAgent>,
): CodingAgent => ({
  id,
  resolveNativeReadLocations: codingAgentForId(id).resolveNativeReadLocations,
  resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "unsupported", reason: "not used" }),
  resolveEffectiveSubagentsDir: ({ workspaceRoot }) =>
    Effect.succeed({
      _tag: "supported",
      dir: nodePath.join(workspaceRoot, ".claude/agents"),
      warnings: [],
    }),
  addSubagent: () =>
    Effect.succeed({
      _tag: "success",
      renderedFilePaths: [`.claude/agents/test-agent.md`],
      warnings: [],
    }),
  removeSubagent: () =>
    Effect.succeed({
      _tag: "success",
      renderedFilePaths: [],
      warnings: [],
    }),
  ...overrides,
});

const makeTestLayer = (overrides?: {
  readonly agents?: ReadonlyArray<CodingAgent>;
  readonly axmDir?: string;
  readonly configuredSubagents?: NonNullable<Settings["subagents"]>;
  readonly lockedSubagents?: Readonly<Record<string, SubagentLockEntry>>;
}) => {
  const axmDir = overrides?.axmDir ?? "/tmp/test-project/.axm";
  const testAgents = overrides?.agents ?? [makeMockCodingAgent("claude-code")];
  const configuredSubagents = overrides?.configuredSubagents ?? {};
  const graph = {
    packMembership: [],
    // A configuration-only entry declares no source, so it contributes no node
    // of its own; these fixtures describe declared subagents.
    nodes: Object.entries(configuredSubagents).flatMap(([name, entry]) => {
      const source = typeof entry === "string" ? entry : entry.source;
      if (source === undefined) return [];
      const enabled = typeof entry === "string" || entry.enabled !== false;
      return [
        {
          type: "subagent" as const,
          name,
          identity: { authority: "git" as const, locator: source },
          source,
          enabled,
          constraint: UNCONSTRAINED_DESIRED_NODE,
          origins: [{ type: "settings" as const, source, enabled }],
        },
      ];
    }),
    mcpSourceClosures: [],
    problems: [],
  };

  const agentRepoLayer = Layer.succeed(CodingAgentRepository, {
    get: (id) => {
      const found = testAgents.find((a) => a.id === id);
      if (found === undefined) {
        return Effect.die(new Error(`Agent ${id} not declared in fixture`));
      }
      return Effect.succeed(found);
    },
    all: Effect.succeed(testAgents),
    getConfiguredAgents: () => Effect.succeed(testAgents),
    getMaterializationAgents: () => Effect.succeed(testAgents),
    getUnknownConfiguredAgentIds: () => Effect.succeed([]),
  });

  const lockfile: Lockfile = {
    lockfileVersion: 12,
    skills: {},
    subagents: overrides?.lockedSubagents ?? {},
  };
  return SubagentManagerLive.pipe(
    Layer.provideMerge(
      WorkspaceReadTest({
        baseDir: nodePath.dirname(axmDir),
        runtimeDir: axmDir,
        settings: {
          agents: testAgents.map(({ id }) => id),
          subagents: configuredSubagents,
        },
        lockfile,
        graph,
      }),
    ),
    // Projection rows the manager stages are what its next observation reads.
    Layer.provideMerge(AcceptedResolutionWriterTest(lockfile)),
    Layer.provideMerge(MockWorkspaceTransactionScope(axmDir)),
    Layer.provide(agentRepoLayer),
    Layer.provide(SourceHostProvidersTest()),
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.provideMerge(RegistryTransportTest(FetchHttpClient.layer), NodeServices.layer),
        NativeWriteAuthorityPermissive,
      ),
    ),
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SubagentManager", () => {
  describe("isInstalled", () => {
    it.effect("returns false when no subagents are locked", () =>
      Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const result = yield* manager.isInstalled({ target: { type: "subagent", name: "test" } });
        expect(result).toBe(false);
      }).pipe(Effect.provide(makeTestLayer())),
    );

    it.effect("returns false when only an accepted-resolution row names the subagent", () =>
      Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const result = yield* manager.isInstalled({
          target: { type: "subagent", name: "planner" },
        });
        expect(result).toBe(false);
      }).pipe(
        Effect.provide(
          makeTestLayer({
            lockedSubagents: {
              planner: {
                source: { type: "path", path: decodeRelativePathSync("test") },
                identity: { owner: handle("@acme"), name: extensionName("planner") },
                resolved: { tree: TEST_TREE_INTEGRITY },
                treeIntegrity: TEST_TREE_INTEGRITY,
              },
            },
          }),
        ),
      ),
    );
  });

  describe("acceptedResolution", () => {
    it.effect("fails closed when lock persistence has no materialized identity", () => {
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const error = yield* manager
          .acceptedResolution({
            ref: makeLocalSubagentRef("planner", "/tmp/source/planner"),
            materialization: Option.none(),
          })
          .pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "InstallStateMissing",
          type: "subagent",
          name: "planner",
        });
      }).pipe(Effect.provide(makeTestLayer({})));
    });
  });

  describe("materializeInstall", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeFs.realpathSync(nodeOs.tmpdir()), "axm-test-"));
    });

    afterEach(() => {
      nodeFs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it.effect(
      "rejects an unrecorded differing native file before publishing canonical content",
      () => {
        const sourceDir = nodePath.join(tmpDir, "source/planner");
        writeSubagentPackage(sourceDir, "planner", "Plans work");
        const projectDir = nodePath.join(tmpDir, "project");
        const native = nodePath.join(projectDir, ".claude/agents/planner.md");
        nodeFs.mkdirSync(nodePath.dirname(native), { recursive: true });
        const foreign =
          "<!-- axm:file v=1 ext=@foreign/subagents/planner src=foreign/planner.md -->\nForeign\n";
        nodeFs.writeFileSync(native, foreign);
        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const error = yield* manager
            .materializeInstall({ ref: makeLocalSubagentRef("planner", sourceDir) })
            .pipe(Effect.flip);
          expect(describeTestFailure(error)).toContain(
            `Existing Subagent file has no recorded projection: ${native}`,
          );
          expect(nodeFs.existsSync(nodePath.join(projectDir, "agent_extensions"))).toBe(false);
          expect(nodeFs.readFileSync(native, "utf8")).toBe(foreign);
        }).pipe(Effect.provide(makeTestLayer({ axmDir: nodePath.join(projectDir, ".axm") })));
      },
    );

    it.effect("rejects incompatible shared readers before canonical publication", () => {
      const sourceDir = nodePath.join(tmpDir, "source/planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      nodeFs.writeFileSync(
        nodePath.join(sourceDir, "subagent.json"),
        JSON.stringify({
          owner: "@acme",
          type: "subagent",
          name: "planner",
          version: "1.0.0",
          description: "Plans work",
          core: { instructions: "src/planner.md" },
          implementations: {
            "claude-code": { kind: "customized", configuration: { model: "first" } },
            cursor: { kind: "customized", configuration: { model: "second" } },
          },
        }),
      );
      const projectDir = nodePath.join(tmpDir, "project");
      const agents = [makeMockCodingAgent("claude-code"), makeMockCodingAgent("cursor")];
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const error = yield* manager
          .materializeInstall({ ref: makeLocalSubagentRef("planner", sourceDir) })
          .pipe(Effect.flip);
        expect(describeTestFailure(error)).toContain("incompatible Subagent bytes");
        expect(nodeFs.existsSync(nodePath.join(projectDir, "agent_extensions"))).toBe(false);
      }).pipe(Effect.provide(makeTestLayer({ axmDir: nodePath.join(projectDir, ".axm"), agents })));
    });

    it.effect("renders to configured agents without writing lockfile render metadata", () => {
      const addSubagentCalls: Array<AddSubagentArgs> = [];
      const addSubagentSpy = vi.fn((args: AddSubagentArgs) =>
        Effect.sync(() => {
          addSubagentCalls.push(args);
          return {
            _tag: "success" as const,
            renderedFilePaths: [`.claude/agents/planner.md`],
            warnings: [],
          };
        }),
      );

      const agentWithSpy = makeMockCodingAgent("claude-code", {
        addSubagent: addSubagentSpy,
      });

      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");

      const axmDir = nodePath.join(tmpDir, "project", ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const facts = yield* manager.materializeInstall({
          ref: makeLocalSubagentRef("planner", sourceDir),
        });
        expect(facts.observation).toMatchObject({
          agents: ["claude-code"],
          targets: [
            {
              path: ".claude/agents/planner.md",
              agentIds: ["claude-code"],
            },
          ],
        });
        expect(addSubagentSpy).toHaveBeenCalledOnce();
        // The adapter receives the plain render input; provenance stays with
        // the projection's generation and never reaches the file.
        expect(addSubagentCalls[0]?.input).toMatchObject({
          agentId: "claude-code",
          name: "planner",
        });
        expect(JSON.stringify(addSubagentCalls[0]?.input)).not.toContain("axm:");
      }).pipe(
        Effect.provide(
          makeTestLayer({
            axmDir,
            agents: [agentWithSpy],
          }),
        ),
      );
    });

    it.effect("re-renders even when source hash matches", () => {
      const addSubagentSpy = vi.fn(() =>
        Effect.succeed({
          _tag: "success" as const,
          renderedFilePaths: [],
          warnings: [],
        }),
      );

      const agentWithSpy = makeMockCodingAgent("claude-code", {
        addSubagent: addSubagentSpy,
      });

      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");

      const axmDir = nodePath.join(tmpDir, "project", ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        yield* manager.materializeInstall({
          ref: makeLocalSubagentRef("planner", sourceDir),
        });
        expect(addSubagentSpy).toHaveBeenCalledOnce();
      }).pipe(
        Effect.provide(
          makeTestLayer({
            axmDir,
            agents: [agentWithSpy],
            lockedSubagents: {
              planner: {
                source: { type: "path", path: decodeRelativePathSync("sources/planner") },
                identity: { owner: handle("@acme"), name: extensionName("planner") },
                resolved: { tree: TEST_TREE_INTEGRITY },
                treeIntegrity: TEST_TREE_INTEGRITY,
              },
            },
          }),
        ),
      );
    });

    it.effect("records each written file and leaves a current file's bytes alone", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const projectDir = nodePath.join(tmpDir, "project");
      const axmDir = nodePath.join(projectDir, ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });
      const native = nodePath.join(projectDir, ".claude/agents/planner.md");
      const actual = codingAgentForId("claude-code");
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const accepted = yield* AcceptedResolutionWriter;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        yield* manager.materializeInstall({ ref });
        const written = nodeFs.readFileSync(native, "utf8");
        expect(written).not.toContain("axm:");
        const rows = yield* accepted.projectionRows("subagents");
        const row = rows.get(ProjectionUnitPathSchema.make(".claude/agents/planner.md"));
        expect(row?.stale).toBe(false);
        expect(row?.row.output).toMatch(/^sha256:[0-9a-f]{64}$/);
        // A formatter rewrite is not an input change: the file stays as it is.
        nodeFs.writeFileSync(native, "Repository-formatted planner\n");
        expect((yield* manager.projectionObservation(ref)).current).toBe(true);
        yield* manager.materializeInstall({ ref });
        expect(nodeFs.readFileSync(native, "utf8")).toBe("Repository-formatted planner\n");
      }).pipe(Effect.provide(makeTestLayer({ axmDir, agents: [actual] })));
    });

    it.effect("keys written files physically when the workspace root is an alias", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      // The workspace is named through a link while writes address the
      // physical file, as an aliased temp or checkout path does.
      const realDir = nodePath.join(tmpDir, "real-project");
      const projectDir = nodePath.join(tmpDir, "project");
      nodeFs.mkdirSync(nodePath.join(realDir, ".axm"), { recursive: true });
      nodeFs.symlinkSync(realDir, projectDir, "dir");
      const axmDir = nodePath.join(projectDir, ".axm");
      const native = nodePath.join(realDir, ".claude/agents/planner.md");
      const unit = ProjectionUnitPathSchema.make(".claude/agents/planner.md");
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const accepted = yield* AcceptedResolutionWriter;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        yield* manager.materializeInstall({ ref });
        expect([...(yield* accepted.projectionRows("subagents")).keys()]).toEqual([unit]);
        expect((yield* manager.projectionObservation(ref)).current).toBe(true);

        yield* manager.materializeInstall({ ref });
        expect([...(yield* accepted.projectionRows("subagents")).keys()]).toEqual([unit]);

        yield* manager.materializeDeactivate({ target: { type: "subagent", name: "planner" } });
        expect(nodeFs.existsSync(native)).toBe(false);
        expect((yield* accepted.projectionRows("subagents")).size).toBe(0);
      }).pipe(
        Effect.provide(
          makeTestLayer({
            axmDir,
            agents: [codingAgentForId("claude-code")],
            configuredSubagents: { planner: { source: "path:sources/planner", enabled: true } },
            lockedSubagents: {
              planner: {
                source: { type: "path", path: decodeRelativePathSync("sources/planner") },
                identity: { owner: handle("@acme"), name: extensionName("planner") },
                resolved: { tree: TEST_TREE_INTEGRITY },
                treeIntegrity: TEST_TREE_INTEGRITY,
              },
            },
          }),
        ),
      );
    });

    it.effect("previews each planned write with how the replaced file compares", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const projectDir = nodePath.join(tmpDir, "project");
      const axmDir = nodePath.join(projectDir, ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });
      const native = nodePath.join(projectDir, ".claude/agents/planner.md");
      const actual = codingAgentForId("claude-code");
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const accepted = yield* AcceptedResolutionWriter;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        const options = { sourceRoot: sourceDir };
        expect((yield* manager.projectionObservation(ref, options)).targets).toEqual([
          { path: ".claude/agents/planner.md", change: "created" },
        ]);
        yield* manager.materializeInstall({ ref });
        expect((yield* manager.projectionObservation(ref, options)).targets).toBeUndefined();

        writeSubagentPackage(sourceDir, "planner", "Plans work carefully");
        expect((yield* manager.projectionObservation(ref, options)).targets).toEqual([
          { path: ".claude/agents/planner.md", change: "updated", lastWrite: "matches" },
        ]);
        nodeFs.writeFileSync(native, "Edited by hand\n");
        const rowsBefore = yield* accepted.projectionRows("subagents");
        const observed = yield* manager.projectionObservation(ref, options);
        expect(observed.current).toBe(false);
        expect(observed.targets).toEqual([
          { path: ".claude/agents/planner.md", change: "updated", lastWrite: "modified" },
        ]);
        // Observing never writes the file or its row.
        expect(nodeFs.readFileSync(native, "utf8")).toBe("Edited by hand\n");
        expect(yield* accepted.projectionRows("subagents")).toEqual(rowsBefore);
      }).pipe(Effect.provide(makeTestLayer({ axmDir, agents: [actual] })));
    });

    it.effect("previews an identical unrecorded file as a record-only change", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const actual = codingAgentForId("claude-code");
      const project = (name: string) => {
        const projectDir = nodePath.join(tmpDir, name);
        const axmDir = nodePath.join(projectDir, ".axm");
        nodeFs.mkdirSync(axmDir, { recursive: true });
        return { axmDir, native: nodePath.join(projectDir, ".claude/agents/planner.md") };
      };
      const rendered = project("rendered");
      const unrecorded = project("unrecorded");
      const ref = makeLocalSubagentRef("planner", sourceDir);
      return Effect.gen(function* () {
        yield* (yield* SubagentManager).materializeInstall({ ref });
      }).pipe(
        Effect.provide(makeTestLayer({ axmDir: rendered.axmDir, agents: [actual] })),
        Effect.andThen(() => {
          const bytes = nodeFs.readFileSync(rendered.native, "utf8");
          nodeFs.mkdirSync(nodePath.dirname(unrecorded.native), { recursive: true });
          nodeFs.writeFileSync(unrecorded.native, bytes);
          return Effect.gen(function* () {
            const manager = yield* SubagentManager;
            const accepted = yield* AcceptedResolutionWriter;
            const observed = yield* manager.projectionObservation(ref, { sourceRoot: sourceDir });
            // Only the row is missing: nothing is planned at the file itself,
            // and observing records nothing.
            expect(observed.current).toBe(false);
            expect(observed.targets).toBeUndefined();
            expect((yield* accepted.projectionRows("subagents")).size).toBe(0);
            expect(nodeFs.readFileSync(unrecorded.native, "utf8")).toBe(bytes);
          }).pipe(Effect.provide(makeTestLayer({ axmDir: unrecorded.axmDir, agents: [actual] })));
        }),
      );
    });

    it.effect("reports unsupported targets without creating a role Skill", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const projectDir = nodePath.join(tmpDir, "project");
      const skillsDir = nodePath.join(projectDir, ".cline", "skills");
      const unsupportedAgent = makeMockCodingAgent("cline", {
        resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: skillsDir }),
      });
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const facts = yield* manager.materializeInstall({
          ref: makeLocalSubagentRef("planner", sourceDir),
        });
        expect(facts.observation).toMatchObject({
          agents: [],
          targets: [],
          agentOutcomes: [{ agentId: "cline", outcome: "unsupported" }],
        });
        expect(nodeFs.existsSync(skillsDir)).toBe(false);
      }).pipe(
        Effect.provide(
          makeTestLayer({ axmDir: nodePath.join(projectDir, ".axm"), agents: [unsupportedAgent] }),
        ),
      );
    });

    it.effect("reports explicit empty coverage when no agent supports a native surface", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const axmDir = nodePath.join(tmpDir, "project", ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });
      const unsupportedAgent = makeMockCodingAgent("cline", {
        addSubagent: () => Effect.succeed({ _tag: "unsupported", reason: "no native surface" }),
        resolveEffectiveSkillsDir: () =>
          Effect.succeed({ _tag: "unsupported", reason: "no skills surface" }),
      });

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const facts = yield* manager.materializeInstall({
          ref: makeLocalSubagentRef("planner", sourceDir),
        });
        expect(facts.observation).toMatchObject({ agents: [], targets: [] });
      }).pipe(Effect.provide(makeTestLayer({ axmDir, agents: [unsupportedAgent] })));
    });
  });

  describe("materializeUninstall", () => {
    it.effect(
      "withdraws recorded native files and keeps unrecorded copies at additional reader locations",
      () => {
        const tmpDir = nodeFs.mkdtempSync(
          nodePath.join(nodeFs.realpathSync(nodeOs.tmpdir()), "axm-subagent-additional-"),
        );
        const sourceDir = nodePath.join(tmpDir, "additional-source/planner");
        writeSubagentPackage(sourceDir, "planner", "Plans work");
        const projectDir = nodePath.join(tmpDir, "additional-project");
        const axmDir = nodePath.join(projectDir, ".axm");
        nodeFs.mkdirSync(axmDir, { recursive: true });
        const actual = codingAgentForId("claude-code");
        const agent: CodingAgent = {
          ...actual,
          resolveNativeReadLocations: (args) =>
            actual.resolveNativeReadLocations(args).pipe(
              Effect.map((locations) => {
                const primary = locations[0];
                return args.kind !== "subagent" || primary === undefined
                  ? locations
                  : [
                      ...locations,
                      { ...primary, path: nodePath.join(args.workspaceRoot, ".additional-agents") },
                    ];
              }),
            ),
        };
        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          yield* manager.materializeInstall({ ref: makeLocalSubagentRef("planner", sourceDir) });
          const nativeFile = nodePath.join(projectDir, ".claude/agents/planner.md");
          const additionalFile = nodePath.join(projectDir, ".additional-agents/planner.md");
          nodeFs.mkdirSync(nodePath.dirname(additionalFile));
          nodeFs.copyFileSync(nativeFile, additionalFile);
          const result = yield* manager.materializeDeactivate({
            target: { type: "subagent", name: "planner" },
          });
          // The recorded write is withdrawn; a copy AXM never wrote is kept
          // and reported, whatever its bytes.
          expect(nodeFs.existsSync(nativeFile)).toBe(false);
          expect(nodeFs.existsSync(additionalFile)).toBe(true);
          expect(result.observation.nativeLocations).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                address: expect.objectContaining({ path: nativeFile }),
                state: "removed",
                ownership: "absent",
              }),
              expect.objectContaining({
                address: expect.objectContaining({ path: additionalFile }),
                state: "retained",
                reason: `Retained ${additionalFile}, which AXM has no record of writing`,
              }),
            ]),
          );
          expect((yield* (yield* AcceptedResolutionWriter).projectionRows("subagents")).size).toBe(
            0,
          );
        }).pipe(
          Effect.provide(
            makeTestLayer({
              axmDir,
              agents: [agent],
              configuredSubagents: { planner: { source: "path:sources/planner", enabled: true } },
              lockedSubagents: {
                planner: {
                  source: { type: "path", path: decodeRelativePathSync("sources/planner") },
                  identity: { owner: handle("@acme"), name: extensionName("planner") },
                  resolved: { tree: TEST_TREE_INTEGRITY },
                  treeIntegrity: TEST_TREE_INTEGRITY,
                },
              },
            }),
          ),
          Effect.ensuring(
            Effect.sync(() => nodeFs.rmSync(tmpDir, { recursive: true, force: true })),
          ),
        );
      },
    );

    it.effect("does not invoke a writer when no native artifact has exact ownership", () => {
      const removeSubagentSpy = vi.fn(() =>
        Effect.succeed({
          _tag: "success" as const,
          renderedFilePaths: [],
          warnings: [],
        }),
      );

      const agentWithSpy = makeMockCodingAgent("claude-code", {
        removeSubagent: removeSubagentSpy,
      });

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        yield* manager.materializeUninstall({
          target: { type: "subagent", name: "planner" },
        });
        expect(removeSubagentSpy).not.toHaveBeenCalled();
      }).pipe(
        Effect.provide(
          makeTestLayer({
            agents: [agentWithSpy],
            lockedSubagents: {
              planner: {
                source: { type: "path", path: decodeRelativePathSync("tmp/source/planner") },
                identity: { owner: handle("@acme"), name: extensionName("planner") },
                resolved: { tree: TEST_TREE_INTEGRITY },
                treeIntegrity: TEST_TREE_INTEGRITY,
              },
            },
          }),
        ),
      );
    });

    it.effect("removes registry canonical subagent directories", () => {
      const tmpDir = nodeFs.mkdtempSync(
        nodePath.join(nodeFs.realpathSync(nodeOs.tmpdir()), "axm-subagent-uninstall-"),
      );
      const axmDir = nodePath.join(tmpDir, "project", ".axm");
      const canonicalDir = nodePath.join(
        tmpDir,
        "project",
        "agent_extensions",
        "registry.agentxm.ai",
        "@test",
        "subagents",
        "planner",
      );

      return Effect.gen(function* () {
        yield* Effect.sync(() => {
          nodeFs.mkdirSync(nodePath.join(canonicalDir, "src"), { recursive: true });
          nodeFs.writeFileSync(
            nodePath.join(canonicalDir, "src", "planner.md"),
            makeSubagentContent("planner", "Plans work"),
          );
        });

        const manager = yield* SubagentManager;
        yield* manager.materializeUninstall({
          target: { type: "subagent", name: "planner" },
        });

        expect(nodeFs.existsSync(canonicalDir)).toBe(false);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            nodeFs.rmSync(tmpDir, { recursive: true, force: true });
          }),
        ),
        Effect.provide(
          makeTestLayer({
            axmDir,
            configuredSubagents: {
              planner: { source: "@test/subagents/planner", enabled: true },
            },
            lockedSubagents: {
              planner: {
                source: {
                  type: "registry",
                  url: new URL("https://registry.agentxm.ai"),
                },
                identity: { owner: handle("@test"), name: extensionName("planner") },
                resolved: {
                  version: exactVersion("1.0.0"),
                  integrity: "sha512-test",
                  publisherBindingId: "hbnd_test",
                },
                treeIntegrity: TEST_TREE_INTEGRITY,
              },
            },
          }),
        ),
      );
    });

    it.effect("handles missing lockfile entry gracefully", () =>
      Effect.gen(function* () {
        const manager = yield* SubagentManager;
        // Should not throw — just skip removal
        yield* manager.materializeUninstall({
          target: { type: "subagent", name: "nonexistent" },
        });
      }).pipe(Effect.provide(makeTestLayer())),
    );
  });
});
