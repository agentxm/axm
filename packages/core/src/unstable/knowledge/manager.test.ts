import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { decodeExtensionNameSync } from "../extensions/index.js";
import type { KnowledgeLockEntry } from "../lockfile/index.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import { KnowledgeManager, KnowledgeManagerLive } from "./manager.js";
import type { LocalKnowledgeRef } from "./refs.js";

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
  source: { type: "local", path: root },
  location: pathToFileURL(root).href,
  knowledge: { name: decodeExtensionNameSync(name) },
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
        find: () => Effect.succeed([]),
        fetch: () => Effect.fail(makeAppError({ code: "validation", detail: "not used" })),
        cloneUrl: () => Option.none(),
        origin: () => "test",
      }),
    ),
    Layer.provide(NodeServices.layer),
  );

describe("KnowledgeManager", () => {
  it.effect("materializes a valid OKF bundle and writes its instruction discovery row", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
      try {
        const sourceRoot = nodePath.join(workspaceRoot, "source");
        writeKnowledgePackage(sourceRoot, "handbook", true);

        yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.materializeInstall({ ref: localRef("handbook", sourceRoot) });
        }).pipe(Effect.provide(managerLayer(workspaceRoot)));

        expect(
          existsSync(
            nodePath.join(
              workspaceRoot,
              ".axm",
              "extensions",
              "external",
              "knowledge",
              "handbook",
              "src",
              "concept.md",
            ),
          ),
        ).toBe(true);
        expect(existsSync(nodePath.join(workspaceRoot, ".agents", "knowledge"))).toBe(false);
        const instructions = readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8");
        expect(instructions).toContain("region=knowledge-base");
        expect(instructions).toContain("## Knowledge Base");
        expect(instructions).toContain(".axm/extensions/external/knowledge/handbook/src/index.md");
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

        expect(error.detail).toContain("requires a non-empty frontmatter type");
        expect(
          existsSync(
            nodePath.join(
              workspaceRoot,
              ".axm",
              "extensions",
              "external",
              "knowledge",
              "invalid-handbook",
            ),
          ),
        ).toBe(false);
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
              ".axm",
              "extensions",
              "external",
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
        expect(error.detail).toContain("escapes");
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
          const validRoot = nodePath.join(workspaceRoot, "valid-source");
          const invalidRoot = nodePath.join(workspaceRoot, "invalid-source");
          writeKnowledgePackage(validRoot, "handbook", true);
          writeKnowledgePackage(invalidRoot, "handbook", false);

          yield* Effect.gen(function* () {
            const manager = yield* KnowledgeManager;
            yield* manager.materializeInstall({ ref: localRef("handbook", validRoot) });
            yield* manager
              .materializeInstall({ ref: localRef("handbook", invalidRoot) })
              .pipe(Effect.flip);
          }).pipe(Effect.provide(managerLayer(workspaceRoot)));

          const canonicalConcept = nodePath.join(
            workspaceRoot,
            ".axm",
            "extensions",
            "external",
            "knowledge",
            "handbook",
            "src",
            "concept.md",
          );
          expect(readFileSync(canonicalConcept, "utf8")).toContain("type: concept");
          const instructions = readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8");
          expect(instructions).toContain("### @acme");
          expect(instructions).toContain(
            "[handbook](.axm/extensions/external/knowledge/handbook/src/index.md)",
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
            ".axm",
            "extensions",
            "external",
            "knowledge",
            "healthy",
          );
          const unavailableCanonical = nodePath.join(
            workspaceRoot,
            ".axm",
            "extensions",
            "external",
            "knowledge",
            "unavailable",
          );
          writeKnowledgePackage(healthySource, "healthy", true);
          writeKnowledgePackage(unavailableSource, "unavailable", true);
          writeKnowledgePackage(healthyCanonical, "healthy", true);
          writeKnowledgePackage(unavailableCanonical, "unavailable", true);

          const now = DateTime.makeUnsafe("2026-08-04T00:00:00.000Z");
          const locked = {
            healthy: {
              type: "local",
              path: "sources/healthy",
              installedAt: now,
              updatedAt: now,
            },
            unavailable: {
              type: "local",
              path: "sources/unavailable",
              installedAt: now,
              updatedAt: now,
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

          expect(result.failure.detail).toContain("unavailable");
          expect(readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8")).toBe(
            result.before,
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
  );
});
