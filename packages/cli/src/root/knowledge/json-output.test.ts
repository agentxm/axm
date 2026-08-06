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

import { isEffectCliExit } from "@agentxm/client-core/unstable/cli-runtime";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";

import {
  computePackageContentHashSync,
  managerLifecycleStubs,
  writeKnowledgeExtension,
  writeWorkspaceFiles,
} from "../../test-stubs.js";
import { expectAppliedPlanResult, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { setKnowledgeEnabled } from "./activation.js";
import { handleKnowledgeLint } from "./lint.js";
import { handleKnowledgeSearch } from "./search.js";

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

        expect(logs.success).toEqual(["Enabled knowledge bundle platform"]);
      }),
    );
  });
});
