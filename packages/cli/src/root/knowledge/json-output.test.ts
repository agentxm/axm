import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach } from "vitest";

import { isEffectCliExit } from "@agentxm/client-core/unstable/cli-runtime";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";

import {
  computePackageContentHashSync,
  managerLifecycleStubs,
  writeKnowledgeExtension,
  writeWorkspaceFiles,
} from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  getAppError,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { setKnowledgeEnabled } from "./activation.js";
import { handleKnowledgeLint } from "./lint.js";
import { handleKnowledgeOpen, KnowledgeOpenQueryResultSchema } from "./open.js";
import { handleKnowledgeSearch, KnowledgeSearchQueryResultSchema } from "./search.js";

const stubKnowledgeManager = {
  ...managerLifecycleStubs,
  type: "knowledge",
  refreshCatalog: () => Effect.void,
  sync: () => Effect.succeed({ changed: false, warnings: [], artifacts: [] }),
  install: () => Effect.void,
  isInstalled: () => Effect.succeed(true),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof KnowledgeManager>;

const knowledgeManagerLayer = Layer.succeed(KnowledgeManager, stubKnowledgeManager);

/**
 * Author a Knowledge package that `axm knowledge lint --path` can inspect.
 * A scalar `tags` value produces an `invalid-tags` diagnostic at error severity.
 */
const writeAuthoredBundle = (packageRoot: string, opts: { readonly valid: boolean }): void => {
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "knowledge.json"),
    JSON.stringify({
      owner: "@acme",
      type: "knowledge",
      name: "platform",
      version: "1.0.0",
      description: "Platform knowledge for authentication and operations.",
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    }),
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "index.md"),
    '---\nokf_version: "0.2"\n---\n# Platform\n\n- [Auth](auth.md)\n',
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "auth.md"),
    opts.valid
      ? "---\ntype: policy\ndescription: Auth policy\ntags: [auth, platform]\n---\n# Auth\n\nRotate tokens every 30 days.\n"
      : "---\ntype: policy\ndescription: Auth policy\ntags: auth\n---\n# Auth\n\nRotate tokens every 30 days.\n",
  );
};

describe("knowledge JSON output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-json-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("lint emits exactly one JSON document when a bundle has errors", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeAuthoredBundle(path.join(tempDir, "pkg"), { valid: false });

    return provide(
      Effect.gen(function* () {
        const exit = yield* handleKnowledgeLint(undefined, "pkg").pipe(Effect.exit);

        // Exactly one rendered document, and the non-zero exit travels as an
        // EffectCliExit defect, which withCliErrorHandling passes through
        // instead of writing a second JSON error envelope.
        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({ valid: false });
        expect(rendererState.results[0]?.ok).toBe(false);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(isEffectCliExit(Cause.squash(exit.cause))).toBe(true);
        }
      }),
    );
  });

  it.effect("lint emits exactly one JSON document and succeeds for a clean bundle", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeAuthoredBundle(path.join(tempDir, "pkg"), { valid: true });

    return provide(
      Effect.gen(function* () {
        const exit = yield* handleKnowledgeLint(undefined, "pkg").pipe(Effect.exit);

        expect(Exit.isSuccess(exit)).toBe(true);
        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({ valid: true, diagnostics: [] });
        expect(rendererState.results[0]?.ok).toBe(true);
      }),
    );
  });

  it.effect("lint returns warning diagnostics without failing a valid bundle", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeAuthoredBundle(path.join(tempDir, "pkg"), { valid: true });
    const manifestPath = path.join(tempDir, "pkg", "knowledge.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    delete manifest.description;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    return provide(
      Effect.gen(function* () {
        const exit = yield* handleKnowledgeLint(undefined, "pkg").pipe(Effect.exit);

        expect(Exit.isSuccess(exit)).toBe(true);
        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          valid: true,
          diagnostics: [
            expect.objectContaining({
              code: "missing-manifest-description",
              severity: "warning",
              relativePath: "knowledge.json",
            }),
          ],
        });
        expect(rendererState.results[0]?.ok).toBe(true);
      }),
    );
  });

  it.effect("lint preserves resource diagnostic codes and severity exits", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeAuthoredBundle(path.join(tempDir, "pkg"), { valid: true });
    const conceptPath = path.join(tempDir, "pkg", "src", "auth.md");
    fs.writeFileSync(
      conceptPath,
      "---\ntype: policy\ndescription: Auth policy\ntags: [auth]\nresource: ./missing.md\n---\n# Auth\n",
    );

    return provide(
      Effect.gen(function* () {
        const warningExit = yield* handleKnowledgeLint(undefined, "pkg").pipe(Effect.exit);
        expect(Exit.isSuccess(warningExit)).toBe(true);
        expect(rendererState.results[0]?.data).toMatchObject({
          valid: true,
          diagnostics: [
            expect.objectContaining({
              code: "unresolved-resource",
              severity: "warning",
              relativePath: "auth.md",
            }),
          ],
        });

        fs.writeFileSync(
          conceptPath,
          "---\ntype: policy\ndescription: Auth policy\ntags: [auth]\nresource: ../outside.md\n---\n# Auth\n",
        );
        const errorExit = yield* handleKnowledgeLint(undefined, "pkg").pipe(Effect.exit);
        expect(Exit.isFailure(errorExit)).toBe(true);
        expect(rendererState.results[1]?.data).toMatchObject({
          valid: false,
          diagnostics: [expect.objectContaining({ code: "escaping-resource", severity: "error" })],
        });
      }),
    );
  });

  it.effect("lint still reports the error tally in human output", () => {
    const { provide, logs } = makeWorkspaceHandlerTestContext();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeAuthoredBundle(path.join(tempDir, "pkg"), { valid: false });

    return provide(
      Effect.gen(function* () {
        yield* handleKnowledgeLint(undefined, "pkg").pipe(Effect.exit);

        expect(logs.error).toContain("1 knowledge validation error");
      }),
    );
  });

  it.effect("search reports liveness before returning machine results", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    const axmDir = path.join(tempDir, ".axm");
    writeKnowledgeExtension(axmDir, "platform");
    const packageRoot = path.join(axmDir, "extensions", "@acme", "knowledge", "platform");
    fs.writeFileSync(
      path.join(packageRoot, "src", "auth.md"),
      "---\ntype: policy\ndescription: Authentication policy\n---\n# Authentication\n\nRotate credentials.\n",
    );
    writeWorkspaceFiles(axmDir, {
      knowledge: { platform: "workspace:@acme/knowledge/platform" },
      lockfileKnowledge: {
        platform: {
          type: "workspace",
          owner: "@acme",
          extensionType: "knowledge",
          name: "platform",
          version: "1.0.0",
          sourceHash: computePackageContentHashSync(packageRoot),
          installedAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleKnowledgeSearch("Authentication");

        expect(rendererState.spinnerMessages).toEqual([
          'Searching knowledge for "Authentication"',
          'Searched knowledge for "Authentication"',
        ]);
        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          query: "Authentication",
          count: 1,
        });
      }),
    );
  });

  it.effect("search applies token, phrase, literal, and field-boundary semantics", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    const axmDir = path.join(tempDir, ".axm");
    writeKnowledgeExtension(axmDir, "platform");
    const packageRoot = path.join(axmDir, "extensions", "@acme", "knowledge", "platform");
    fs.writeFileSync(
      path.join(packageRoot, "src", "spec.md"),
      [
        "---",
        "type: reference",
        "description: Specification guide",
        "tags: [source-of-truth]",
        "---",
        "# SpecDrivenDevelopment",
        "",
        "Treat the spec as authoritative.",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(packageRoot, "src", "split.md"),
      "---\ntype: reference\ndescription: boundary only\n---\n# Cross field\n",
    );
    writeWorkspaceFiles(axmDir, {
      knowledge: { platform: "workspace:@acme/knowledge/platform" },
      lockfileKnowledge: {
        platform: {
          type: "workspace",
          owner: "@acme",
          extensionType: "knowledge",
          name: "platform",
          version: "1.0.0",
          sourceHash: computePackageContentHashSync(packageRoot),
          installedAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        const cases = [
          ["source of truth", 1],
          ["truth specification source", 1],
          ["  SOURCE\tOF  TRUTH  ", 1],
          ['"source of truth"', 1],
          ['literal:"SOURCE-OF-TRUTH"', 1],
          ['literal:"source of truth"', 0],
          ["spec driven development", 1],
          ["specifications", 0],
          ["field boundary", 1],
          ['"field boundary"', 0],
          ["definitely-absent", 0],
        ] as const;
        for (const [query, count] of cases) {
          yield* handleKnowledgeSearch(query);
          expect(rendererState.results.at(-1)?.data).toMatchObject({ query, count });
        }
      }),
    );
  });

  it.effect("search rejects empty and malformed parsed queries as validation errors", () => {
    const { provide } = makeWorkspaceHandlerTestContext({ machine: true });
    return provide(
      Effect.gen(function* () {
        for (const query of ["", " \t ", '""', 'literal:""', '"unterminated']) {
          const exit = yield* handleKnowledgeSearch(query).pipe(Effect.exit);
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            expect(getAppError(Cause.squash(exit.cause)).code).toBe("validation");
          }
        }
      }),
    );
  });

  it.effect(
    "open publishes complete parsed frontmatter without changing search or human output",
    () => {
      const axmDir = path.join(tempDir, ".axm");
      writeKnowledgeExtension(axmDir, "platform");
      const packageRoot = path.join(axmDir, "extensions", "@acme", "knowledge", "platform");
      fs.writeFileSync(
        path.join(packageRoot, "src", "architecture.md"),
        [
          "---",
          "type: reference",
          "description: Platform architecture",
          "tags: [platform, architecture]",
          "status: stable",
          "stale_after: 2026-12-31",
          "generated: { by: process:docs-build, at: 2026-08-11T00:00:00Z }",
          "verified:",
          "  - { by: human:reviewer, at: 2026-08-11T01:00:00Z }",
          "sources:",
          "  - { resource: ./source.txt, title: Architecture source }",
          "producer:",
          "  nested: [one, true, null]",
          "---",
          "# Architecture",
          "",
          "Architecture body.",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(path.join(packageRoot, "src", "source.txt"), "source");
      writeWorkspaceFiles(axmDir, {
        knowledge: { platform: "workspace:@acme/knowledge/platform" },
        lockfileKnowledge: {
          platform: {
            type: "workspace",
            owner: "@acme",
            extensionType: "knowledge",
            name: "platform",
            version: "1.0.0",
            sourceHash: computePackageContentHashSync(packageRoot),
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });

      const machine = makeWorkspaceHandlerTestContext({ machine: true });
      const human = makeWorkspaceHandlerTestContext();
      return machine.provide(
        Effect.gen(function* () {
          yield* handleKnowledgeOpen("platform", "architecture");
          const openOutput = Schema.encodeUnknownSync(KnowledgeOpenQueryResultSchema)(
            machine.rendererState.results[0]?.data,
          );
          expect(openOutput).toEqual({
            concept: {
              bundle: "platform",
              id: "architecture",
              title: "Architecture",
              type: "reference",
              description: "Platform architecture",
              tags: ["platform", "architecture"],
              relativePath: "architecture.md",
              body: "# Architecture\n\nArchitecture body.\n",
              frontmatter: {
                type: "reference",
                description: "Platform architecture",
                tags: ["platform", "architecture"],
                status: "stable",
                stale_after: "2026-12-31",
                generated: { by: "process:docs-build", at: "2026-08-11T00:00:00Z" },
                verified: [{ by: "human:reviewer", at: "2026-08-11T01:00:00Z" }],
                sources: [{ resource: "./source.txt", title: "Architecture source" }],
                producer: { nested: ["one", true, null] },
              },
            },
          });

          yield* handleKnowledgeSearch("Architecture");
          const searchOutput = Schema.encodeUnknownSync(KnowledgeSearchQueryResultSchema)(
            machine.rendererState.results[1]?.data,
          );
          expect(searchOutput.items).toHaveLength(1);
          expect(searchOutput.items[0]).not.toHaveProperty("frontmatter");

          yield* human.provide(handleKnowledgeOpen("platform", "architecture"));
          expect(human.rendererState.diagnostics).toEqual([
            "# Architecture\n\nArchitecture body.\n",
          ]);
        }),
      );
    },
  );

  it("open rejects values outside the recursive JSON data model", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    const invalidValues: ReadonlyArray<unknown> = [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      1n,
      Symbol("producer"),
      () => "producer",
      new Date("2026-08-11T00:00:00Z"),
      cyclic,
    ];
    const concept = {
      bundle: "platform",
      id: "architecture",
      title: "Architecture",
      relativePath: "architecture.md",
      body: "# Architecture\n",
    };

    for (const value of invalidValues) {
      expect(() =>
        Schema.encodeUnknownSync(KnowledgeOpenQueryResultSchema)({
          concept: { ...concept, frontmatter: { producer: value } },
        }),
      ).toThrow();
    }
  });

  it.effect("disable emits exactly one JSON document", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      knowledge: { platform: "workspace:@acme/knowledge/platform" },
    });

    return provide(
      Effect.gen(function* () {
        yield* setKnowledgeEnabled("platform", false, false).pipe(
          Effect.provide(knowledgeManagerLayer),
        );

        expect(rendererState.results).toHaveLength(1);
        expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Disable knowledge bundle",
        });
      }),
    );
  });

  it.effect("enable keeps the human success line in text mode", () => {
    const { provide, logs } = makeWorkspaceHandlerTestContext();
    const axmDir = path.join(tempDir, ".axm");
    writeKnowledgeExtension(axmDir, "platform");
    writeWorkspaceFiles(axmDir, {
      knowledge: {
        platform: { source: "workspace:@acme/knowledge/platform", enabled: false },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* setKnowledgeEnabled("platform", true, false).pipe(
          Effect.provide(knowledgeManagerLayer),
        );

        expect(logs.success).toEqual(["  + platform", "Enabled knowledge bundle platform"]);
      }),
    );
  });
});
