import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { UNCONSTRAINED_DESIRED_NODE } from "../desired-state/index.js";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "../transitions/settlement/live.js";
import * as Option from "effect/Option";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { computeSourceHash } from "../desired-state/index.js";
import type { KnowledgeLockEntry } from "../desired-state/index.js";
import { KnowledgeManager } from "../materialization/managers.js";
import { applyPlannedProjections } from "../projection/index.js";
import { SourceHostProviders, SourceNotResolvable } from "../resolution/sources/index.js";
import {
  DesiredStateWriter,
  SettingsWriter,
  type DesiredStateWriterService,
  type SettingsWriterService,
  type WorkspaceRecordsService,
} from "../desired-state/index.js";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  MockWorkspaceTransactionScope,
  readModelRecordStubs,
  TEST_CONTENT_IDENTITY,
  WorkspaceReadTest,
  type WorkspaceReadTestFacts,
} from "../desired-state/testing.js";
import { CodingAgentRepositoryLive, NativeWriteAuthorityLive } from "../projection/live.js";
import {
  WorkspaceCatalogTestLive,
  computeMaterializedTreeIntegritySync,
  describeTestFailure,
  exactVersion,
  extensionName,
  handle,
} from "../materialization/test-helpers.js";
import { KnowledgeManagerLive } from "./manager.js";
import type {
  LocalKnowledgeRef,
  WorkspaceKnowledgeRef,
} from "@agentxm/extension-model/unstable/extensions/refs/knowledge";

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

const workspaceRef = (name: string, root: string): WorkspaceKnowledgeRef => ({
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
  sourceHash: computeSourceHash(name),
  knowledge: { name: decodeExtensionNameSync(name) },
});

/** Desired-state and lock overrides for a locally sourced `handbook` bundle. */
const desiredHandbookReadFacts = (
  workspaceRoot: string,
): Omit<WorkspaceReadTestFacts, "baseDir" | "runtimeDir"> => ({
  settings: { knowledge: { handbook: { source: "./source", enabled: true } } },
  acceptedResolutions: Effect.sync(() => ({
    lockfileVersion: 8 as const,
    skills: {},
    knowledge: {
      handbook: {
        source: { type: "path" as const, path: decodeRelativePathSync("source") },
        identity: { owner: handle("@acme"), name: extensionName("handbook") },
        resolved: { tree: TEST_CONTENT_IDENTITY },
        treeIntegrity: computeMaterializedTreeIntegritySync(
          nodePath.join(
            workspaceRoot,
            "agent_extensions",
            "path",
            "@acme",
            "knowledge",
            "handbook",
          ),
        ),
      },
    },
  })),
  graph: {
    complete: true,
    nodes: [
      {
        type: "knowledge",
        name: "handbook",
        identity: "./source",
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

const managerLayer = (
  workspaceRoot: string,
  options: {
    readonly read?: Omit<WorkspaceReadTestFacts, "baseDir" | "runtimeDir">;
    readonly records?: Partial<WorkspaceRecordsService>;
    readonly settingsWriter?: Partial<SettingsWriterService>;
    readonly desiredStateWriter?: Partial<DesiredStateWriterService>;
  } = {},
) => {
  const axmDir = nodePath.join(workspaceRoot, ".axm");
  return KnowledgeManagerLive.pipe(
    Layer.provideMerge(WorkspaceCatalogTestLive),
    Layer.provideMerge(CodingAgentRepositoryLive),
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
    Layer.provideMerge(NativeWriteAuthorityLive),
    Layer.provideMerge(WorkspaceFileWriteLocksLive),
    Layer.provideMerge(Layer.merge(NodeServices.layer, FetchHttpClient.layer)),
  );
};

describe("KnowledgeManager", () => {
  it.effect("persists the compact source for workspace Knowledge", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
      try {
        const sourceRoot = nodePath.join(workspaceRoot, "knowledges", "handbook");
        writeKnowledgePackage(sourceRoot, "handbook", true);
        const written: Array<{ readonly source: string; readonly enabled: boolean }> = [];

        yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.install({
            ref: workspaceRef("handbook", sourceRoot),
            versionRange: Option.none(),
          });
        }).pipe(
          Effect.provide(
            managerLayer(workspaceRoot, {
              read: {
                settings: { knowledge: { handbook: { source: "workspace", enabled: true } } },
                graph: {
                  complete: true,
                  mcpSourceClosures: [],
                  nodes: [
                    {
                      type: "knowledge",
                      name: "handbook",
                      identity: "workspace:@acme/knowledge/handbook",
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

  it.effect("restores the previous canonical bundle when installation is interrupted", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
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
          "path",
          "@acme",
          "knowledge",
          "handbook",
        );
        writeKnowledgePackage(canonicalRoot, "handbook", true);
        const canonicalConcept = nodePath.join(canonicalRoot, "src", "concept.md");
        writeFileSync(canonicalConcept, "---\ntype: concept\n---\n# Original concept\n");

        const staged = yield* Deferred.make<void>();
        const layer = managerLayer(workspaceRoot, {
          desiredStateWriter: {
            declare: () => Deferred.succeed(staged, undefined).pipe(Effect.andThen(Effect.never)),
          },
        });
        const fiber = yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.install({
            ref: localRef("handbook", sourceRoot),
            versionRange: Option.none(),
          });
        }).pipe(Effect.provide(layer), Effect.forkChild);

        yield* Deferred.await(staged);
        expect(readFileSync(canonicalConcept, "utf8")).toContain("# Replacement concept");

        yield* Fiber.interrupt(fiber);
        expect(readFileSync(canonicalConcept, "utf8")).toContain("# Original concept");
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("materializes a valid OKF bundle and writes its instruction discovery row", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
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
              "path",
              "@acme",
              "knowledge",
              "handbook",
              "src",
              "concept.md",
            ),
          ),
        ).toBe(true);
        expect(existsSync(nodePath.join(workspaceRoot, ".agents", "knowledge"))).toBe(false);
        const instructions = readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8");
        expect(instructions).toContain("region=knowledge");
        expect(instructions).toContain("## Knowledge Bundles");
        expect(instructions).toContain(
          "Use `axm knowledge concepts --help` to search, read, and explore these bundles.",
        );
        expect(instructions).toContain(
          "agent_extensions/path/@acme/knowledge/handbook/src/index.md",
        );
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect(
    "materializes a recovery target without rewriting discovery while desired state is incomplete",
    () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
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
                    complete: false,
                    nodes: [],
                    mcpSourceClosures: [],
                    problems: [
                      {
                        type: "pack-resolution-unavailable",
                        pack: "still-unresolved",
                        detail: "accepted resolution is missing",
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
                "path",
                "@acme",
                "knowledge",
                "handbook",
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
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
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
                    complete: true,
                    mcpSourceClosures: [],
                    nodes: [
                      {
                        type: "knowledge",
                        name: "handbook",
                        identity: "./source",
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
                        identity: "@acme/knowledge/unresolved",
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
                "path",
                "@acme",
                "knowledge",
                "handbook",
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

  it.effect("rejects an invalid concept and removes the partial isolated copy", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
      try {
        const sourceRoot = nodePath.join(workspaceRoot, "source");
        writeKnowledgePackage(sourceRoot, "invalid-handbook", false);

        const error = yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.materializeInstall({ ref: localRef("invalid-handbook", sourceRoot) });
        }).pipe(Effect.provide(managerLayer(workspaceRoot)), Effect.flip);

        expect(describeTestFailure(error)).toContain("requires a non-empty frontmatter type");
        expect(
          existsSync(
            nodePath.join(
              workspaceRoot,
              "agent_extensions",
              "path",
              "@acme",
              "knowledge",
              "handbook",
            ),
          ),
        ).toBe(false);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("retains the malformed concept path in package validation", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
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
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
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
              "path",
              "@acme",
              "knowledge",
              "warning-handbook",
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
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
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
            "path",
            "@acme",
            "knowledge",
            "handbook",
            "src",
            "concept.md",
          );
          expect(readFileSync(canonicalConcept, "utf8")).toContain("type: concept");
          const instructions = readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8");
          expect(instructions).toContain("### @acme");
          expect(instructions).toContain(
            "[handbook](agent_extensions/path/@acme/knowledge/handbook/src/index.md)",
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
  );

  it.effect(
    "fails closed without rewriting discovery when one active locked source is unavailable",
    () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
        try {
          const healthySource = nodePath.join(workspaceRoot, "sources", "healthy");
          const unavailableSource = nodePath.join(workspaceRoot, "sources", "unavailable");
          const healthyCanonical = nodePath.join(
            workspaceRoot,
            "agent_extensions",
            "path",
            "@acme",
            "knowledge",
            "healthy",
          );
          const unavailableCanonical = nodePath.join(
            workspaceRoot,
            "agent_extensions",
            "path",
            "@acme",
            "knowledge",
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
              resolved: { tree: TEST_CONTENT_IDENTITY },
              treeIntegrity: computeMaterializedTreeIntegritySync(healthyCanonical),
            },
            unavailable: {
              source: { type: "path", path: "sources/unavailable" },
              identity: { owner: handle("@acme"), name: extensionName("unavailable") },
              resolved: { tree: TEST_CONTENT_IDENTITY },
              treeIntegrity: computeMaterializedTreeIntegritySync(unavailableCanonical),
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
              lockfile: { lockfileVersion: 8, skills: {}, knowledge: locked },
              graph: {
                complete: true,
                nodes: ["healthy", "unavailable"].map((name) => ({
                  type: "knowledge" as const,
                  name,
                  identity: `./sources/${name}`,
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
});
