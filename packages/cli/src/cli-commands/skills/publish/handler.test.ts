/**
 * Unit tests for the publish command handler.
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
import { handlePublish, type PublishHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile + registry source. */
const initWorkspace = (
  axmDir: string,
  registryRoot: string,
  lockfileSkills: Record<string, unknown> = {},
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.mkdirSync(registryRoot, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify({
      scope: "@test",
      agents: ["claude-code"],
      sources: [{ name: "local", type: "registry", location: new URL(`file://${registryRoot}`) }],
    }),
  );
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: lockfileSkills }),
  );
};

/** Create a managed extension in .axm/extensions/ with a manifest at root and content in src/. */
const createManagedExtension = (
  tempDir: string,
  scope: string,
  name: string,
  manifest: Record<string, unknown>,
) => {
  const extDir = path.join(tempDir, ".axm", "extensions", scope, "skills", name);
  const srcDir = path.join(extDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(extDir, "axm-skill.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(srcDir, "SKILL.md"), `---\nname: "${name}"\n---\n\n# ${name}\n`);
  return extDir;
};

const defaultArgs = (
  extension: string,
  overrides: Partial<PublishHandlerArgs> = {},
): PublishHandlerArgs => ({
  extension,
  registry: Option.none(),
  yes: true,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("publish.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-handler-test-"));
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

  describe("publish with explicit registry", () => {
    it.effect("publishes a managed extension to a named registry", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "code-review", {
        name: "@test/code-review",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs("@test/code-review", { registry: Option.some("local") }),
          );

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Registry should have the published extension index
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "skills",
            "code-review",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });
  });

  describe("publish with default registry", () => {
    it.effect("publishes to the first configured registry when no --registry flag", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "my-skill", {
        name: "@test/my-skill",
        version: "0.1.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs("@test/my-skill"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Registry should have the published extension
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "skills",
            "my-skill",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });
  });

  describe("bare name scope resolution", () => {
    it.effect("resolves bare name using scope from settings", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Create managed extension under @test scope
      createManagedExtension(tempDir, "@test", "code-review", {
        name: "@test/code-review",
        version: "0.1.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          // Pass bare name without scope
          yield* handlePublish(defaultArgs("code-review"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Should have published under @test scope
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "skills",
            "code-review",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });
  });

  describe("missing manifest error", () => {
    it.effect("fails when managed extension directory has no manifest", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Create extension directory without manifest
      const srcDir = path.join(
        tempDir,
        ".axm",
        "extensions",
        "@test",
        "skills",
        "no-manifest",
        "src",
      );
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "SKILL.md"), "# No manifest\n");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublish(defaultArgs("@test/no-manifest")).pipe(
            Effect.catchTag("CliError", (e) => Effect.succeed({ error: true, what: e.what })),
          );
          expect(result).toHaveProperty("error", true);
          expect((result as { what: string }).what).toContain("Missing manifest");
        }),
      );
    });
  });

  describe("non-managed skill error", () => {
    it.effect("fails when extension directory does not exist in .axm/extensions/", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublish(defaultArgs("@test/nonexistent")).pipe(
            Effect.catchTag("CliError", (e) =>
              Effect.succeed({
                error: true,
                what: e.what,
                howToFix: Option.getOrElse(e.howToFix, () => ""),
              }),
            ),
          );
          expect(result).toHaveProperty("error", true);
          expect((result as { what: string }).what).toContain("Managed extension not found");
          expect((result as { howToFix: string }).howToFix).toContain("axm skills fork");
        }),
      );
    });
  });
});
