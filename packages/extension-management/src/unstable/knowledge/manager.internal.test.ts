import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { toAppError } from "../app-error/conversions.js";
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
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { computeSourceHash } from "../workspace/rendered-files.js";
import type { KnowledgeLockEntry } from "../lockfile/index.js";
import { applyPlannedProjections } from "../projection/planning.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  makeBaseWorkspaceMock,
  readModelRecordStubs,
  TEST_CONTENT_IDENTITY,
} from "../workspace/test-stubs.js";
import {
  computeMaterializedTreeIntegritySync,
  exactVersion,
  extensionName,
  handle,
} from "../test-helpers.js";
import { KnowledgeManager, KnowledgeManagerLive } from "./manager.js";
import type { LocalKnowledgeRef, WorkspaceKnowledgeRef } from "../workspace/refs/knowledge.js";

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
const desiredHandbookOverrides = (
  workspaceRoot: string,
): NonNullable<Parameters<typeof makeBaseWorkspaceMock>[1]> => ({
  getConfiguredKnowledgeEntries: () =>
    Effect.succeed({ handbook: { source: "./source", enabled: true } }),
  getLockedKnowledge: () =>
    Effect.sync(() => ({
      handbook: {
        type: "local" as const,
        sourceType: "local" as const,
        sourceName: "local" as const,
        extensionType: "knowledge" as const,
        workspaceName: extensionName("handbook"),
        packageFormat: "agentxm" as const,
        packageOwner: handle("@acme"),
        packageName: extensionName("handbook"),
        path: decodeRelativePathSync("source"),
        contentIdentity: TEST_CONTENT_IDENTITY,
        treeIntegrity: computeMaterializedTreeIntegritySync(
          nodePath.join(workspaceRoot, "agent_extensions", "local", "source"),
        ),
      },
    })),
});

const managerLayer = (
  workspaceRoot: string,
  overrides: NonNullable<Parameters<typeof makeBaseWorkspaceMock>[1]> = {},
) =>
  KnowledgeManagerLive.pipe(
    Layer.provide(
      Layer.succeed(
        WorkspaceMutations,
        makeBaseWorkspaceMock(nodePath.join(workspaceRoot, ".axm"), {
          getConfiguredKnowledgeEntries: () => Effect.succeed({}),
          getInstructionsConfig: () => Effect.succeed(Option.some({})),
          ...overrides,
        }),
      ),
    ),
    Layer.provide(
      Layer.succeed(SourceHostProviders, {
        resolveNamedRegistry: () => Effect.die("not used"),
        find: () => Effect.succeed([]),
        fetch: () => Effect.fail(makeAppError({ code: "validation", detail: "not used" })),
        cloneUrl: () => Option.none(),
        origin: () => "test",
      }),
    ),
    Layer.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer)),
  );

describe("KnowledgeManager", () => {
  it.effect("persists the compact source for workspace Knowledge", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
      try {
        const sourceRoot = nodePath.join(workspaceRoot, "knowledges", "handbook");
        writeKnowledgePackage(sourceRoot, "handbook", true);
        const written: Array<{ readonly source: string }> = [];

        yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.install({
            ref: workspaceRef("handbook", sourceRoot),
            versionRange: Option.none(),
          });
        }).pipe(
          Effect.provide(
            managerLayer(workspaceRoot, {
              getConfiguredKnowledgeEntries: () =>
                Effect.succeed({ handbook: { source: "workspace", enabled: true } }),
              getDesiredStateGraph: () =>
                Effect.succeed({
                  complete: true,
                  nodes: [
                    {
                      type: "knowledge",
                      name: "handbook",
                      identity: "workspace:@acme/knowledge/handbook",
                      source: "workspace",
                      enabled: true,
                      constraints: [],
                      origins: [{ type: "settings", source: "workspace", enabled: true }],
                    },
                  ],
                  problems: [],
                }),
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
                    unmanagedCount: 0,
                  }),
              },
              setKnowledgeEntry: (_name, entry) =>
                Effect.sync(() => {
                  written.push(entry);
                }),
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

        const canonicalRoot = nodePath.join(workspaceRoot, "agent_extensions", "local", "source");
        writeKnowledgePackage(canonicalRoot, "handbook", true);
        const canonicalConcept = nodePath.join(canonicalRoot, "src", "concept.md");
        writeFileSync(canonicalConcept, "---\ntype: concept\n---\n# Original concept\n");

        const staged = yield* Deferred.make<void>();
        const layer = managerLayer(workspaceRoot, {
          setKnowledge: () =>
            Deferred.succeed(staged, undefined).pipe(Effect.andThen(Effect.never)),
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
          Effect.provide(managerLayer(workspaceRoot, desiredHandbookOverrides(workspaceRoot))),
        );

        expect(
          existsSync(
            nodePath.join(
              workspaceRoot,
              "agent_extensions",
              "local",
              "source",
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
        expect(instructions).toContain("agent_extensions/local/source/src/index.md");
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
                getDesiredStateGraph: () =>
                  Effect.succeed({
                    complete: false,
                    nodes: [],
                    problems: [
                      {
                        type: "pack-resolution-unavailable",
                        pack: "still-unresolved",
                        detail: "accepted resolution is missing",
                      },
                    ],
                  }),
              }),
            ),
          );

          expect(
            existsSync(
              nodePath.join(
                workspaceRoot,
                "agent_extensions",
                "local",
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
                getDesiredStateGraph: () =>
                  Effect.succeed({
                    complete: true,
                    nodes: [
                      {
                        type: "knowledge",
                        name: "handbook",
                        identity: "./source",
                        source: "./source",
                        enabled: true,
                        constraints: [],
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
                        constraints: [],
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
                  }),
              }),
            ),
          );

          expect(
            existsSync(
              nodePath.join(
                workspaceRoot,
                "agent_extensions",
                "local",
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

        expect(toAppError(error).detail).toContain("requires a non-empty frontmatter type");
        expect(
          existsSync(nodePath.join(workspaceRoot, "agent_extensions", "local", "source")),
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

        expect(toAppError(error).detail).toContain(
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
              "local",
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
        expect(toAppError(error).detail).toContain("escapes");
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
            Effect.provide(managerLayer(workspaceRoot, desiredHandbookOverrides(workspaceRoot))),
          );

          const canonicalConcept = nodePath.join(
            workspaceRoot,
            "agent_extensions",
            "local",
            "source",
            "src",
            "concept.md",
          );
          expect(readFileSync(canonicalConcept, "utf8")).toContain("type: concept");
          const instructions = readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8");
          expect(instructions).toContain("### @acme");
          expect(instructions).toContain("[handbook](agent_extensions/local/source/src/index.md)");
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
            "local",
            "sources",
            "healthy",
          );
          const unavailableCanonical = nodePath.join(
            workspaceRoot,
            "agent_extensions",
            "local",
            "sources",
            "unavailable",
          );
          writeKnowledgePackage(healthySource, "healthy", true);
          writeKnowledgePackage(unavailableSource, "unavailable", true);
          writeKnowledgePackage(healthyCanonical, "healthy", true);
          writeKnowledgePackage(unavailableCanonical, "unavailable", true);

          const locked = {
            healthy: {
              type: "local",
              sourceType: "local",
              sourceName: "local",
              extensionType: "knowledge",
              workspaceName: extensionName("healthy"),
              packageFormat: "agentxm",
              packageOwner: handle("@acme"),
              packageName: extensionName("healthy"),
              path: "sources/healthy",
              contentIdentity: TEST_CONTENT_IDENTITY,
              treeIntegrity: computeMaterializedTreeIntegritySync(healthyCanonical),
            },
            unavailable: {
              type: "local",
              sourceType: "local",
              sourceName: "local",
              extensionType: "knowledge",
              workspaceName: extensionName("unavailable"),
              packageFormat: "agentxm",
              packageOwner: handle("@acme"),
              packageName: extensionName("unavailable"),
              path: "sources/unavailable",
              contentIdentity: TEST_CONTENT_IDENTITY,
              treeIntegrity: computeMaterializedTreeIntegritySync(unavailableCanonical),
            },
          } satisfies Readonly<Record<string, KnowledgeLockEntry>>;
          const layer = managerLayer(workspaceRoot, {
            getConfiguredKnowledgeEntries: () =>
              Effect.succeed({
                healthy: { source: "./sources/healthy", enabled: true, packagingKind: "native" },
                unavailable: {
                  source: "./sources/unavailable",
                  enabled: true,
                  packagingKind: "native",
                },
              }),
            getLockedKnowledge: () => Effect.succeed(locked),
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

          expect(toAppError(result.failure).detail).toContain("unavailable");
          expect(readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8")).toBe(
            result.before,
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
  );
});
