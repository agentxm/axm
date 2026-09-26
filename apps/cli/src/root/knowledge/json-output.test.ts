import { startedUnits } from "../../test-support/presenter-test.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";

import {
  managerLifecycleStubs,
  NO_MATERIALIZATION_FACTS,
  writeKnowledgeExtension,
  writeWorkspaceFiles,
} from "../../test-support/test-stubs.js";
import {
  expectAppliedPlanResult,
  makeWorkspaceHandlerTestContext,
} from "../../test-support/test-helpers.js";
import { handleActivation } from "../activation-handler.js";
import { handleKnowledgeLint } from "./lint.js";
import { handleKnowledgeConceptGet } from "./concepts/get.js";
import { handleKnowledgeConceptSearch } from "./concepts/search.js";
import { handleKnowledgeConceptStatus } from "./concepts/status.js";
import { handleKnowledgeConceptResolve } from "./concepts/resolve.js";
import { handleKnowledgeConceptRelated } from "./concepts/related.js";
import { handleKnowledgeConceptQuery } from "./concepts/query.js";
import { handleList as handleKnowledgeList } from "./list.js";
import { paintText } from "../../screen/index.js";
import { KnowledgeManager } from "@agentxm/workspace/materialization";
import { CodingAgentRepositoryLive } from "@agentxm/workspace/projection/live";
import { SourceHostProvidersLive } from "@agentxm/workspace/resolution/sources/live";
import {
  HookManagerLive,
  McpServerManagerLive,
  PackManagerLive,
  RuleManagerLive,
  SkillManagerLive,
  SubagentManagerLive,
} from "@agentxm/workspace/materialization/live";
const stubKnowledgeManager = {
  ...managerLifecycleStubs,
  refreshCatalog: () => Effect.void,
  sync: () => Effect.succeed({ changed: false, warnings: [], artifacts: [] }),
  projectionPlans: () => Effect.succeed([]),
  isInstalled: () => Effect.succeed(true),
  materializeInstall: () => Effect.succeed(NO_MATERIALIZATION_FACTS),
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.succeed(NO_MATERIALIZATION_FACTS),
} satisfies ServiceMap.Service.Shape<typeof KnowledgeManager>;

const knowledgeManagerLayer = Layer.succeed(KnowledgeManager, stubKnowledgeManager);

/**
 * Substitute Knowledge behavior in the ordinary per-kind service composition.
 */
const knowledgeActivationLayer = Layer.provideMerge(
  Layer.mergeAll(
    knowledgeManagerLayer,
    SkillManagerLive,
    SubagentManagerLive,
    RuleManagerLive,
    HookManagerLive,
    McpServerManagerLive,
    PackManagerLive,
  ),
  Layer.mergeAll(CodingAgentRepositoryLive, SourceHostProvidersLive),
);

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

        // The non-zero verdict is returned with the one rendered document.
        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({ valid: false });
        expect(rendererState.results[0]?.ok).toBe(false);
        expect(exit).toEqual(Exit.succeed({ _tag: "ProcessOutcome", exitCode: 1 }));
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
          expect(malformed).toEqual(Exit.succeed({ _tag: "ProcessOutcome", exitCode: 1 }));
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
        expect(errorExit).toEqual(Exit.succeed({ _tag: "ProcessOutcome", exitCode: 1 }));
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

        expect(startedUnits(rendererState)).toEqual(["installed knowledge"]);
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

  it.effect("each human discovery result is complete on stdout and observes its inspection", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext();
    const axmDir = path.join(tempDir, ".axm");
    writeKnowledgeExtension(axmDir, "platform");
    fs.writeFileSync(
      path.join(tempDir, "knowledge", "platform", "src", "auth.md"),
      "---\ntype: policy\ndescription: Authentication policy\n---\n# Authentication\n\nRotate credentials.\n",
    );
    writeWorkspaceFiles(axmDir, { knowledge: { platform: "workspace" } });
    const reference = "@acme/knowledge/platform#auth";
    return provide(
      Effect.gen(function* () {
        const cases = [
          [handleKnowledgeList(), "platform"],
          [handleKnowledgeConceptSearch("Authentication", "project"), "auth"],
          [
            handleKnowledgeConceptQuery("project", {
              expression: "Authentication",
              fields: [],
              properties: [],
              metadata: [],
              lifecycle: [],
              tags: [],
              explain: false,
            }),
            "auth",
          ],
          [handleKnowledgeConceptResolve(reference), reference],
          [handleKnowledgeConceptGet(reference), "Rotate credentials."],
          [handleKnowledgeConceptRelated(reference), "No related installed knowledge concepts"],
          [handleKnowledgeConceptStatus(), "Knowledge discovery"],
        ] as const;
        for (const [command, expected] of cases) {
          const before = rendererState.docs.length;
          const eventsBefore = rendererState.events.length;
          yield* command;
          const stdout = rendererState.docs
            .slice(before)
            .filter((entry) => entry.channel === "stdout")
            .flatMap((entry) => paintText(entry.doc, { width: "unbounded", colors: false }))
            .join("\n");
          expect(stdout).toContain(expected);
          expect(rendererState.events.slice(eventsBefore).at(0)?._tag).toBe("OperationStarted");
          expect(rendererState.events.at(-1)?._tag).toBe("OperationSettled");
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
        yield* handleActivation("knowledge", {
          name: "platform",
          enabled: false,
          preview: false,
        }).pipe(Effect.provide(knowledgeActivationLayer));

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
        yield* handleActivation("knowledge", {
          name: "platform",
          enabled: true,
          preview: false,
        }).pipe(Effect.provide(knowledgeActivationLayer));

        expect(logs.success).toEqual(["Enabled 1 knowledge bundle"]);
      }),
    );
  });
});
