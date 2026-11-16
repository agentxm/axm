/**
 * Unit tests for SubagentManager service.
 *
 * Tests cover fresh install with rendering, re-install rendering,
 * uninstall removing rendered files, and settings/lockfile CRUD.
 */

import {
  AcceptedResolutionWriter,
  CurrentWorkspaceReadPhase,
  DesiredStateReader,
  LockfileReader,
  ProjectionUnitPathSchema,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  UNCONSTRAINED_DESIRED_NODE,
  type DesiredNodeIdentity,
  type Lockfile,
  computeMaterializedTreeIntegrity,
  computePackageContentHash,
  type SubagentLockEntry,
  type Settings,
  type TreeIntegrity,
} from "@agentxm/workspace-kernel/workspace-state";
import { NativeWriteAuthorityPermissive } from "@agentxm/workspace-kernel/agent-adapters/testing";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it, vi } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Tracer from "effect/Tracer";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import {
  FileSystemRecorder,
  layerRecordingFileSystem,
  makeRecordingFileSystem,
} from "@agentxm/test-support";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import type {
  LocalSubagentRef,
  WorkspaceSubagentRef,
} from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import { codingAgentForId, type CodingAgent } from "@agentxm/workspace-kernel/agent-adapters";
import { SubagentManager } from "@agentxm/workspace-kernel/materialization";
import {
  CodingAgentRepository,
  projectionOutputDigest,
} from "@agentxm/workspace-kernel/projection";
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
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import {
  AcquiredContent,
  canonicalMaterializationPaths,
} from "@agentxm/workspace-kernel/acquisition";
import { parseNativeSubagent } from "@agentxm/extension-content";

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

const TEST_REGISTRY_ENDPOINT = decodeRegistryEndpointSync("https://registry.agentxm.ai");

/** A package whose Codex implementation binds a package resource file. */
const writeResourcePackage = (packageRoot: string) => {
  writeSubagentPackage(packageRoot, "planner", "Plans work");
  nodeFs.writeFileSync(
    nodePath.join(packageRoot, "subagent.json"),
    JSON.stringify({
      owner: "@acme",
      type: "subagent",
      name: "planner",
      version: "1.0.0",
      description: "Plans work",
      core: { instructions: "src/planner.md" },
      implementations: {
        codex: {
          kind: "customized",
          configuration: { model_instructions_file: "instructions.md" },
        },
      },
    }),
  );
  nodeFs.writeFileSync(nodePath.join(packageRoot, "instructions.md"), "Review the complete plan.");
  return nodePath.join(packageRoot, "instructions.md");
};

/**
 * Run `effect` in an observation read phase over the test filesystem that ends,
 * as a mutation through its port would, when it first touches `endsAt`.
 * The phase records nothing itself; only its lifetime is under test.
 */
const inEndingReadPhase = <A, E, R>(effect: Effect.Effect<A, E, R>, endsAt?: string) =>
  Effect.gen(function* () {
    const base = yield* FileSystem.FileSystem;
    let active = true;
    const touch = (path: string) =>
      Effect.sync(() => {
        if (path === endsAt) active = false;
      });
    const { fileSystem } = makeRecordingFileSystem({
      ...base,
      access: (path, options) => Effect.andThen(touch(path), base.access(path, options)),
      readFile: (path) => Effect.andThen(touch(path), base.readFile(path)),
    });
    return yield* effect.pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(CurrentWorkspaceReadPhase, {
        location: yield* WorkspaceLocation,
        observations: true,
        stateLoaders: () => Effect.die("The read phase fixture loads no state"),
        fileSystem,
        readers: {
          desired: yield* DesiredStateReader,
          settings: yield* SettingsReader,
          locks: yield* LockfileReader,
        },
        records: yield* WorkspaceRecords,
        packDocuments: new Map(),
        isActive: () => active,
        endedBy: () => (active ? undefined : "mutation"),
        close: () => {
          active = false;
        },
      }),
    );
  });

/** Counts spans by name; `reset` forgets setup spans. */
const makeSpanCounter = () => {
  const spans: Tracer.NativeSpan[] = [];
  return {
    tracer: Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    }),
    count: (name: string) => spans.filter((span) => span.name === name).length,
    reset: () => {
      spans.length = 0;
    },
  };
};

const makeTestLayer = (overrides?: {
  readonly agents?: ReadonlyArray<CodingAgent>;
  readonly axmDir?: string;
  readonly configuredSubagents?: NonNullable<Settings["subagents"]>;
  readonly lockedSubagents?: Readonly<Record<string, SubagentLockEntry>>;
}) => {
  const axmDir = overrides?.axmDir ?? "/tmp/test-project/.axm";
  const testAgents = overrides?.agents ?? [makeMockCodingAgent("claude-code")];
  const configuredSubagents = overrides?.configuredSubagents ?? {};
  // A Registry locator binds to the default Registry; any other names its source.
  const identityOf = (source: string): DesiredNodeIdentity =>
    source.startsWith("@")
      ? {
          authority: "registry",
          fqn: source,
          registry: { sourceName: "agentxm", endpoint: TEST_REGISTRY_ENDPOINT },
        }
      : { authority: "git", locator: source };
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
          identity: identityOf(source),
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
    lockfileVersion: 1,
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
        Layer.provideMerge(
          RegistryTransportTest(FetchHttpClient.layer),
          // Every filesystem call is recorded, so a test can count per-path work.
          Layer.mergeAll(NativePlatformTest, layerRecordingFileSystem(NodeFileSystem.layer)),
        ),
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
        const native = nodeFs.readFileSync(
          nodePath.join(axmDir, "..", ".claude/agents/planner.md"),
          "utf8",
        );
        expect(native).toContain("planner");
        expect(native).toContain("Plans work");
        expect(native).not.toContain("axm:");
      }).pipe(
        Effect.provide(
          makeTestLayer({
            axmDir,
            agents: [codingAgentForId("claude-code")],
          }),
        ),
      );
    });

    it.effect("repairs a missing native output even when source hash matches", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");

      const axmDir = nodePath.join(tmpDir, "project", ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        yield* manager.materializeInstall({
          ref: makeLocalSubagentRef("planner", sourceDir),
        });
        expect(
          nodeFs.readFileSync(nodePath.join(axmDir, "..", ".claude/agents/planner.md"), "utf8"),
        ).toContain("Plans work");
      }).pipe(
        Effect.provide(
          makeTestLayer({
            axmDir,
            agents: [codingAgentForId("claude-code")],
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

    it.effect(
      "applies one prepared physical output for aliased readers and preserves their hand edits",
      () => {
        const sourceDir = nodePath.join(tmpDir, "source", "planner");
        writeSubagentPackage(sourceDir, "planner", "Plans work");
        const projectDir = nodePath.join(tmpDir, "project");
        const axmDir = nodePath.join(projectDir, ".axm");
        const physical = nodePath.join(projectDir, ".claude/agents");
        const alias = nodePath.join(projectDir, ".cursor/agents");
        nodeFs.mkdirSync(physical, { recursive: true });
        nodeFs.mkdirSync(nodePath.dirname(alias), { recursive: true });
        nodeFs.symlinkSync(physical, alias, "dir");
        const native = nodePath.join(physical, "planner.md");
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const count = (name: string) => spans.filter((span) => span.name === name).length;
        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const accepted = yield* AcceptedResolutionWriter;
          const ref = makeLocalSubagentRef("planner", sourceDir);
          const first = yield* manager.materializeInstall({ ref });
          expect(first.observation.agents).toEqual(["claude-code", "cursor"]);
          expect(first.observation.targets).toEqual([
            { path: ".claude/agents/planner.md", agentIds: ["claude-code", "cursor"] },
          ]);
          expect(count("axm.subagent.apply")).toBe(1);
          expect(count("axm.subagent.publish")).toBe(1);
          // The external source preflight and staged snapshot each need one
          // compilation per reader; apply consumes the final prepared outputs.
          expect(count("axm.subagent.compile")).toBe(4);
          expect((yield* accepted.projectionRows("subagents")).size).toBe(1);
          expect(nodeFs.readFileSync(native, "utf8")).toContain("Plans work");
          nodeFs.writeFileSync(native, "Shared hand edit\n");
          spans.length = 0;
          const second = yield* manager.materializeInstall({ ref });
          expect(second.observation.targets).toEqual(first.observation.targets);
          expect(count("axm.subagent.apply")).toBe(1);
          expect(count("axm.subagent.publish")).toBe(0);
          expect(nodeFs.readFileSync(native, "utf8")).toBe("Shared hand edit\n");
          expect(nodeFs.readlinkSync(alias)).toBe(physical);
          expect((yield* accepted.projectionRows("subagents")).size).toBe(1);
        }).pipe(
          Effect.provide(
            makeTestLayer({
              axmDir,
              agents: [codingAgentForId("claude-code"), codingAgentForId("cursor")],
            }),
          ),
          Effect.withTracer(tracer),
          Effect.withTracerEnabled(true),
        );
      },
    );

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

    it.effect(
      "binds staged resources to retained content and observes changes after acquisition ends",
      () => {
        const sourceDir = nodePath.join(tmpDir, "source", "planner");
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
              codex: {
                kind: "customized",
                configuration: { model_instructions_file: "instructions.md" },
              },
            },
          }),
        );
        nodeFs.writeFileSync(
          nodePath.join(sourceDir, "instructions.md"),
          "Review the complete plan.",
        );
        const projectDir = nodePath.join(tmpDir, "project");
        const axmDir = nodePath.join(projectDir, ".axm");
        nodeFs.mkdirSync(axmDir, { recursive: true });
        const actual = codingAgentForId("codex");
        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const ref = makeLocalSubagentRef("planner", sourceDir);
          yield* manager.materializeInstall({ ref });
          const placement = yield* actual.resolveEffectiveSubagentsDir({
            workspaceRoot: projectDir,
            scope: "project",
          });
          expect(placement._tag).toBe("supported");
          if (placement._tag !== "supported") return;
          const native = nodePath.join(placement.dir, "planner.toml");
          const definition = yield* parseNativeSubagent({
            agentId: "codex",
            source: "planner.toml",
            content: nodeFs.readFileSync(native, "utf8"),
          });
          const resource = definition.configuration["model_instructions_file"];
          expect(typeof resource).toBe("string");
          if (typeof resource !== "string") return;
          expect(resource).toContain(nodePath.join(projectDir, "agent_extensions"));
          nodeFs.rmSync(sourceDir, { recursive: true });
          expect(nodeFs.readFileSync(resource, "utf8")).toBe("Review the complete plan.");
          expect((yield* manager.projectionObservation(ref)).current).toBe(true);
          nodeFs.writeFileSync(resource, "Review the updated plan.");
          expect((yield* manager.projectionObservation(ref)).current).toBe(false);
        }).pipe(Effect.provide(makeTestLayer({ axmDir, agents: [actual] })));
      },
    );

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
                  url: TEST_REGISTRY_ENDPOINT,
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

  describe("work within one call", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = nodeFs.mkdtempSync(
        nodePath.join(nodeFs.realpathSync(nodeOs.tmpdir()), "axm-subagent-work-"),
      );
    });

    afterEach(() => {
      nodeFs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const resourceFixture = () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      const resource = writeResourcePackage(sourceDir);
      const axmDir = nodePath.join(tmpDir, "project", ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });
      return {
        sourceDir,
        resource,
        layer: makeTestLayer({
          axmDir,
          agents: [codingAgentForId("claude-code"), codingAgentForId("codex")],
        }),
      };
    };

    it.effect(
      "prepares each configured agent once when outcomes also validate destinations",
      () => {
        const { sourceDir, resource, layer } = resourceFixture();
        const spans = makeSpanCounter();
        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const recording = yield* FileSystemRecorder;
          const ref = makeLocalSubagentRef("planner", sourceDir);
          recording.reset();
          const validated = yield* manager.configuredAgentOutcomesForRef(ref, "projected", {
            sourceRoot: sourceDir,
            validateDestinations: true,
          });
          expect(spans.count("axm.subagent.prepare")).toBe(2);
          expect(spans.count("axm.subagent.compile")).toBe(2);
          expect(recording.contentReads(resource)).toBe(1);

          // Without destination checks the call prepares each agent once, as before.
          spans.reset();
          recording.reset();
          const unvalidated = yield* manager.configuredAgentOutcomesForRef(ref, "projected", {
            sourceRoot: sourceDir,
          });
          expect(spans.count("axm.subagent.prepare")).toBe(2);
          expect(spans.count("axm.subagent.compile")).toBe(2);
          expect(recording.contentReads(resource)).toBe(1);
          expect(validated).toEqual(unvalidated);
          expect(validated.map(({ agentId, outcome }) => ({ agentId, outcome }))).toEqual([
            { agentId: "claude-code", outcome: "projected" },
            { agentId: "codex", outcome: "projected" },
          ]);
        }).pipe(
          Effect.provide(layer),
          Effect.withTracer(spans.tracer),
          Effect.withTracerEnabled(true),
        );
      },
    );

    it.effect("reports unsupported agents alike whether or not destinations are validated", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      // Cline cannot compile a native Subagent; this Codex has no Subagent directory.
      const unsupported = [
        codingAgentForId("cline"),
        makeMockCodingAgent("codex", {
          resolveEffectiveSubagentsDir: () =>
            Effect.succeed({ _tag: "unsupported", reason: "no native surface" }),
        }),
      ];
      const outcomesWith = (agents: ReadonlyArray<CodingAgent>) =>
        Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const ref = makeLocalSubagentRef("planner", sourceDir);
          const validated = yield* manager.configuredAgentOutcomesForRef(ref, "projected", {
            sourceRoot: sourceDir,
            validateDestinations: true,
          });
          const unvalidated = yield* manager.configuredAgentOutcomesForRef(ref, "projected", {
            sourceRoot: sourceDir,
          });
          expect(validated).toEqual(unvalidated);
          return validated.map(({ agentId, outcome, reasonCode, reason }) => ({
            agentId,
            outcome,
            reasonCode,
            reason,
          }));
        }).pipe(
          Effect.provide(
            makeTestLayer({ axmDir: nodePath.join(tmpDir, "project", ".axm"), agents }),
          ),
        );
      const unsupportedOutcomes = [
        {
          agentId: "cline",
          outcome: "unsupported",
          reasonCode: "subagent-native-writer-unavailable",
          reason: "Native Subagent ownership proof is not supported for cline",
        },
        {
          agentId: "codex",
          outcome: "unsupported",
          reasonCode: "subagent-placement-unsupported",
          reason: "no native surface",
        },
      ];
      return Effect.gen(function* () {
        // No configured agent can realize the Subagent.
        expect(yield* outcomesWith(unsupported)).toEqual(unsupportedOutcomes);
        expect(yield* outcomesWith([codingAgentForId("claude-code"), ...unsupported])).toEqual([
          {
            agentId: "claude-code",
            outcome: "projected",
            reasonCode: "subagent-native-implementation",
            reason: expect.stringContaining("implementation for"),
          },
          ...unsupportedOutcomes,
        ]);
      });
    });

    it.effect("observes a projection with one preparation per configured agent", () => {
      const { sourceDir, resource, layer } = resourceFixture();
      const spans = makeSpanCounter();
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const recording = yield* FileSystemRecorder;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        recording.reset();
        const observed = yield* manager.projectionObservation(ref, { sourceRoot: sourceDir });
        expect(spans.count("axm.subagent.prepare")).toBe(2);
        expect(spans.count("axm.subagent.compile")).toBe(2);
        expect(recording.contentReads(resource)).toBe(1);
        expect(observed.present).toBe(false);
        expect(observed.current).toBe(false);
        expect(observed.targets?.map(({ change }) => change)).toEqual(["created", "created"]);
      }).pipe(
        Effect.provide(layer),
        Effect.withTracer(spans.tracer),
        Effect.withTracerEnabled(true),
      );
    });

    it.effect(
      "observes a projection with one preparation per configured agent when it validates destinations",
      () => {
        const { sourceDir, resource, layer } = resourceFixture();
        const natives = [".claude/agents/planner.md", ".codex/agents/planner.toml"].map((unit) =>
          nodePath.join(tmpDir, "project", unit),
        );
        const spans = makeSpanCounter();
        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const recording = yield* FileSystemRecorder;
          const ref = makeLocalSubagentRef("planner", sourceDir);
          const measure = (options: { readonly validateDestinations?: boolean }) =>
            Effect.gen(function* () {
              spans.reset();
              recording.reset();
              const observed = yield* manager.projectionObservation(ref, {
                sourceRoot: sourceDir,
                ...options,
              });
              return {
                observed,
                prepare: spans.count("axm.subagent.prepare"),
                compile: spans.count("axm.subagent.compile"),
                resourceReads: recording.contentReads(resource),
                planInspections: natives.map((native) => recording.counts(native).stat ?? 0),
                destinationReads: natives.map((native) => recording.contentReads(native)),
              };
            });
          const validated = yield* measure({ validateDestinations: true });
          const unvalidated = yield* measure({});
          const counts = ({ observed: _observed, ...work }: typeof validated) => work;
          expect({ validated: counts(validated), unvalidated: counts(unvalidated) }).toEqual({
            // The refusing preflight's preparation, plan and the bytes it read
            // to refuse an unrecorded file serve the observation, which judges
            // each write from those bytes.
            validated: {
              prepare: 2,
              compile: 2,
              resourceReads: 1,
              planInspections: [3, 3],
              destinationReads: [1, 1],
            },
            // Without destination checks the call prepares each agent once, as before.
            unvalidated: {
              prepare: 2,
              compile: 2,
              resourceReads: 1,
              planInspections: [3, 3],
              destinationReads: [1, 1],
            },
          });
          expect(validated.observed).toEqual(unvalidated.observed);
        }).pipe(
          Effect.provide(layer),
          Effect.withTracer(spans.tracer),
          Effect.withTracerEnabled(true),
        );
      },
    );

    it.effect("judges a validated observation's writes from the bytes its preflight read", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const projectDir = nodePath.join(tmpDir, "project");
      const axmDir = nodePath.join(projectDir, ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });
      const native = nodePath.join(projectDir, ".claude/agents/planner.md");
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const recording = yield* FileSystemRecorder;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        const measure = (validateDestinations: boolean) =>
          Effect.gen(function* () {
            recording.reset();
            const observed = yield* manager.projectionObservation(ref, {
              sourceRoot: sourceDir,
              validateDestinations,
            });
            return { observed, reads: recording.contentReads(native) };
          });
        yield* manager.materializeInstall({ ref });

        // A current recorded row is read only to refuse an unrecorded file.
        const current = { validated: yield* measure(true), unvalidated: yield* measure(false) };
        expect([current.validated.reads, current.unvalidated.reads]).toEqual([1, 0]);
        expect(current.validated.observed).toEqual(current.unvalidated.observed);
        expect(current.validated.observed.targets).toBeUndefined();

        // A stale row over a hand edit is judged modified from one read.
        writeSubagentPackage(sourceDir, "planner", "Plans work carefully");
        nodeFs.writeFileSync(native, "Edited by hand\n");
        const stale = { validated: yield* measure(true), unvalidated: yield* measure(false) };
        expect([stale.validated.reads, stale.unvalidated.reads]).toEqual([1, 1]);
        expect(stale.validated.observed).toEqual(stale.unvalidated.observed);
        expect(stale.validated.observed.targets).toEqual([
          { path: ".claude/agents/planner.md", change: "updated", lastWrite: "modified" },
        ]);

        // A read phase whose port is not the preflight's judges through its own port.
        recording.reset();
        const phased = yield* inEndingReadPhase(
          manager.projectionObservation(ref, { sourceRoot: sourceDir, validateDestinations: true }),
        );
        expect(phased).toEqual(stale.validated.observed);
        expect(recording.contentReads(native)).toBe(2);

        // A read phase over the preflight's own port shares its bytes only
        // while it holds; once it ends after the preflight's read, the write
        // judgment reads the file live.
        const inOwnPortReadPhase = (isActive: () => boolean) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            recording.reset();
            const observed = yield* manager
              .projectionObservation(ref, { sourceRoot: sourceDir, validateDestinations: true })
              .pipe(
                Effect.provideService(CurrentWorkspaceReadPhase, {
                  location: yield* WorkspaceLocation,
                  observations: false,
                  stateLoaders: () => Effect.die("The read phase fixture loads no state"),
                  fileSystem,
                  readers: {
                    desired: yield* DesiredStateReader,
                    settings: yield* SettingsReader,
                    locks: yield* LockfileReader,
                  },
                  records: yield* WorkspaceRecords,
                  packDocuments: new Map(),
                  isActive,
                  endedBy: () => (isActive() ? undefined : "mutation"),
                  close: () => undefined,
                }),
              );
            return { observed, reads: recording.contentReads(native) };
          });
        const held = yield* inOwnPortReadPhase(() => true);
        expect(held).toEqual({ observed: stale.validated.observed, reads: 1 });
        const ended = yield* inOwnPortReadPhase(() => recording.contentReads(native) === 0);
        expect(ended).toEqual({ observed: stale.validated.observed, reads: 2 });
        expect(nodeFs.readFileSync(native, "utf8")).toBe("Edited by hand\n");
      }).pipe(Effect.provide(makeTestLayer({ axmDir, agents: [codingAgentForId("claude-code")] })));
    });

    it.effect("hashes an authored package itself once its install writes inside it", () => {
      const projectDir = nodePath.join(tmpDir, "project");
      const packageRoot = nodePath.join(projectDir, "subagents", "planner");
      writeSubagentPackage(packageRoot, "planner", "Plans work");
      // An agent whose Subagent directory lies inside the authored package.
      const inside = makeMockCodingAgent("claude-code", {
        resolveEffectiveSubagentsDir: () =>
          Effect.succeed({
            _tag: "supported",
            dir: nodePath.join(packageRoot, "agents"),
            warnings: [],
          }),
      });
      const name = extensionName("planner");
      const ref: WorkspaceSubagentRef = {
        type: "subagent",
        refType: "workspace",
        source: { type: "workspace", owner: handle("@acme"), extensionType: "subagent", name },
        owner: handle("@acme"),
        name,
        version: exactVersion("1.0.0"),
        scope: "project",
        location: packageRoot,
        sourceHash: SourceHashSchema.make("0".repeat(64)),
        subagent: { name, description: Option.none() },
      };
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const work = workObservations(false);
        const facts = yield* manager
          .materializeInstall({
            ref,
            preparedSourceHash: { root: packageRoot, hash: ref.sourceHash },
          })
          .pipe(work.provide);
        expect(nodeFs.existsSync(nodePath.join(packageRoot, "agents", "planner.md"))).toBe(true);
        expect(work.facts.filter((fact) => fact.kind === "axm.hash.package").length).toBe(1);
        // The recorded hash covers the native file this install wrote there.
        expect(facts.sourceHash).toEqual(
          Option.some(yield* computePackageContentHash(packageRoot)),
        );
      }).pipe(
        Effect.provide(
          makeTestLayer({ axmDir: nodePath.join(projectDir, ".axm"), agents: [inside] }),
        ),
      );
    });

    it.effect(
      "refuses an unrecorded differing file when an observation validates destinations",
      () => {
        const sourceDir = nodePath.join(tmpDir, "source", "planner");
        writeSubagentPackage(sourceDir, "planner", "Plans work");
        const projectDir = nodePath.join(tmpDir, "project");
        nodeFs.mkdirSync(nodePath.join(projectDir, ".axm"), { recursive: true });
        const native = nodePath.join(projectDir, ".claude/agents/planner.md");
        nodeFs.mkdirSync(nodePath.dirname(native), { recursive: true });
        nodeFs.writeFileSync(native, "Written by hand\n");
        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const ref = makeLocalSubagentRef("planner", sourceDir);
          const error = yield* manager
            .projectionObservation(ref, { sourceRoot: sourceDir, validateDestinations: true })
            .pipe(Effect.flip);
          expect(error).toMatchObject({
            _tag: "SubagentNativeConflict",
            problem: { code: "projection-output-unrecorded", paths: [native] },
          });
          expect(describeTestFailure(error)).toContain(
            `Existing Subagent file has no recorded projection: ${native}`,
          );
          // Without destination checks the same file only reads as not current.
          const observed = yield* manager.projectionObservation(ref, { sourceRoot: sourceDir });
          expect(observed.current).toBe(false);
          expect(nodeFs.readFileSync(native, "utf8")).toBe("Written by hand\n");
        }).pipe(
          Effect.provide(
            makeTestLayer({
              axmDir: nodePath.join(projectDir, ".axm"),
              agents: [codingAgentForId("claude-code")],
            }),
          ),
        );
      },
    );

    it.effect("refuses a misconfigured placement through the destination preflight", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const misconfigured = makeMockCodingAgent("claude-code", {
        resolveEffectiveSubagentsDir: () =>
          Effect.succeed({ _tag: "misconfigured", reason: "Subagent directory is not a folder" }),
      });
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        const outcomes = yield* manager
          .configuredAgentOutcomesForRef(ref, "projected", {
            sourceRoot: sourceDir,
            validateDestinations: true,
          })
          .pipe(Effect.flip);
        const observation = yield* manager
          .projectionObservation(ref, { sourceRoot: sourceDir })
          .pipe(Effect.flip);
        for (const error of [outcomes, observation])
          expect(error).toMatchObject({
            _tag: "SubagentDefinitionInvalid",
            detail: "Subagent directory is not a folder",
          });
      }).pipe(
        Effect.provide(
          makeTestLayer({
            axmDir: nodePath.join(tmpDir, "project", ".axm"),
            agents: [misconfigured],
          }),
        ),
      );
    });

    it.effect("probes a recorded planned file once per observation", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const projectDir = nodePath.join(tmpDir, "project");
      const axmDir = nodePath.join(projectDir, ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });
      const native = nodePath.join(projectDir, ".claude/agents/planner.md");
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const recording = yield* FileSystemRecorder;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        const probes = () => recording.calls({ path: native, method: "access" }).length;

        // A planned file without a recorded row is probed once, as before.
        recording.reset();
        const unrecorded = yield* manager.projectionObservation(ref, { sourceRoot: sourceDir });
        expect(probes()).toBe(1);
        expect(unrecorded.current).toBe(false);

        yield* manager.materializeInstall({ ref });
        recording.reset();
        const recorded = yield* manager.projectionObservation(ref);
        expect(probes()).toBe(1);
        expect(recorded).toMatchObject({ present: true, current: true });
        expect(recorded.targets).toBeUndefined();

        // A recorded file that is gone still reads as not current and as created.
        nodeFs.rmSync(native);
        recording.reset();
        const missing = yield* manager.projectionObservation(ref);
        expect(probes()).toBe(1);
        expect(missing).toMatchObject({ present: false, current: false });
        expect(missing.targets).toEqual([{ path: ".claude/agents/planner.md", change: "created" }]);
      }).pipe(Effect.provide(makeTestLayer({ axmDir, agents: [codingAgentForId("claude-code")] })));
    });

    it.effect(
      "probes a recorded file through its alias entry only when the root is an alias",
      () => {
        const sourceDir = nodePath.join(tmpDir, "source", "planner");
        writeSubagentPackage(sourceDir, "planner", "Plans work");
        const realDir = nodePath.join(tmpDir, "real-project");
        const projectDir = nodePath.join(tmpDir, "project");
        nodeFs.mkdirSync(nodePath.join(realDir, ".axm"), { recursive: true });
        nodeFs.symlinkSync(realDir, projectDir, "dir");
        const entry = nodePath.join(projectDir, ".claude/agents/planner.md");
        const referent = nodePath.join(realDir, ".claude/agents/planner.md");
        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const recording = yield* FileSystemRecorder;
          const ref = makeLocalSubagentRef("planner", sourceDir);
          yield* manager.materializeInstall({ ref });
          recording.reset();
          expect((yield* manager.projectionObservation(ref)).current).toBe(true);
          expect(recording.calls({ path: entry, method: "access" }).length).toBe(1);
          expect(recording.calls({ path: referent, method: "access" }).length).toBe(0);
        }).pipe(
          Effect.provide(
            makeTestLayer({
              axmDir: nodePath.join(projectDir, ".axm"),
              agents: [codingAgentForId("claude-code")],
            }),
          ),
        );
      },
    );

    it.effect("probes each spelling of a file shared by aliased readers once", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const projectDir = nodePath.join(tmpDir, "project");
      const physical = nodePath.join(projectDir, ".claude/agents");
      const alias = nodePath.join(projectDir, ".cursor/agents");
      nodeFs.mkdirSync(physical, { recursive: true });
      nodeFs.mkdirSync(nodePath.dirname(alias), { recursive: true });
      nodeFs.symlinkSync(physical, alias, "dir");
      const physicalFile = nodePath.join(physical, "planner.md");
      const aliasFile = nodePath.join(alias, "planner.md");
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const recording = yield* FileSystemRecorder;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        yield* manager.materializeInstall({ ref });
        recording.reset();
        const observed = yield* manager.projectionObservation(ref);
        expect(observed).toMatchObject({ present: true, current: true });
        expect(recording.calls({ path: physicalFile, method: "access" }).length).toBe(1);
        expect(recording.calls({ path: aliasFile, method: "access" }).length).toBe(1);
      }).pipe(
        Effect.provide(
          makeTestLayer({
            axmDir: nodePath.join(projectDir, ".axm"),
            agents: [codingAgentForId("claude-code"), codingAgentForId("cursor")],
          }),
        ),
      );
    });

    /** Claude Code and Cursor reading one physical Subagent directory through an alias. */
    const aliasedReadersFixture = () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const projectDir = nodePath.join(tmpDir, "project");
      const physical = nodePath.join(projectDir, ".claude/agents");
      const alias = nodePath.join(projectDir, ".cursor/agents");
      nodeFs.mkdirSync(physical, { recursive: true });
      nodeFs.mkdirSync(nodePath.dirname(alias), { recursive: true });
      nodeFs.symlinkSync(physical, alias, "dir");
      return {
        sourceDir,
        projectDir,
        physical,
        alias,
        physicalFile: nodePath.join(physical, "planner.md"),
        aliasFile: nodePath.join(alias, "planner.md"),
        layer: makeTestLayer({
          axmDir: nodePath.join(projectDir, ".axm"),
          agents: [codingAgentForId("claude-code"), codingAgentForId("cursor")],
        }),
      };
    };

    it.effect("locates each planned output and its readers once per observation", () => {
      const fixture = aliasedReadersFixture();
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const recording = yield* FileSystemRecorder;
        const ref = makeLocalSubagentRef("planner", fixture.sourceDir);
        yield* manager.materializeInstall({ ref });
        const work = () => ({
          outputLinks: [fixture.physicalFile, fixture.aliasFile].map(
            (file) => recording.counts(file).readLink ?? 0,
          ),
          readerDirectories: [fixture.physical, fixture.alias].map(
            (directory) => recording.counts(directory).realPath ?? 0,
          ),
          rootLinks: recording.counts(fixture.projectDir).readLink ?? 0,
        });
        recording.reset();
        const observed = yield* manager.projectionObservation(ref);
        expect(observed).toMatchObject({ present: true, current: true });
        // The plan's containment gives each output its destination, and one
        // capture locates both outputs and every reader; the inventory of
        // Subagent containers is the rest.
        expect(work()).toEqual({ outputLinks: [5, 2], readerDirectories: [2, 3], rootLinks: 2 });
        expect(observed.nativeLocations).toEqual([
          expect.objectContaining({
            address: { kind: "file", path: fixture.physicalFile },
            aliases: [fixture.physicalFile, fixture.aliasFile],
            configuredConsumers: ["claude-code", "cursor"],
            potentialReaders: ["claude-code", "cursor"],
            ownership: "owned",
            proof: "declared-native-path",
          }),
        ]);
      }).pipe(Effect.provide(fixture.layer));
    });

    it.effect("locates outputs and readers again once the read phase ends", () => {
      const fixture = aliasedReadersFixture();
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const recording = yield* FileSystemRecorder;
        const ref = makeLocalSubagentRef("planner", fixture.sourceDir);
        yield* manager.materializeInstall({ ref });
        const observe = (endsAt?: string) =>
          Effect.gen(function* () {
            recording.reset();
            const observed = yield* inEndingReadPhase(manager.projectionObservation(ref), endsAt);
            return {
              observed,
              outputLinks: [fixture.physicalFile, fixture.aliasFile].map(
                (file) => recording.counts(file).readLink ?? 0,
              ),
              readerDirectories: [fixture.physical, fixture.alias].map(
                (directory) => recording.counts(directory).realPath ?? 0,
              ),
              rootLinks: recording.counts(fixture.projectDir).readLink ?? 0,
            };
          });
        const held = yield* observe();
        expect(held).toMatchObject({
          outputLinks: [5, 2],
          readerDirectories: [2, 3],
          rootLinks: 2,
        });
        // Ending at the second output's probe leaves its destination to the
        // plan but locates it and its readers again.
        const second = yield* observe(fixture.aliasFile);
        expect(second.observed).toEqual(held.observed);
        expect(second).toMatchObject({
          outputLinks: [6, 3],
          readerDirectories: [3, 4],
          rootLinks: 2,
        });
        // Ending at the first output's probe asserts the second output's
        // containment again and locates each output on its own.
        const first = yield* observe(fixture.physicalFile);
        expect(first.observed).toEqual(held.observed);
        expect(first).toMatchObject({
          outputLinks: [7, 3],
          readerDirectories: [3, 5],
          rootLinks: 3,
        });
      }).pipe(Effect.provide(fixture.layer));
    });

    it.effect("locates nothing more for a Subagent no configured agent can place", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const unplaced = makeMockCodingAgent("codex", {
        resolveEffectiveSubagentsDir: () =>
          Effect.succeed({ _tag: "unsupported", reason: "no native surface" }),
      });
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const recording = yield* FileSystemRecorder;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        recording.reset();
        const observed = yield* manager.projectionObservation(ref, { sourceRoot: sourceDir });
        expect(observed.nativeLocations).toEqual([]);
        // Only the inventory of Subagent containers resolves the reader directory.
        expect(
          recording.counts(nodePath.join(tmpDir, "project", ".codex/agents")).realPath ?? 0,
        ).toBe(1);
      }).pipe(
        Effect.provide(
          makeTestLayer({
            axmDir: nodePath.join(tmpDir, "project", ".axm"),
            agents: [codingAgentForId("cline"), unplaced],
          }),
        ),
      );
    });

    it.effect("prepares again once the read phase the preflight observed through ends", () => {
      const { sourceDir, resource, layer } = resourceFixture();
      const native = nodePath.join(tmpDir, "project", ".claude/agents/planner.md");
      const spans = makeSpanCounter();
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const recording = yield* FileSystemRecorder;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        const outcomes = (endsAt?: string) =>
          inEndingReadPhase(
            manager.configuredAgentOutcomesForRef(ref, "projected", {
              sourceRoot: sourceDir,
              validateDestinations: true,
            }),
            endsAt,
          );
        const observation = (endsAt?: string) =>
          inEndingReadPhase(manager.projectionObservation(ref, { sourceRoot: sourceDir }), endsAt);

        const held = yield* outcomes();
        expect(spans.count("axm.subagent.prepare")).toBe(2);
        spans.reset();
        expect(yield* outcomes(resource)).toEqual(held);
        expect(spans.count("axm.subagent.prepare")).toBe(4);

        // Planning inspects each planned native file; a plan made again after
        // the phase ends shows as further inspections of that file.
        const planInspections = () => recording.counts(native).stat ?? 0;
        spans.reset();
        recording.reset();
        const observed = yield* observation();
        expect(spans.count("axm.subagent.prepare")).toBe(2);
        expect(planInspections()).toBe(3);
        spans.reset();
        recording.reset();
        expect(yield* observation(resource)).toEqual(observed);
        expect(spans.count("axm.subagent.prepare")).toBe(4);
        expect(planInspections()).toBe(5);
      }).pipe(
        Effect.provide(layer),
        Effect.withTracer(spans.tracer),
        Effect.withTracerEnabled(true),
      );
    });

    /** An accepted Registry Subagent whose canonical package is on disk. */
    const registryCanonicalFixture = () => {
      const projectDir = nodePath.join(tmpDir, "project");
      const canonicalDir = nodePath.join(
        projectDir,
        "agent_extensions",
        "registry.agentxm.ai",
        "@acme",
        "subagents",
        "planner",
      );
      writeSubagentPackage(canonicalDir, "planner", "Plans work");
      return {
        canonicalDir,
        manifest: nodePath.join(canonicalDir, "subagent.json"),
        layer: makeTestLayer({
          axmDir: nodePath.join(projectDir, ".axm"),
          configuredSubagents: { planner: { source: "@acme/subagents/planner", enabled: true } },
          lockedSubagents: {
            planner: {
              source: { type: "registry", url: TEST_REGISTRY_ENDPOINT },
              identity: { owner: handle("@acme"), name: extensionName("planner") },
              resolved: {
                version: exactVersion("1.0.0"),
                integrity: "sha512-test",
                publisherBindingId: "hbnd_test",
              },
              treeIntegrity: TEST_TREE_INTEGRITY,
            },
          },
        }),
      };
    };

    /** A native file AXM recorded writing, with the bytes it recorded. */
    const recordNativeFile = (projectDir: string, unit: string, content: string) =>
      Effect.gen(function* () {
        const file = nodePath.join(projectDir, unit);
        nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
        nodeFs.writeFileSync(file, content);
        const accepted = yield* AcceptedResolutionWriter;
        yield* accepted.withBatch(
          accepted.stageProjections([
            {
              kind: "subagents",
              path: ProjectionUnitPathSchema.make(unit),
              row: { output: yield* projectionOutputDigest(content) },
            },
          ]),
        );
        return file;
      });

    for (const removal of ["materializeUninstall", "materializeDeactivate"] as const)
      it.effect(`${removal} observes the accepted canonical tree once`, () => {
        const { canonicalDir, manifest, layer } = registryCanonicalFixture();
        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const recording = yield* FileSystemRecorder;
          const observed = workObservations(false);
          recording.reset();
          yield* manager[removal]({ target: { type: "subagent", name: "planner" } }).pipe(
            observed.provide,
          );
          // One observation reads the manifest as text, loads the package
          // through the contained loader and hashes the tree; the withdrawal's
          // native names come from that load.
          expect(recording.contentReads(manifest)).toBe(3);
          expect(
            observed.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length,
          ).toBe(1);
          expect(nodeFs.existsSync(canonicalDir)).toBe(removal === "materializeDeactivate");
        }).pipe(Effect.provide(layer));
      });

    it.effect("withdraws the native names the observed accepted package renders", () => {
      const { canonicalDir, manifest, layer } = registryCanonicalFixture();
      // The package renders under a native name other than its own.
      nodeFs.writeFileSync(
        manifest,
        JSON.stringify({
          owner: "@acme",
          type: "subagent",
          name: "planner",
          version: "1.0.0",
          description: "Plans work",
          core: { name: "reviewer", instructions: "src/planner.md" },
        }),
      );
      const native = nodePath.join(tmpDir, "project", ".claude/agents/reviewer.md");
      nodeFs.mkdirSync(nodePath.dirname(native), { recursive: true });
      nodeFs.writeFileSync(native, "Reviewer as AXM wrote it\n");
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const accepted = yield* AcceptedResolutionWriter;
        yield* accepted.withBatch(
          accepted.stageProjections([
            {
              kind: "subagents",
              path: ProjectionUnitPathSchema.make(".claude/agents/reviewer.md"),
              row: { output: yield* projectionOutputDigest("Reviewer as AXM wrote it\n") },
            },
          ]),
        );
        const result = yield* manager.materializeUninstall({
          target: { type: "subagent", name: "planner" },
        });
        expect(nodeFs.existsSync(native)).toBe(false);
        expect(result.observation.targets).toEqual([
          { path: ".claude/agents/reviewer.md", agentIds: ["claude-code"] },
        ]);
        expect((yield* accepted.projectionRows("subagents")).size).toBe(0);
        expect(nodeFs.existsSync(canonicalDir)).toBe(false);
      }).pipe(Effect.provide(layer));
    });

    it.effect("retires a canonical package whose content cannot be loaded", () => {
      const { canonicalDir, manifest, layer } = registryCanonicalFixture();
      // The manifest names an instruction file the package does not hold.
      nodeFs.rmSync(nodePath.join(canonicalDir, "src", "planner.md"));
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const recording = yield* FileSystemRecorder;
        const accepted = yield* AcceptedResolutionWriter;
        const native = yield* recordNativeFile(
          nodePath.join(tmpDir, "project"),
          ".claude/agents/planner.md",
          "Planner as AXM wrote it\n",
        );
        recording.reset();
        const result = yield* manager.materializeUninstall({
          target: { type: "subagent", name: "planner" },
        });
        expect(recording.contentReads(manifest)).toBe(2);
        // Without a loadable package the Subagent's own name is withdrawn.
        expect(nodeFs.existsSync(native)).toBe(false);
        expect(result.observation.targets).toEqual([
          { path: ".claude/agents/planner.md", agentIds: ["claude-code"] },
        ]);
        expect((yield* accepted.projectionRows("subagents")).size).toBe(0);
        expect(nodeFs.existsSync(canonicalDir)).toBe(false);
      }).pipe(Effect.provide(layer));
    });

    it.effect("never loads a manifest that escapes its package to derive native names", () => {
      const { canonicalDir, manifest, layer } = registryCanonicalFixture();
      const outside = nodePath.join(tmpDir, "outside.json");
      nodeFs.renameSync(manifest, outside);
      nodeFs.symlinkSync(outside, manifest);
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const recording = yield* FileSystemRecorder;
        const accepted = yield* AcceptedResolutionWriter;
        const native = yield* recordNativeFile(
          nodePath.join(tmpDir, "project"),
          ".claude/agents/planner.md",
          "Planner as AXM wrote it\n",
        );
        recording.reset();
        const result = yield* manager.materializeDeactivate({
          target: { type: "subagent", name: "planner" },
        });
        // Only the observation's lexical read reaches the linked manifest; the
        // contained loader refuses it before reading.
        expect(recording.contentReads(manifest)).toBe(1);
        expect(recording.contentReads(outside)).toBe(0);
        // The names fall back to the Subagent's own, which is withdrawn.
        expect(nodeFs.existsSync(native)).toBe(false);
        expect(result.observation.targets).toEqual([
          { path: ".claude/agents/planner.md", agentIds: ["claude-code"] },
        ]);
        expect((yield* accepted.projectionRows("subagents")).size).toBe(0);
        expect(nodeFs.existsSync(canonicalDir)).toBe(true);
      }).pipe(Effect.provide(layer));
    });

    /**
     * A local Subagent installed once from its source, and a ref to the same
     * package whose location is its canonical copy: installing that ref
     * acquires the canonical tree in place.
     */
    const inPlaceFixture = () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const projectDir = nodePath.join(tmpDir, "project");
      const axmDir = nodePath.join(projectDir, ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });
      const canonicalDir = nodePath.join(
        projectDir,
        "agent_extensions",
        "_local",
        "project",
        "sources",
        "planner",
      );
      return {
        sourceDir,
        canonicalDir,
        native: nodePath.join(projectDir, ".claude/agents/planner.md"),
        source: makeLocalSubagentRef("planner", sourceDir),
        inPlace: makeLocalSubagentRef("planner", canonicalDir),
        layer: makeTestLayer({ axmDir, agents: [codingAgentForId("claude-code")] }),
        /** The same workspace with an accepted lockfile. */
        layerWith: (lockedSubagents: Readonly<Record<string, SubagentLockEntry>>) =>
          makeTestLayer({ axmDir, agents: [codingAgentForId("claude-code")], lockedSubagents }),
      };
    };

    for (const scenario of [
      { label: "a recorded file", present: true, inPlace: true, reads: 2 },
      { label: "an absent recorded file", present: false, inPlace: true, reads: 2 },
      { label: "a recorded file of a staged install", present: true, inPlace: false, reads: 3 },
    ] as const)
      it.effect(`reads ${scenario.label} once per validated tree and once to write it`, () => {
        const { canonicalDir, native, source, inPlace, layer } = inPlaceFixture();
        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const recording = yield* FileSystemRecorder;
          yield* manager.materializeInstall({ ref: source });
          expect(nodeFs.existsSync(nodePath.join(canonicalDir, "subagent.json"))).toBe(true);
          if (!scenario.present) nodeFs.rmSync(native);
          recording.reset();
          yield* manager.materializeInstall({ ref: scenario.inPlace ? inPlace : source });
          // The source is validated before acquisition. A tree acquired in
          // place is that same content: its validation judges the bytes the
          // first read found. A staged copy is judged on bytes read again.
          // The write always reads the file once more under its exclusive lock.
          expect(recording.contentReads(native)).toBe(scenario.reads);
          expect(nodeFs.readFileSync(native, "utf8")).toContain("Plans work");
        }).pipe(Effect.provide(layer));
      });

    /** Filesystem calls under the package's staging tree. */
    const stagedCalls =
      (canonicalDir: string) =>
      (recording: { readonly calls: () => ReadonlyArray<{ readonly path: string }> }) =>
        recording
          .calls()
          .filter((call) =>
            call.path.startsWith(canonicalMaterializationPaths(canonicalDir).stagingPath),
          );

    it.effect(
      "reads a recorded file once more to keep an acquisition already made in this candidate",
      () => {
        const { canonicalDir, native, source, layer } = inPlaceFixture();
        const staged = stagedCalls(canonicalDir);
        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const recording = yield* FileSystemRecorder;
          const acquired = {
            materializedPackages: yield* Ref.make<ReadonlyMap<string, TreeIntegrity>>(new Map()),
            requestedKeys: new Set<string>(),
            filesByKey: new Map(),
            failuresByKey: new Map(),
          };
          const install = manager
            .materializeInstall({ ref: source })
            .pipe(Effect.provideService(AcquiredContent, acquired));
          yield* install;
          recording.reset();
          // The second install keeps the canonical tree the first published:
          // its validation judges the bytes the source validation read.
          yield* install;
          expect(staged(recording)).toEqual([]);
          expect(recording.contentReads(native)).toBe(2);
          expect(nodeFs.readFileSync(native, "utf8")).toContain("Plans work");
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect("reads a recorded file once more to keep a retained package's canonical tree", () => {
      const { sourceDir, canonicalDir, native, source, layerWith } = inPlaceFixture();
      const staged = stagedCalls(canonicalDir);
      // Another accepted component of the same path package retains its tree.
      nodeFs.cpSync(sourceDir, canonicalDir, { recursive: true });
      nodeFs.mkdirSync(nodePath.dirname(native), { recursive: true });
      return computeMaterializedTreeIntegrity(sourceDir).pipe(
        Effect.provide(Layer.mergeAll(NativePlatformTest, NodeFileSystem.layer)),
        Effect.flatMap((tree) =>
          Effect.gen(function* () {
            const manager = yield* SubagentManager;
            const recording = yield* FileSystemRecorder;
            recording.reset();
            yield* manager.materializeInstall({ ref: source });
            expect(staged(recording)).toEqual([]);
            // The source validation reads the absent file, the kept canonical
            // tree is judged on that read, and the write reads it again.
            expect(recording.contentReads(native)).toBe(2);
            expect(nodeFs.readFileSync(native, "utf8")).toContain("Plans work");
          }).pipe(
            Effect.provide(
              layerWith({
                "retained-planner": {
                  source: { type: "path", path: decodeRelativePathSync("sources/planner") },
                  identity: { owner: handle("@acme"), name: extensionName("planner") },
                  resolved: { tree },
                  treeIntegrity: tree,
                },
              }),
            ),
          ),
        ),
      );
    });

    it.effect("refuses a file that appears after validation when it is written in place", () => {
      const { canonicalDir, native, inPlace, layer } = inPlaceFixture();
      writeSubagentPackage(canonicalDir, "planner", "Plans work");
      const foreign = "Foreign planner\n";
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const accepted = yield* AcceptedResolutionWriter;
        const base = yield* FileSystem.FileSystem;
        // A foreign writer creates the native file once the package has been
        // loaded for validation before acquisition.
        let loads = 0;
        const { fileSystem } = makeRecordingFileSystem({
          ...base,
          realPath: (path) =>
            Effect.andThen(
              Effect.sync(() => {
                if (path !== canonicalDir || ++loads !== 2) return;
                nodeFs.mkdirSync(nodePath.dirname(native), { recursive: true });
                nodeFs.writeFileSync(native, foreign);
              }),
              base.realPath(path),
            ),
        });
        const error = yield* manager
          .materializeInstall({ ref: inPlace })
          .pipe(Effect.provideService(FileSystem.FileSystem, fileSystem), Effect.flip);
        expect(loads).toBeGreaterThanOrEqual(2);
        expect(describeTestFailure(error)).toContain(
          `Existing Subagent file has no recorded projection: ${native}`,
        );
        expect(nodeFs.readFileSync(native, "utf8")).toBe(foreign);
        expect((yield* accepted.projectionRows("subagents")).size).toBe(0);
      }).pipe(Effect.provide(layer));
    });

    it.effect("judges a staged copy on the bytes its own native destination holds", () => {
      const { canonicalDir, source, layer } = inPlaceFixture();
      // The native directory resolves into the package's staging tree, which a
      // prior interruption left without the planned file.
      const { stagingPath } = canonicalMaterializationPaths(canonicalDir);
      nodeFs.mkdirSync(nodePath.join(stagingPath, "src"), { recursive: true });
      const agents = nodePath.join(tmpDir, "project", ".claude", "agents");
      nodeFs.mkdirSync(nodePath.dirname(agents), { recursive: true });
      nodeFs.symlinkSync(nodePath.join(stagingPath, "src"), agents, "dir");
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const error = yield* manager.materializeInstall({ ref: source }).pipe(Effect.flip);
        // Staging copies the authored `src/planner.md` there before its
        // validation, which reads that file fresh and refuses it.
        expect(error).toMatchObject({
          _tag: "SubagentNativeConflict",
          problem: { code: "projection-output-unrecorded" },
        });
        expect(nodeFs.existsSync(canonicalDir)).toBe(false);
      }).pipe(Effect.provide(layer));
    });

    it.effect("probes a recorded file again once the read phase it was probed in ends", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const projectDir = nodePath.join(tmpDir, "project");
      const axmDir = nodePath.join(projectDir, ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });
      const native = nodePath.join(projectDir, ".claude/agents/planner.md");
      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const recording = yield* FileSystemRecorder;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        const probes = () => recording.calls({ path: native, method: "access" }).length;
        yield* manager.materializeInstall({ ref });

        recording.reset();
        const held = yield* inEndingReadPhase(manager.projectionObservation(ref));
        expect(probes()).toBe(1);
        recording.reset();
        expect(yield* inEndingReadPhase(manager.projectionObservation(ref), native)).toEqual(held);
        expect(probes()).toBe(2);
        expect(held).toMatchObject({ present: true, current: true });
      }).pipe(Effect.provide(makeTestLayer({ axmDir, agents: [codingAgentForId("claude-code")] })));
    });
  });
});
