import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";

import { isEffectCliExit } from "@agentxm/extension-management/unstable/cli-runtime";

import {
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
import { handleKnowledgeConceptGet } from "./concepts/get.js";
import { handleKnowledgeConceptSearch } from "./concepts/search.js";
import { handleKnowledgeConceptStatus } from "./concepts/status.js";
import { KnowledgeManager } from "@agentxm/extension-workspace";

const stubKnowledgeManager = {
  ...managerLifecycleStubs,
  type: "knowledge",
  refreshCatalog: () => Effect.void,
  sync: () => Effect.succeed({ changed: false, warnings: [], artifacts: [] }),
  install: () => Effect.void,
  projectionPlans: () => Effect.succeed([]),
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

  it.effect(
    "lint emits structured malformed-frontmatter details and clears after correction",
    () => {
      const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"));
      const packageRoot = path.join(tempDir, "pkg");
      writeAuthoredBundle(packageRoot, { valid: true });
      fs.writeFileSync(
        path.join(packageRoot, "src", "auth.md"),
        "---\ntype: policy\ndescription: value: extra\n---\n# Auth\n",
      );

      return provide(
        Effect.gen(function* () {
          const malformed = yield* handleKnowledgeLint(undefined, "pkg").pipe(Effect.exit);
          expect(Exit.isFailure(malformed)).toBe(true);
          expect(rendererState.results[0]?.data).toMatchObject({ valid: false });
          expect(rendererState.results[0]?.data).toMatchObject({
            diagnostics: expect.arrayContaining([
              {
                bundle: "platform",
                code: "invalid-frontmatter",
                severity: "error",
                relativePath: "auth.md",
                line: 3,
                column: 14,
                message:
                  "Invalid YAML frontmatter: Nested mappings are not allowed in compact mappings",
                details: {
                  kind: "frontmatter-parse",
                  reason: "Nested mappings are not allowed in compact mappings",
                },
              },
            ]),
          });
          expect(JSON.stringify(rendererState.results[0]?.data)).not.toContain(
            "BLOCK_AS_IMPLICIT_KEY",
          );

          writeAuthoredBundle(packageRoot, { valid: true });
          const corrected = yield* handleKnowledgeLint(undefined, "pkg").pipe(Effect.exit);
          const unchanged = yield* handleKnowledgeLint(undefined, "pkg").pipe(Effect.exit);

          expect(Exit.isSuccess(corrected)).toBe(true);
          expect(Exit.isSuccess(unchanged)).toBe(true);
          expect(rendererState.results[1]?.data).toMatchObject({ valid: true, diagnostics: [] });
          expect(rendererState.results[2]?.data).toMatchObject({ valid: true, diagnostics: [] });
        }),
      );
    },
  );

  it.effect("lint human output renders malformed-frontmatter coordinates once", () => {
    const { provide, logs } = makeWorkspaceHandlerTestContext();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const packageRoot = path.join(tempDir, "pkg");
    writeAuthoredBundle(packageRoot, { valid: true });
    fs.writeFileSync(
      path.join(packageRoot, "src", "auth.md"),
      '---\ntype: policy\ndescription: "unterminated\ntags: [auth]\n---\n# Auth\n',
    );

    return provide(
      Effect.gen(function* () {
        yield* handleKnowledgeLint(undefined, "pkg").pipe(Effect.exit);

        expect(logs.error).toContain(
          "platform/auth.md:5:1: Invalid YAML frontmatter: Missing closing quote",
        );
        expect(logs.error.join("\n")).not.toContain("auth.md: auth.md");
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

  it.effect("concept discovery emits versioned identities and shared status capabilities", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    const axmDir = path.join(tempDir, ".axm");
    writeKnowledgeExtension(axmDir, "platform");
    const packageRoot = path.join(tempDir, "knowledge", "platform");
    fs.writeFileSync(
      path.join(packageRoot, "src", "auth.md"),
      "---\ntype: policy\ndescription: Authentication policy\n---\n# Authentication\n\nRotate credentials.\n",
    );
    writeWorkspaceFiles(axmDir, {
      knowledge: { platform: "workspace" },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleKnowledgeConceptSearch("Authentication", "project");

        expect(rendererState.spinnerMessages).toEqual([
          "Searching installed knowledge",
          "Searched installed knowledge",
        ]);
        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          query: { version: "axm-knowledge-query-v1", scope: "project" },
          count: 1,
          items: [
            {
              ref: {
                bundle: "@acme/knowledge/platform",
                conceptId: "auth",
                bundleVersion: "1.0.0",
              },
            },
          ],
        });
        yield* handleKnowledgeConceptGet("@acme/knowledge/platform#auth", { raw: true });
        expect(rendererState.results[1]?.data).toMatchObject({
          outcome: "found",
          concept: {
            ref: { bundle: "@acme/knowledge/platform", conceptId: "auth" },
            kind: "concept",
            raw: expect.stringContaining("# Authentication"),
          },
        });
        yield* handleKnowledgeConceptStatus();
        expect(rendererState.results[2]?.data).toMatchObject({
          capabilities: {
            version: "axm-knowledge-discovery-capabilities-v1",
            operations: ["resolve", "search", "query", "get", "related", "status"],
          },
          bundleCount: 1,
          conceptCount: 2,
        });
      }),
    );
  });

  it.effect("search rejects empty and malformed parsed queries as validation errors", () => {
    const { provide } = makeWorkspaceHandlerTestContext({ machine: true });
    return provide(
      Effect.gen(function* () {
        for (const query of ["", " \t ", '""', 'literal:""', '"unterminated']) {
          const exit = yield* handleKnowledgeConceptSearch(query, "project").pipe(Effect.exit);
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            expect(getAppError(Cause.squash(exit.cause)).code).toBe("validation");
          }
        }
      }),
    );
  });

  it.effect("disable emits exactly one JSON document", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      knowledge: { platform: "workspace" },
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
        platform: { source: "workspace", enabled: false },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* setKnowledgeEnabled("platform", true, false).pipe(
          Effect.provide(knowledgeManagerLayer),
        );

        expect(logs.success).toEqual(["Enabled 1 knowledge bundle"]);
      }),
    );
  });
});
