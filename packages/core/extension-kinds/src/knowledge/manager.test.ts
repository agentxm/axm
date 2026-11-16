import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {
  UNCONSTRAINED_DESIRED_NODE,
  computeSourceHash,
  type KnowledgeLockEntry,
  AcceptedResolutionWriter,
  CurrentWorkspaceReadPhase,
  DesiredStateReader,
  DesiredStateWriter,
  LockfileReader,
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  WorkspaceRecords,
  type AcceptedResolutionWriterService,
  type ProjectionUnitPath,
  type RecordedProjectionRow,
  type DesiredStateWriterService,
  type SettingsWriterService,
  type WorkspaceRecordsService,
} from "@agentxm/workspace-kernel/workspace-state";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { canonicalMaterializationPaths } from "@agentxm/workspace-kernel/acquisition";
import {
  treeIntegrityOfSync,
  MockWorkspaceTransactionScope,
  readModelRecordStubs,
  WorkspaceReadTest,
  type WorkspaceReadTestFacts,
  describeTestFailure,
  exactVersion,
  extensionName,
  handle,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import * as Option from "effect/Option";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { KnowledgeManager } from "@agentxm/workspace-kernel/materialization";
import {
  applyPlannedProjections,
  observeObservedPlans,
} from "@agentxm/workspace-kernel/projection";
import { SourceHostProviders, SourceNotResolvable } from "@agentxm/workspace-kernel/sources";
import { FootprintRecorderTest } from "@agentxm/workspace-kernel/planning/testing";
import { StepFailure } from "@agentxm/workspace-kernel/operations";
import {
  buildInstallOperation,
  kernelFailureToStepFailure,
} from "@agentxm/workspace-kernel/reconciliation";
import type {
  KnowledgeExtensionRef,
  LocalKnowledgeRef,
  WorkspaceKnowledgeRef,
} from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import { KnowledgeManagerLive } from "./manager.js";
import { WorkspaceCatalogLive } from "@agentxm/workspace-kernel/sources/live";

const writeKnowledgePackage = (
  root: string,
  name: string,
  includeType: boolean,
  resource?: string,
) => {
  mkdirSync(nodePath.join(root, "src"), { recursive: true });
  writeFileSync(
    nodePath.join(root, "knowledge.json"),
    JSON.stringify(
      {
        owner: "@acme",
        type: "knowledge",
        name,
        version: "1.0.0",
        format: { name: "okf", version: "0.2" },
        bundleRoot: "src",
      },
      null,
      2,
    ),
  );
  writeFileSync(
    nodePath.join(root, "src", "index.md"),
    '---\nokf_version: "0.2"\n---\n# Knowledge\n',
  );
  writeFileSync(
    nodePath.join(root, "src", "concept.md"),
    `${includeType ? `---\ntype: concept${resource === undefined ? "" : `\nresource: ${resource}`}\n---\n` : ""}# A useful concept\n`,
  );
};

const localRef = (name: string, root: string): LocalKnowledgeRef => ({
  type: "knowledge",
  refType: "local",
  owner: handle("@acme"),
  name: extensionName(name),
  source: { type: "local", path: root },
  sourcePath: nodePath.basename(root),
  location: pathToFileURL(root).href,
  knowledge: { name: decodeExtensionNameSync(name) },
});

const workspaceRef = (name: string, root: string): Effect.Effect<WorkspaceKnowledgeRef> =>
  Effect.gen(function* () {
    return {
      type: "knowledge",
      refType: "workspace",
      source: {
        type: "workspace",
        owner: handle("@acme"),
        extensionType: "knowledge",
        name: extensionName(name),
      },
      owner: handle("@acme"),
      name: extensionName(name),
      version: exactVersion("1.0.0"),
      scope: "project",
      location: root,
      sourceHash: yield* computeSourceHash(name),
      knowledge: { name: decodeExtensionNameSync(name) },
    };
  });

/** Desired-state and lock overrides for a locally sourced `handbook` bundle. */
const desiredHandbookReadFacts = (
  workspaceRoot: string,
): Omit<WorkspaceReadTestFacts, "baseDir" | "runtimeDir"> => ({
  settings: { knowledge: { handbook: { source: "./source", enabled: true } } },
  acceptedResolutions: Effect.sync(() => ({
    lockfileVersion: 1 as const,
    skills: {},
    knowledge: {
      handbook: {
        source: { type: "path" as const, path: decodeRelativePathSync("source") },
        identity: { owner: handle("@acme"), name: extensionName("handbook") },
        resolved: { tree: treeIntegrityOfSync(nodePath.join(workspaceRoot, "source")) },
        treeIntegrity: treeIntegrityOfSync(nodePath.join(workspaceRoot, "source")),
      },
    },
  })),
  graph: {
    packMembership: [],
    nodes: [
      {
        type: "knowledge",
        name: "handbook",
        identity: { authority: "path", locator: "./source" },
        source: "./source",
        enabled: true,
        constraint: UNCONSTRAINED_DESIRED_NODE,
        origins: [{ type: "settings", source: "./source", enabled: true }],
      },
    ],
    mcpSourceClosures: [],
    problems: [],
  },
});

/**
 * A direct Knowledge install is the shared install recipe over the production
 * manager: the same closure the lifecycle command runs, so the settings and
 * accepted-resolution writes the manager causes are the recipe's.
 */
const installKnowledge = (ref: KnowledgeExtensionRef) =>
  Effect.gen(function* () {
    const manager = yield* KnowledgeManager;
    const step = buildInstallOperation(manager, {
      ref,
      declaration: { name: ref.knowledge.name, versionRange: Option.none() },
      toStepFailure: kernelFailureToStepFailure,
    });
    if (step.readiness === "error") {
      return yield* new StepFailure({ category: "internal", detail: step.errorMessage });
    }
    return yield* step.run;
  });

const managerLayer = (
  workspaceRoot: string,
  options: {
    readonly read?: Omit<WorkspaceReadTestFacts, "baseDir" | "runtimeDir">;
    readonly records?: Partial<WorkspaceRecordsService>;
    readonly settingsWriter?: Partial<SettingsWriterService>;
    readonly desiredStateWriter?: Partial<DesiredStateWriterService>;
    readonly acceptedResolutionWriter?: Partial<AcceptedResolutionWriterService>;
    /** Replaces the native filesystem every service in the layer uses. */
    readonly fileSystem?: (native: FileSystem.FileSystem) => FileSystem.FileSystem;
  } = {},
) => {
  const axmDir = nodePath.join(workspaceRoot, ".axm");
  const wrapFileSystem = options.fileSystem;
  const platform =
    wrapFileSystem === undefined
      ? NativePlatformTest
      : Layer.provideMerge(
          Layer.effect(
            FileSystem.FileSystem,
            Effect.gen(function* () {
              return wrapFileSystem(yield* FileSystem.FileSystem);
            }),
          ),
          NativePlatformTest,
        );
  return KnowledgeManagerLive.pipe(
    Layer.provideMerge(WorkspaceCatalogLive),
    Layer.provideMerge(CodingAgentRepositoryLive),
    Layer.provideMerge(NativeWriteAuthorityLive),
    Layer.provideMerge(
      Layer.mergeAll(
        WorkspaceReadTest({
          baseDir: workspaceRoot,
          runtimeDir: axmDir,
          ...options.read,
          settings: { instructionFiles: {}, ...options.read?.settings },
          ...(options.records === undefined ? {} : { records: options.records }),
        }),
        Layer.mock(SettingsWriter, {
          setEntry: () => Effect.void,
          ...options.settingsWriter,
        }),
        Layer.mock(DesiredStateWriter, {
          declare: () => Effect.void,
          undeclare: () => Effect.void,
          ...options.desiredStateWriter,
        }),
        Layer.mock(AcceptedResolutionWriter, {
          setAccepted: () => Effect.void,
          removeAccepted: () => Effect.void,
          withBatch: (effect) => effect,
          projectionRows: () =>
            Effect.succeed(new Map<ProjectionUnitPath, RecordedProjectionRow>()),
          stageProjections: () => Effect.void,
          ...options.acceptedResolutionWriter,
        }),
        FootprintRecorderTest,
      ),
    ),
    Layer.provideMerge(MockWorkspaceTransactionScope(axmDir)),
    Layer.provide(
      Layer.succeed(SourceHostProviders, {
        resolveNamedRegistry: () => Effect.die("not used"),
        find: () => Effect.succeed([]),
        fetch: () =>
          Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
        acquireForTransition: () =>
          Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
        cloneUrl: () => Option.none(),
        origin: () => "test",
      }),
    ),
    Layer.provideMerge(WorkspaceFileWriteLocksLive),
    Layer.provideMerge(Layer.provideMerge(RegistryTransportTest(FetchHttpClient.layer), platform)),
  );
};

describe("KnowledgeManager", () => {
  it.effect("persists the compact source for workspace Knowledge", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
      );
      try {
        const sourceRoot = nodePath.join(workspaceRoot, "knowledges", "handbook");
        writeKnowledgePackage(sourceRoot, "handbook", true);
        const written: Array<{ readonly source: string; readonly enabled: boolean }> = [];

        yield* installKnowledge(yield* workspaceRef("handbook", sourceRoot)).pipe(
          Effect.provide(
            managerLayer(workspaceRoot, {
              read: {
                settings: { knowledge: { handbook: { source: "workspace", enabled: true } } },
                graph: {
                  packMembership: [],
                  mcpSourceClosures: [],
                  nodes: [
                    {
                      type: "knowledge",
                      name: "handbook",
                      identity: { authority: "workspace", fqn: "@acme/knowledge/handbook" },
                      source: "workspace",
                      enabled: true,
                      constraint: UNCONSTRAINED_DESIRED_NODE,
                      origins: [{ type: "settings", source: "workspace", enabled: true }],
                    },
                  ],
                  problems: [],
                },
              },
              records: {
                ...readModelRecordStubs,
                getExtensionInventory: () =>
                  Effect.succeed({
                    items: [
                      {
                        scope: "project",
                        type: "knowledge",
                        name: "handbook",
                        classification: { kind: "lifecycle", lifecycle: "configured" },
                        enabled: true,
                        installed: true,
                        agents: [],
                        agentOutcomes: [],
                        origins: ["settings"],
                        paths: [sourceRoot],
                        source: "workspace",
                      },
                    ],
                    count: 1,
                    configuredCount: 1,
                    implicitCount: 0,
                    installedCount: 1,
                    leftoverCount: 0,
                    undeclaredCount: 0,
                    unmanagedCount: 0,
                  }),
              },
              settingsWriter: {
                setEntry: (type, _name, entry) =>
                  Effect.sync(() => {
                    if (
                      type === "knowledge" &&
                      "source" in entry &&
                      typeof entry.source === "string" &&
                      "enabled" in entry &&
                      typeof entry.enabled === "boolean"
                    ) {
                      written.push({ source: entry.source, enabled: entry.enabled });
                    }
                  }),
              },
            }),
          ),
        );

        expect(written).toEqual([{ source: "workspace", enabled: true }]);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  for (const foreignChange of [false, true])
    it.effect(
      foreignChange
        ? "preserves a foreign canonical edit when interrupted rollback collides"
        : "restores the previous canonical bundle when installation is interrupted",
      () =>
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(
            nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
          );
          try {
            const sourceRoot = nodePath.join(workspaceRoot, "source");
            writeKnowledgePackage(sourceRoot, "handbook", true);
            writeFileSync(
              nodePath.join(sourceRoot, "src", "concept.md"),
              "---\ntype: concept\n---\n# Replacement concept\n",
            );

            const canonicalRoot = nodePath.join(
              workspaceRoot,
              "agent_extensions",
              "_local",
              "project",
              "source",
            );
            writeKnowledgePackage(canonicalRoot, "handbook", true);
            const canonicalConcept = nodePath.join(canonicalRoot, "src", "concept.md");
            writeFileSync(canonicalConcept, "---\ntype: concept\n---\n# Original concept\n");

            // The accepted-resolution write follows the canonical replacement in
            // the recipe's transaction; blocking there interrupts the install
            // with the replacement already on disk.
            const staged = yield* Deferred.make<void>();
            const layer = managerLayer(workspaceRoot, {
              read: {
                ...desiredHandbookReadFacts(workspaceRoot),
                acceptedResolutions: Effect.succeed({
                  lockfileVersion: 1,
                  skills: {},
                  knowledge: {
                    handbook: {
                      source: { type: "path", path: decodeRelativePathSync("source") },
                      identity: { owner: handle("@acme"), name: extensionName("handbook") },
                      resolved: { tree: treeIntegrityOfSync(canonicalRoot) },
                      treeIntegrity: treeIntegrityOfSync(canonicalRoot),
                    },
                  },
                }),
              },
              acceptedResolutionWriter: {
                setAccepted: () =>
                  Deferred.succeed(staged, undefined).pipe(Effect.andThen(Effect.never)),
              },
            });
            const fiber = yield* installKnowledge(localRef("handbook", sourceRoot)).pipe(
              Effect.provide(layer),
              Effect.forkChild,
            );

            yield* Deferred.await(staged).pipe(Effect.raceFirst(Fiber.join(fiber)));
            expect(readFileSync(canonicalConcept, "utf8")).toContain("# Replacement concept");

            if (foreignChange)
              writeFileSync(
                canonicalConcept,
                "---\ntype: concept\n---\n# Foreign concurrent edit\n",
              );
            yield* Fiber.interrupt(fiber);
            expect(readFileSync(canonicalConcept, "utf8")).toContain(
              foreignChange ? "# Foreign concurrent edit" : "# Original concept",
            );
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
    );

  it.effect("materializes a valid OKF bundle and writes its instruction discovery row", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
      );
      try {
        const sourceRoot = nodePath.join(workspaceRoot, "source");
        writeKnowledgePackage(sourceRoot, "handbook", true);

        yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.materializeInstall({ ref: localRef("handbook", sourceRoot) });
          yield* applyPlannedProjections(manager);
        }).pipe(
          Effect.provide(
            managerLayer(workspaceRoot, { read: desiredHandbookReadFacts(workspaceRoot) }),
          ),
        );

        expect(
          existsSync(
            nodePath.join(
              workspaceRoot,
              "agent_extensions",
              "_local",
              "project",
              "source",
              "src",
              "concept.md",
            ),
          ),
        ).toBe(true);
        expect(existsSync(nodePath.join(workspaceRoot, ".agents", "knowledge"))).toBe(false);
        const instructions = readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8");
        expect(instructions).toContain("<!-- axm:knowledge -->\n");
        expect(instructions).toContain("## Knowledge Bundles");
        expect(instructions).toContain(
          "Use `axm knowledge concepts --help` to search, read, and explore these bundles.",
        );
        expect(instructions).toContain("agent_extensions/_local/project/source/src/index.md");
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect(
    "materializes a recovery target without rewriting discovery while desired state is incomplete",
    () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
        );
        try {
          const sourceRoot = nodePath.join(workspaceRoot, "source");
          writeKnowledgePackage(sourceRoot, "handbook", true);
          const instructionsPath = nodePath.join(workspaceRoot, "AGENTS.md");
          const existingInstructions =
            "# Existing\n\n<!-- unresolved Knowledge remains represented here -->\n";
          writeFileSync(instructionsPath, existingInstructions);

          yield* Effect.gen(function* () {
            const manager = yield* KnowledgeManager;
            yield* manager.materializeInstall({ ref: localRef("handbook", sourceRoot) });
          }).pipe(
            Effect.provide(
              managerLayer(workspaceRoot, {
                read: {
                  graph: {
                    nodes: [],
                    mcpSourceClosures: [],
                    problems: [
                      {
                        type: "pack-resolution-unavailable",
                        pack: "still-unresolved",
                        detail: "accepted resolution is missing",
                      },
                    ],
                    packMembership: [
                      {
                        settingsName: "still-unresolved",
                        pack: "still-unresolved",
                        enabled: true,
                        declared: { status: "known", members: [] },
                        routes: "unauthorized",
                      },
                    ],
                  },
                },
              }),
            ),
          );

          expect(
            existsSync(
              nodePath.join(
                workspaceRoot,
                "agent_extensions",
                "_local",
                "project",
                "source",
                "src",
                "concept.md",
              ),
            ),
          ).toBe(true);
          expect(readFileSync(instructionsPath, "utf8")).toBe(existingInstructions);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
  );

  it.effect(
    "materializes one Knowledge closure without rewriting discovery while a sibling is unresolved",
    () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
        );
        try {
          const sourceRoot = nodePath.join(workspaceRoot, "source");
          writeKnowledgePackage(sourceRoot, "handbook", true);
          const instructionsPath = nodePath.join(workspaceRoot, "AGENTS.md");
          const existingInstructions = "# Existing\n\n<!-- sibling discovery row -->\n";
          writeFileSync(instructionsPath, existingInstructions);

          yield* Effect.gen(function* () {
            const manager = yield* KnowledgeManager;
            yield* manager.materializeInstall({ ref: localRef("handbook", sourceRoot) });
          }).pipe(
            Effect.provide(
              managerLayer(workspaceRoot, {
                read: {
                  graph: {
                    packMembership: [],
                    mcpSourceClosures: [],
                    nodes: [
                      {
                        type: "knowledge",
                        name: "handbook",
                        identity: { authority: "path", locator: "./source" },
                        source: "./source",
                        enabled: true,
                        constraint: UNCONSTRAINED_DESIRED_NODE,
                        origins: [
                          {
                            type: "settings",
                            source: "./source",
                            enabled: true,
                          },
                        ],
                      },
                      {
                        type: "knowledge",
                        name: "unresolved",
                        identity: {
                          authority: "registry",
                          fqn: "@acme/knowledge/unresolved",
                          registry: { sourceName: undefined, endpoint: undefined },
                        },
                        source: "@acme/knowledge/unresolved",
                        enabled: true,
                        constraint: UNCONSTRAINED_DESIRED_NODE,
                        origins: [
                          {
                            type: "settings",
                            source: "@acme/knowledge/unresolved",
                            enabled: true,
                          },
                        ],
                      },
                    ],
                    problems: [],
                  },
                },
              }),
            ),
          );

          expect(
            existsSync(
              nodePath.join(
                workspaceRoot,
                "agent_extensions",
                "_local",
                "project",
                "source",
                "src",
                "concept.md",
              ),
            ),
          ).toBe(true);
          expect(readFileSync(instructionsPath, "utf8")).toBe(existingInstructions);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
  );

  for (const prior of [false, true])
    it.effect(
      prior
        ? "publishes prepared Knowledge over a prior bundle with one staged hash"
        : "publishes prepared Knowledge with one staged hash",
      () =>
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(
            nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
          );
          try {
            const sourceRoot = nodePath.join(workspaceRoot, "source");
            writeKnowledgePackage(sourceRoot, "handbook", true);
            const canonicalConcept = nodePath.join(
              workspaceRoot,
              "agent_extensions",
              "_local",
              "project",
              "source",
              "src",
              "concept.md",
            );
            if (prior) {
              writeKnowledgePackage(
                nodePath.join(workspaceRoot, "agent_extensions", "_local", "project", "source"),
                "handbook",
                true,
              );
              writeFileSync(canonicalConcept, "---\ntype: concept\n---\n# Prior concept\n");
            }
            const observed = workObservations(false);

            yield* Effect.gen(function* () {
              const manager = yield* KnowledgeManager;
              yield* manager
                .materializeInstall({ ref: localRef("handbook", sourceRoot) })
                .pipe(observed.provide);
            }).pipe(Effect.provide(managerLayer(workspaceRoot)));

            // Preparation ends with the staged source hash; publication follows it.
            const prepared = observed.facts.findIndex((fact) => fact.kind === "axm.hash.package");
            expect(prepared).toBeGreaterThanOrEqual(0);
            const publicationTreeHashes = observed.facts
              .slice(prepared + 1)
              .filter((fact) => fact.kind === "axm.hash.materialized-tree").length;
            // The staged copy is hashed once and compared with the prepared tree;
            // a prior bundle adds the footprint's prior and replaced digests.
            expect(publicationTreeHashes).toBe(prior ? 3 : 1);
            expect(readFileSync(canonicalConcept, "utf8")).toContain("# A useful concept");
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
    );

  it.effect("refuses prepared Knowledge whose staged copy changed before publication", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
      );
      try {
        const sourceRoot = nodePath.join(workspaceRoot, "source");
        writeKnowledgePackage(sourceRoot, "handbook", true);
        const canonicalPath = nodePath.join(
          workspaceRoot,
          "agent_extensions",
          "_local",
          "project",
          "source",
        );
        writeKnowledgePackage(canonicalPath, "handbook", true);
        const priorConcept = "---\ntype: concept\n---\n# Prior concept\n";
        writeFileSync(nodePath.join(canonicalPath, "src", "concept.md"), priorConcept);
        const { stagingPath } = canonicalMaterializationPaths(canonicalPath);
        const preparedRoots: Array<string> = [];
        let changed = false;
        let recording: ReturnType<typeof makeRecordingFileSystem>["recording"] | undefined;

        const error = yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.materializeInstall({ ref: localRef("handbook", sourceRoot) });
        }).pipe(
          Effect.provide(
            managerLayer(workspaceRoot, {
              fileSystem: (native) => {
                // Preparation stages the package under a scoped temporary
                // directory; publication starts by creating canonical staging.
                // A foreign edit lands on the prepared copy in between.
                const changing = FileSystem.make({
                  ...native,
                  makeTempDirectoryScoped: (options) =>
                    native.makeTempDirectoryScoped(options).pipe(
                      Effect.tap((directory) =>
                        Effect.sync(() => {
                          if (options?.prefix === "axm-knowledge-package-")
                            preparedRoots.push(nodePath.join(directory, "staged"));
                        }),
                      ),
                    ),
                  makeDirectory: (target, options) =>
                    Effect.sync(() => {
                      const preparedRoot = preparedRoots[0];
                      if (target !== stagingPath || changed || preparedRoot === undefined) return;
                      changed = true;
                      writeFileSync(
                        nodePath.join(preparedRoot, "src", "concept.md"),
                        "---\ntype: concept\n---\n# Changed after preparation\n",
                      );
                    }).pipe(Effect.andThen(native.makeDirectory(target, options))),
                });
                const recorded = makeRecordingFileSystem(changing);
                recording = recorded.recording;
                return recorded.fileSystem;
              },
            }),
          ),
          Effect.flip,
        );

        expect(changed).toBe(true);
        expect(error).toMatchObject({
          _tag: "KnowledgeDefinitionInvalid",
          detail: "Prepared Knowledge package changed before publication",
        });
        // The refusal precedes the swap: canonical is never renamed.
        expect(recording?.calls({ path: canonicalPath, method: "rename" })).toEqual([]);
        expect(readFileSync(nodePath.join(canonicalPath, "src", "concept.md"), "utf8")).toBe(
          priorConcept,
        );
        expect(existsSync(stagingPath)).toBe(false);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("rejects an invalid concept and removes the partial isolated copy", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
      );
      try {
        const sourceRoot = nodePath.join(workspaceRoot, "source");
        writeKnowledgePackage(sourceRoot, "invalid-handbook", false);

        const error = yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.materializeInstall({ ref: localRef("invalid-handbook", sourceRoot) });
        }).pipe(Effect.provide(managerLayer(workspaceRoot)), Effect.flip);

        expect(describeTestFailure(error)).toContain(
          "requires a YAML frontmatter block with a non-empty type",
        );
        expect(
          existsSync(
            nodePath.join(workspaceRoot, "agent_extensions", "_local", "project", "source"),
          ),
        ).toBe(false);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("retains the malformed concept path in package validation", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
      );
      try {
        const sourceRoot = nodePath.join(workspaceRoot, "source");
        writeKnowledgePackage(sourceRoot, "malformed-handbook", true);
        writeFileSync(
          nodePath.join(sourceRoot, "src", "concept.md"),
          "---\ntype: concept\ndescription: value: extra\n---\n# Concept\n",
        );

        const error = yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.materializeInstall({ ref: localRef("malformed-handbook", sourceRoot) });
        }).pipe(Effect.provide(managerLayer(workspaceRoot)), Effect.flip);

        expect(describeTestFailure(error)).toContain(
          "concept.md: Invalid YAML frontmatter: Nested mappings are not allowed in compact mappings",
        );
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("materializes a missing resource warning and rejects an escaping resource", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
      );
      try {
        const warningRoot = nodePath.join(workspaceRoot, "warning-source");
        writeKnowledgePackage(warningRoot, "warning-handbook", true, "./missing.md");
        yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.materializeInstall({ ref: localRef("warning-handbook", warningRoot) });
        }).pipe(Effect.provide(managerLayer(workspaceRoot)));
        expect(
          existsSync(
            nodePath.join(
              workspaceRoot,
              "agent_extensions",
              "_local",
              "project",
              "warning-source",
              "src",
              "concept.md",
            ),
          ),
        ).toBe(true);

        const escapingRoot = nodePath.join(workspaceRoot, "escaping-source");
        writeKnowledgePackage(escapingRoot, "escaping-handbook", true, "../outside.md");
        const error = yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.materializeInstall({ ref: localRef("escaping-handbook", escapingRoot) });
        }).pipe(Effect.provide(managerLayer(workspaceRoot)), Effect.flip);
        expect(describeTestFailure(error)).toContain("escapes");
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect(
    "preserves the previous canonical package and discovery row when replacement validation fails",
    () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
        );
        try {
          const validRoot = nodePath.join(workspaceRoot, "source");
          writeKnowledgePackage(validRoot, "handbook", true);

          yield* Effect.gen(function* () {
            const manager = yield* KnowledgeManager;
            yield* manager.materializeInstall({ ref: localRef("handbook", validRoot) });
            yield* applyPlannedProjections(manager);
            writeKnowledgePackage(validRoot, "handbook", false);
            yield* manager
              .materializeInstall({ ref: localRef("handbook", validRoot) })
              .pipe(Effect.flip);
          }).pipe(
            Effect.provide(
              managerLayer(workspaceRoot, { read: desiredHandbookReadFacts(workspaceRoot) }),
            ),
          );

          const canonicalConcept = nodePath.join(
            workspaceRoot,
            "agent_extensions",
            "_local",
            "project",
            "source",
            "src",
            "concept.md",
          );
          expect(readFileSync(canonicalConcept, "utf8")).toContain("type: concept");
          const instructions = readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8");
          expect(instructions).toContain("### @acme");
          expect(instructions).toContain(
            "[handbook](agent_extensions/_local/project/source/src/index.md)",
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
  );

  describe("discovery selection", () => {
    /**
     * Acquired path bundles whose canonical copies match their accepted
     * trees; `invalidBody` names bundles whose concept lacks frontmatter.
     */
    const acquiredBundles = (
      workspaceRoot: string,
      bundles: ReadonlyArray<{ readonly name: string; readonly enabled: boolean }>,
      invalidBody: ReadonlySet<string> = new Set(),
    ) => {
      const canonicalRootOf = (name: string) =>
        nodePath.join(workspaceRoot, "agent_extensions", "_local", "project", "sources", name);
      const locked: Record<string, KnowledgeLockEntry> = {};
      for (const { name } of bundles) {
        const canonical = canonicalRootOf(name);
        writeKnowledgePackage(canonical, name, !invalidBody.has(name));
        locked[name] = {
          source: { type: "path", path: decodeRelativePathSync(`sources/${name}`) },
          identity: { owner: handle("@acme"), name: extensionName(name) },
          resolved: { tree: treeIntegrityOfSync(canonical) },
          treeIntegrity: treeIntegrityOfSync(canonical),
        };
      }
      const read: Omit<WorkspaceReadTestFacts, "baseDir" | "runtimeDir"> = {
        settings: {
          knowledge: Object.fromEntries(
            bundles.map(({ name, enabled }) => [name, { source: `./sources/${name}`, enabled }]),
          ),
        },
        lockfile: { lockfileVersion: 1, skills: {}, knowledge: locked },
        graph: {
          packMembership: [],
          nodes: bundles.map(({ name, enabled }) => ({
            type: "knowledge" as const,
            name,
            identity: { authority: "path", locator: `./sources/${name}` },
            source: `./sources/${name}`,
            enabled,
            constraint: UNCONSTRAINED_DESIRED_NODE,
            origins: [{ type: "settings" as const, source: `./sources/${name}`, enabled }],
          })),
          mcpSourceClosures: [],
          problems: [],
        },
      };
      return { canonicalRootOf, read };
    };

    const recordedSelection = (
      workspaceRoot: string,
      read: Omit<WorkspaceReadTestFacts, "baseDir" | "runtimeDir">,
    ) =>
      Effect.gen(function* () {
        let recording: ReturnType<typeof makeRecordingFileSystem>["recording"] | undefined;
        const observed = workObservations(false);
        const plans = yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          recording?.reset();
          // One selection; the producer's own observation of its plans is reused.
          return yield* manager
            .observedProjectionPlans(undefined, (held) =>
              observeObservedPlans(held).pipe(
                Effect.map((observations) =>
                  held.plans.map((plan, index) => ({
                    exclusions: plan.exclusions,
                    expectedContributors: observations[index]?.expectedContributors,
                  })),
                ),
              ),
            )
            .pipe(observed.provide);
        }).pipe(
          Effect.provide(
            managerLayer(workspaceRoot, {
              read,
              fileSystem: (native) => {
                const recorded = makeRecordingFileSystem(native);
                recording = recorded.recording;
                return recorded.fileSystem;
              },
            }),
          ),
        );
        const treeHashes = observed.facts.filter(
          (fact) => fact.kind === "axm.hash.materialized-tree",
        ).length;
        return { plans, recording, treeHashes };
      });

    for (const names of [["handbook"], ["handbook", "playbook"]])
      it.effect(
        `decodes each usable bundle's manifest once while selecting ${names.length} bundle(s)`,
        () =>
          Effect.gen(function* () {
            const workspaceRoot = mkdtempSync(
              nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
            );
            try {
              const { canonicalRootOf, read } = acquiredBundles(
                workspaceRoot,
                names.map((name) => ({ name, enabled: true })),
              );
              const { plans, recording, treeHashes } = yield* recordedSelection(
                workspaceRoot,
                read,
              );

              expect(plans.map((plan) => plan.expectedContributors)).toEqual([
                names.map((name) => `@acme/knowledge/${name}`),
              ]);
              for (const name of names) {
                const root = canonicalRootOf(name);
                // The observation's manifest read and its tree hash; the
                // inspection decodes what the observation read.
                expect(recording?.contentReads(nodePath.join(root, "knowledge.json"))).toBe(2);
                // The tree hash and the bundle-body inspection.
                expect(recording?.contentReads(nodePath.join(root, "src", "concept.md"))).toBe(2);
              }
              // The canonical observation still hashes every acquired tree.
              expect(treeHashes).toBe(names.length);
            } finally {
              rmSync(workspaceRoot, { recursive: true, force: true });
            }
          }),
      );

    it.effect("reads no manifest of a disabled bundle", () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
        );
        try {
          const { canonicalRootOf, read } = acquiredBundles(workspaceRoot, [
            { name: "handbook", enabled: false },
          ]);
          const { plans, recording, treeHashes } = yield* recordedSelection(workspaceRoot, read);

          expect(plans.map((plan) => plan.expectedContributors)).toEqual([[]]);
          expect(
            recording?.counts(nodePath.join(canonicalRootOf("handbook"), "knowledge.json")),
          ).toEqual({});
          expect(treeHashes).toBe(0);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    );

    it.effect("excludes a usable bundle whose body fails inspection", () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
        );
        try {
          const { read } = acquiredBundles(
            workspaceRoot,
            [
              { name: "handbook", enabled: true },
              { name: "playbook", enabled: true },
            ],
            new Set(["playbook"]),
          );
          const { plans } = yield* recordedSelection(workspaceRoot, read);

          expect(plans.map((plan) => plan.expectedContributors)).toEqual([
            ["@acme/knowledge/handbook"],
          ]);
          expect(plans.map((plan) => plan.exclusions)).toEqual([
            [
              {
                contributor: "playbook",
                reason: "package-invalid",
                detail: expect.stringContaining(
                  "requires a YAML frontmatter block with a non-empty type",
                ),
              },
            ],
          ]);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    );

    it.effect("excludes the same invalid bundle from an inspection shared in one phase", () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
        );
        try {
          const { canonicalRootOf, read } = acquiredBundles(
            workspaceRoot,
            [{ name: "playbook", enabled: true }],
            new Set(["playbook"]),
          );
          const concept = nodePath.join(canonicalRootOf("playbook"), "src", "concept.md");
          let recording: ReturnType<typeof makeRecordingFileSystem>["recording"] | undefined;
          const selected = yield* Effect.gen(function* () {
            const manager = yield* KnowledgeManager;
            const exclusions = manager
              .projectionPlans()
              .pipe(Effect.map((plans) => plans.map((plan) => plan.exclusions)));
            const alone = yield* exclusions;
            const fileSystem = yield* FileSystem.FileSystem;
            // One observation phase whose port is the manager's filesystem.
            const inPhase = exclusions.pipe(
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
                knowledgeInspections: new Map(),
                isActive: () => true,
                endedBy: () => undefined,
                close: () => undefined,
              }),
            );
            // The observation's tree check reads each document on every
            // selection; the package inspection reads it once more.
            const reads = () => recording?.contentReads(concept);
            recording?.reset();
            const first = yield* inPhase;
            const firstReads = reads();
            recording?.reset();
            const second = yield* inPhase;
            return { alone, first, second, reads: [firstReads, reads()] };
          }).pipe(
            Effect.provide(
              managerLayer(workspaceRoot, {
                read,
                fileSystem: (native) => {
                  const recorded = makeRecordingFileSystem(native);
                  recording = recorded.recording;
                  return recorded.fileSystem;
                },
              }),
            ),
          );

          expect(selected.alone).toEqual([
            [
              {
                contributor: "playbook",
                reason: "package-invalid",
                detail: expect.stringContaining(
                  "requires a YAML frontmatter block with a non-empty type",
                ),
              },
            ],
          ]);
          // The later selection receives the earlier one's failed inspection
          // and maps it to the same exclusion.
          expect(selected.first).toEqual(selected.alone);
          expect(selected.second).toEqual(selected.alone);
          expect(selected.reads).toEqual([2, 1]);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    );

    it.effect("excludes a bundle whose manifest is corrupt without inspecting it", () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
        );
        try {
          const { canonicalRootOf, read } = acquiredBundles(workspaceRoot, [
            { name: "handbook", enabled: true },
          ]);
          const manifestPath = nodePath.join(canonicalRootOf("handbook"), "knowledge.json");
          writeFileSync(manifestPath, "{ not json");
          const { plans, recording } = yield* recordedSelection(workspaceRoot, read);

          expect(plans.map((plan) => plan.exclusions)).toEqual([
            [expect.objectContaining({ contributor: "handbook", reason: "package-invalid" })],
          ]);
          expect(recording?.contentReads(manifestPath)).toBe(1);
          expect(
            recording?.contentReads(
              nodePath.join(canonicalRootOf("handbook"), "src", "concept.md"),
            ),
          ).toBe(0);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    );
  });

  it.effect(
    "fails closed without rewriting discovery when one active locked source is unavailable",
    () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
        );
        try {
          const healthySource = nodePath.join(workspaceRoot, "sources", "healthy");
          const unavailableSource = nodePath.join(workspaceRoot, "sources", "unavailable");
          const healthyCanonical = nodePath.join(
            workspaceRoot,
            "agent_extensions",
            "_local",
            "project",
            "sources",
            "healthy",
          );
          const unavailableCanonical = nodePath.join(
            workspaceRoot,
            "agent_extensions",
            "_local",
            "project",
            "sources",
            "unavailable",
          );
          writeKnowledgePackage(healthySource, "healthy", true);
          writeKnowledgePackage(unavailableSource, "unavailable", true);
          writeKnowledgePackage(healthyCanonical, "healthy", true);
          writeKnowledgePackage(unavailableCanonical, "unavailable", true);

          const locked = {
            healthy: {
              source: { type: "path", path: "sources/healthy" },
              identity: { owner: handle("@acme"), name: extensionName("healthy") },
              resolved: { tree: treeIntegrityOfSync(healthyCanonical) },
              treeIntegrity: treeIntegrityOfSync(healthyCanonical),
            },
            unavailable: {
              source: { type: "path", path: "sources/unavailable" },
              identity: { owner: handle("@acme"), name: extensionName("unavailable") },
              resolved: { tree: treeIntegrityOfSync(unavailableCanonical) },
              treeIntegrity: treeIntegrityOfSync(unavailableCanonical),
            },
          } satisfies Readonly<Record<string, KnowledgeLockEntry>>;
          const layer = managerLayer(workspaceRoot, {
            read: {
              settings: {
                knowledge: {
                  healthy: { source: "./sources/healthy", enabled: true },
                  unavailable: {
                    source: "./sources/unavailable",
                    enabled: true,
                  },
                },
              },
              lockfile: { lockfileVersion: 1, skills: {}, knowledge: locked },
              graph: {
                packMembership: [],
                nodes: ["healthy", "unavailable"].map((name) => ({
                  type: "knowledge" as const,
                  name,
                  identity: { authority: "path", locator: `./sources/${name}` },
                  source: `./sources/${name}`,
                  enabled: true,
                  constraint: UNCONSTRAINED_DESIRED_NODE,
                  origins: [
                    { type: "settings" as const, source: `./sources/${name}`, enabled: true },
                  ],
                })),
                mcpSourceClosures: [],
                problems: [],
              },
            },
          });

          const result = yield* Effect.gen(function* () {
            const manager = yield* KnowledgeManager;
            yield* manager.sync({ dryRun: false });
            rmSync(unavailableCanonical, { recursive: true, force: true });
            rmSync(unavailableSource, { recursive: true, force: true });
            const before = readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8");
            const failure = yield* manager.sync({ dryRun: false }).pipe(Effect.flip);
            return { before, failure };
          }).pipe(Effect.provide(layer));

          expect(describeTestFailure(result.failure)).toContain("unavailable");
          expect(readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8")).toBe(
            result.before,
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
  );

  describe("projection preparation", () => {
    const handbookNode = {
      type: "knowledge" as const,
      name: "handbook",
      identity: { authority: "path" as const, locator: "./source" },
      source: "./source",
      enabled: true,
      constraint: UNCONSTRAINED_DESIRED_NODE,
      origins: [{ type: "settings" as const, source: "./source", enabled: true }],
    };
    const handbookGraph = {
      packMembership: [],
      nodes: [handbookNode],
      mcpSourceClosures: [],
      problems: [],
    };

    /**
     * Prepare the discovery plan for `refs` and observe it once, counting the
     * settings and accepted-resolution document reads and every filesystem
     * call the preparation makes after layer construction.
     */
    const recordedPreparation = (
      workspaceRoot: string,
      refs: ReadonlyArray<KnowledgeExtensionRef>,
      options: {
        readonly desiredGraph?: typeof handbookGraph;
        readonly graph?: typeof handbookGraph;
        readonly fileSystem?: (native: FileSystem.FileSystem) => FileSystem.FileSystem;
      } = {},
    ) =>
      Effect.gen(function* () {
        let recording: ReturnType<typeof makeRecordingFileSystem>["recording"] | undefined;
        const reads = { settings: 0, acceptedResolutions: 0 };
        const settings = { instructionFiles: {} };
        const lockfile = { lockfileVersion: 1 as const, skills: {} };
        const outcome = yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          recording?.reset();
          reads.settings = 0;
          reads.acceptedResolutions = 0;
          return yield* manager.observedPrepareProjection(
            refs,
            options.desiredGraph === undefined ? undefined : { desiredGraph: options.desiredGraph },
            (held) =>
              observeObservedPlans(held).pipe(
                Effect.map((observations) =>
                  observations.map((observation) => observation.expectedContributors),
                ),
              ),
          );
        }).pipe(
          Effect.result,
          Effect.provide(
            managerLayer(workspaceRoot, {
              read: {
                settingsDocument: Effect.sync(() => {
                  reads.settings += 1;
                  return settings;
                }),
                acceptedResolutions: Effect.sync(() => {
                  reads.acceptedResolutions += 1;
                  return lockfile;
                }),
                ...(options.graph === undefined ? {} : { graph: options.graph }),
              },
              fileSystem: (native) => {
                const recorded = makeRecordingFileSystem(options.fileSystem?.(native) ?? native);
                recording = recorded.recording;
                return recorded.fileSystem;
              },
            }),
          ),
        );
        return { outcome, recording, reads };
      });

    const deepFrozen = <A>(value: A): A => {
      if (typeof value === "object" && value !== null) {
        for (const child of Object.values(value)) deepFrozen(child);
        Object.freeze(value);
      }
      return value;
    };

    it.effect(
      "resolves the instruction target route once while preparing one Knowledge bundle",
      () =>
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(
            nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
          );
          try {
            const sourceRoot = nodePath.join(workspaceRoot, "source");
            writeKnowledgePackage(sourceRoot, "handbook", true);
            const instructionsPath = nodePath.join(workspaceRoot, "AGENTS.md");
            writeFileSync(instructionsPath, "# Project\n");

            const { outcome, recording, reads } = yield* recordedPreparation(
              workspaceRoot,
              [localRef("handbook", sourceRoot)],
              { desiredGraph: handbookGraph },
            );

            expect(outcome).toMatchObject({
              _tag: "Success",
              success: [["@acme/knowledge/handbook"]],
            });
            // One route resolution of the declared instruction file shared by
            // the source's overlap check and the plan, the overlap check
            // itself, then the region dry run's own fresh route checks.
            expect(recording?.calls({ path: instructionsPath, method: "readLink" })).toHaveLength(
              8,
            );
            // The projection inputs are read once for the source checks and
            // the plan; the plan and its dry run read the rest for themselves.
            expect(reads.settings).toBe(5);
            expect(reads.acceptedResolutions).toBe(2);
            expect(readFileSync(instructionsPath, "utf8")).toBe("# Project\n");
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
    );

    it.effect("resolves the instruction target route once while preparing no bundle", () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
        );
        try {
          const instructionsPath = nodePath.join(workspaceRoot, "AGENTS.md");
          writeFileSync(instructionsPath, "# Project\n");

          // The manager reads a deeply frozen desired graph, as live readers return.
          const { outcome, recording, reads } = yield* recordedPreparation(workspaceRoot, [], {
            graph: deepFrozen({ ...handbookGraph, nodes: [] }),
          });

          expect(outcome).toMatchObject({ _tag: "Success", success: [[]] });
          // One route resolution, then the region dry run's own route checks:
          // the same calls a standing plan makes.
          expect(recording?.calls({ path: instructionsPath, method: "readLink" })).toHaveLength(6);
          expect(reads.settings).toBe(5);
          expect(reads.acceptedResolutions).toBe(2);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    );

    it.effect("keeps the region dry run's target and alias checks for a standing plan", () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
        );
        try {
          const instructionsPath = nodePath.join(workspaceRoot, "AGENTS.md");
          writeFileSync(instructionsPath, "# Project\n");
          let recording: ReturnType<typeof makeRecordingFileSystem>["recording"] | undefined;

          const contributors = yield* Effect.gen(function* () {
            const manager = yield* KnowledgeManager;
            recording?.reset();
            return yield* manager.observedProjectionPlans(undefined, (held) =>
              observeObservedPlans(held).pipe(
                Effect.map((observations) =>
                  observations.map((observation) => observation.expectedContributors),
                ),
              ),
            );
          }).pipe(
            Effect.provide(
              managerLayer(workspaceRoot, {
                fileSystem: (native) => {
                  const recorded = makeRecordingFileSystem(native);
                  recording = recorded.recording;
                  return recorded.fileSystem;
                },
              }),
            ),
          );

          expect(contributors).toEqual([[]]);
          // The plan's own route resolution, then the dry run's own route checks.
          expect(recording?.calls({ path: instructionsPath, method: "readLink" })).toHaveLength(6);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    );

    it.effect(
      "refuses the prepared plan when the instruction alias is retargeted during inspection",
      () =>
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(
            nodePath.join(realpathSync(tmpdir()), "axm-knowledge-manager-"),
          );
          try {
            const sourceRoot = nodePath.join(workspaceRoot, "source");
            writeKnowledgePackage(sourceRoot, "handbook", true);
            const instructionsPath = nodePath.join(workspaceRoot, "AGENTS.md");
            // Relative links stay valid through an alias in the same directory.
            writeFileSync(nodePath.join(workspaceRoot, "FIRST.md"), "# First\n");
            writeFileSync(nodePath.join(workspaceRoot, "SECOND.md"), "# Second\n");
            symlinkSync("FIRST.md", instructionsPath);
            const sourceManifest = nodePath.join(sourceRoot, "knowledge.json");
            let retargeted = false;
            const retarget = (target: string) =>
              Effect.sync(() => {
                if (target !== sourceManifest || retargeted) return;
                retargeted = true;
                // A foreign actor moves the alias while the source is inspected.
                rmSync(instructionsPath);
                symlinkSync("SECOND.md", instructionsPath);
              });

            const { outcome } = yield* recordedPreparation(
              workspaceRoot,
              [localRef("handbook", sourceRoot)],
              {
                desiredGraph: handbookGraph,
                fileSystem: (native) =>
                  FileSystem.make({
                    ...native,
                    // String reads of the manifest are derived from this one.
                    readFile: (target) =>
                      retarget(target).pipe(Effect.andThen(native.readFile(target))),
                  }),
              },
            );

            expect(retargeted).toBe(true);
            // The source's overlap check and the plan share one resolution of
            // the alias, so the plan's dry run sees the move and refuses.
            expect(outcome).toMatchObject({
              _tag: "Failure",
              failure: {
                _tag: "ManagedRegionViolation",
                reason: "Native region alias changed after planning",
              },
            });
            expect(readFileSync(nodePath.join(workspaceRoot, "FIRST.md"), "utf8")).toBe(
              "# First\n",
            );
            expect(readFileSync(nodePath.join(workspaceRoot, "SECOND.md"), "utf8")).toBe(
              "# Second\n",
            );
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
    );
  });
});
