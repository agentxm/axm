/**
 * Unit tests for the packs publish command handler.
 *
 * Tests the registry guard -> scope resolution -> validation -> plan build -> apply flow.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  makeConfirmTestLayer,
  makeLogTestLayer,
  makeMultiselectTestLayer,
  makeSelectTestLayer,
  makeSpinnerTestLayer,
} from "../../../tui/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { SourceHostProvidersLive } from "../../../sources/index.js";
import { handlePublishPack, type PublishPackHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile + registry source. */
const initWorkspace = (axmDir: string, registryRoot: string) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.mkdirSync(registryRoot, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify({
      scope: "@test",
      agents: ["claude-code"],
      sources: [{ name: "local", type: "registry",
            location: new URL(`file://${registryRoot}`) }],
    }),
  );
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: {} }),
  );
};

/** Create a managed pack in .axm/extensions/ with a manifest. */
const createManagedPack = (
  tempDir: string,
  scope: string,
  name: string,
  manifest: Record<string, unknown>,
) => {
  const packDir = path.join(tempDir, ".axm", "extensions", scope, "packs", name);
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(path.join(packDir, "axm-pack.json"), JSON.stringify(manifest));
  return packDir;
};

const defaultArgs = (
  pack: string,
  overrides: Partial<PublishPackHandlerArgs> = {},
): PublishPackHandlerArgs => ({
  pack,
  registry: Option.none(),
  yes: true,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("packs publish.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "packs-publish-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [spinnerLayer, mockSpinner] = makeSpinnerTestLayer();
    const [confirmLayer] = makeConfirmTestLayer({ type: "return", value: true });
    const [selectLayer] = makeSelectTestLayer({ type: "return", index: 0 });
    const [multiselectLayer] = makeMultiselectTestLayer({ type: "return", indices: [] });
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      spinnerLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
    );
    const wsOptions: WorkspaceContextOptions = {
      global: false,
      yes: true,
      nonInteractive: Option.some(true),
      preview: false,
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog, mockSpinner };
  };

  describe("successful publish", () => {
    it.effect("publishes a managed pack to a named registry", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "frontend-tools", {
        name: "@test/frontend-tools",
        version: "1.0.0",
        skills: { "@test/code-review": "^1.0.0" },
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/frontend-tools", { registry: Option.some("local") }),
          );

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Registry should have the published pack index
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "packs",
            "frontend-tools",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);

          // Verify index content
          const indexContent = JSON.parse(fs.readFileSync(registryIndexPath, "utf-8"));
          expect(indexContent.name).toBe("frontend-tools");
          expect(indexContent.scope).toBe("@test");
          expect(indexContent.type).toBe("pack");
          expect(indexContent.versions).toHaveLength(1);
          expect(indexContent.versions[0].version).toBe("1.0.0");
        }),
      );
    });
  });

  describe("publish with default registry", () => {
    it.effect("publishes to the first configured registry when no --registry flag", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "my-pack", {
        name: "@test/my-pack",
        version: "0.1.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(defaultArgs("@test/my-pack"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "packs",
            "my-pack",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });
  });

  describe("missing manifest error", () => {
    it.effect("fails when managed pack directory has no manifest", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Create pack directory without manifest
      const packDir = path.join(tempDir, ".axm", "extensions", "@test", "packs", "no-manifest");
      fs.mkdirSync(packDir, { recursive: true });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublishPack(defaultArgs("@test/no-manifest")).pipe(
            Effect.catchTag("CliError", (e) => Effect.succeed({ error: true, what: e.what })),
          );
          expect(result).toHaveProperty("error", true);
          expect((result as { what: string }).what).toContain("Missing manifest");
        }),
      );
    });
  });

  describe("idempotent publish", () => {
    it.effect("succeeds when publishing the same version with same content", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "idempotent-pack", {
        name: "@test/idempotent-pack",
        version: "1.0.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          // First publish
          yield* handlePublishPack(
            defaultArgs("@test/idempotent-pack", { registry: Option.some("local") }),
          );

          // Second publish (same content, same version)
          yield* handlePublishPack(
            defaultArgs("@test/idempotent-pack", { registry: Option.some("local") }),
          );

          expect(mockLog.logs.success.filter((m) => m.includes("Done"))).toHaveLength(2);
        }),
      );
    });
  });

  describe("non-managed pack error", () => {
    it.effect("fails when pack directory does not exist in .axm/extensions/", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublishPack(defaultArgs("@test/nonexistent")).pipe(
            Effect.catchTag("CliError", (e) =>
              Effect.succeed({
                error: true,
                what: e.what,
                howToFix: Option.getOrElse(e.howToFix, () => ""),
              }),
            ),
          );
          expect(result).toHaveProperty("error", true);
          expect((result as { what: string }).what).toContain("Managed pack not found");
          expect((result as { howToFix: string }).howToFix).toContain("axm packs new");
        }),
      );
    });
  });
});
