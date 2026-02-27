/**
 * Unit tests for the publish command handler.
 *
 * Tests the registry guard -> namespace resolution -> validation -> plan build -> apply flow.
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
  makeClackPromptTestLayer,
  makeClackLogTestLayer,
  makeClackSpinnerTestLayer,
} from "../../../clack-effect/index.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";
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
  skills?: Record<string, unknown>,
  sources?: ReadonlyArray<{
    readonly name: string;
    readonly type: "registry";
    readonly location: URL;
  }>,
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.mkdirSync(registryRoot, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify({
      namespace: "@test",
      agents: ["claude-code"],
      sources: sources ?? [
        { name: "local", type: "registry", location: new URL(`file://${registryRoot}`) },
      ],
      ...(skills && { skills }),
    }),
  );
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: lockfileSkills }),
  );
};

/** Create an extension in .axm/extensions/ with a manifest at root and content in src/. */
const createManagedExtension = (
  tempDir: string,
  namespace: string,
  name: string,
  manifest: Record<string, unknown>,
) => {
  const extDir = path.join(tempDir, ".axm", "extensions", namespace, "skills", name);
  const srcDir = path.join(extDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const normalizedManifest = {
    ...manifest,
    namespace,
    type: "skill",
    name,
    version: manifest["version"] ?? "0.0.1",
  };
  fs.writeFileSync(path.join(extDir, "axm-skill.json"), JSON.stringify(normalizedManifest));
  fs.writeFileSync(path.join(srcDir, "SKILL.md"), `---\nname: "${name}"\n---\n\n# ${name}\n`);
  return extDir;
};

const defaultArgs = (
  extensions: ReadonlyArray<string>,
  overrides?: Partial<PublishHandlerArgs>,
): PublishHandlerArgs => ({
  extensions,
  registry: Option.none(),
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
    const [logLayer, mockLog] = makeClackLogTestLayer();
    const [spinnerLayer, mockSpinner] = makeClackSpinnerTestLayer();
    const [confirmLayer] = makeClackPromptTestLayer({ type: "return", value: true });
    const [selectLayer] = makeClackPromptTestLayer({ type: "select", index: 0 });
    const [multiselectLayer] = makeClackPromptTestLayer({ type: "multiselect", indices: [] });
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      spinnerLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
      CliFlagsTest(),
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
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
    it.effect("publishes an extension to a named registry", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "code-review", {
        name: "@test/skills/code-review",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/skills/code-review"], { registry: Option.some("local") }),
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
        name: "@test/skills/my-skill",
        version: "0.1.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["@test/skills/my-skill"]));

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

  describe("bare name namespace resolution", () => {
    it.effect("resolves bare name using namespace from settings", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Create extension under @test namespace
      createManagedExtension(tempDir, "@test", "code-review", {
        name: "@test/skills/code-review",
        version: "0.1.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          // Pass bare name without namespace
          yield* handlePublish(defaultArgs(["code-review"]));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Should have published under @test namespace
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
    it.effect("fails when extension directory has no manifest", () => {
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
          const result = yield* handlePublish(defaultArgs(["@test/skills/no-manifest"])).pipe(
            Effect.catchTag("CliError", (e) => Effect.succeed({ error: true, what: e.what })),
          );
          expect(result).toHaveProperty("error", true);
          expect((result as { what: string }).what).toContain("Missing manifest");
        }),
      );
    });
  });

  describe("non-installed skill error", () => {
    it.effect("fails when extension directory does not exist in .axm/extensions/", () => {
      const { provide, mockSpinner } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublish(defaultArgs(["@test/skills/nonexistent"])).pipe(
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
          expect(mockSpinner.starts).toContain("Validating extensions...");
          expect(mockSpinner.stops).toContain("Failed");
        }),
      );
    });
  });

  describe("glob expansion", () => {
    it.effect("expands glob pattern against installed skill names", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "effect-basics", {
        name: "@test/skills/effect-basics",
        version: "1.0.0",
        agents: ["claude-code"],
      });
      createManagedExtension(tempDir, "@test", "effect-advanced", {
        name: "@test/skills/effect-advanced",
        version: "1.0.0",
        agents: ["claude-code"],
      });
      createManagedExtension(tempDir, "@test", "commit", {
        name: "@test/skills/commit",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          "effect-basics": "@test/skills/effect-basics",
          "effect-advanced": "@test/skills/effect-advanced",
          commit: "@test/skills/commit",
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["effect-*"]));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Both effect- skills should be published
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "skills",
                "effect-basics",
                "index.json",
              ),
            ),
          ).toBe(true);
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "skills",
                "effect-advanced",
                "index.json",
              ),
            ),
          ).toBe(true);
          // commit should NOT be published
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@test", "skills", "commit", "index.json"),
            ),
          ).toBe(false);
        }),
      );
    });

    it.effect("literal names pass through without glob expansion", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "commit", {
        name: "@test/skills/commit",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["commit"]));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@test", "skills", "commit", "index.json"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("mixed glob and literal deduplicates", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "effect-basics", {
        name: "@test/skills/effect-basics",
        version: "1.0.0",
        agents: ["claude-code"],
      });
      createManagedExtension(tempDir, "@test", "commit", {
        name: "@test/skills/commit",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          "effect-basics": "@test/skills/effect-basics",
          commit: "@test/skills/commit",
        },
      );

      return provide(
        Effect.gen(function* () {
          // effect-basics matches both the glob and the literal
          yield* handlePublish(defaultArgs(["effect-*", "effect-basics", "commit"]));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "skills",
                "effect-basics",
                "index.json",
              ),
            ),
          ).toBe(true);
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@test", "skills", "commit", "index.json"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("glob matching zero skills warns and exits cleanly", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          commit: "@test/skills/commit",
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["nonexistent-*"]));

          expect(mockLog.logs.warn.some((m) => m.includes("No skills matched"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Nothing to publish"))).toBe(true);
        }),
      );
    });

    it.effect("FQN input bypasses glob expansion", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "code-review", {
        name: "@test/skills/code-review",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["@test/skills/code-review"]));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@test", "skills", "code-review", "index.json"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("all configured skills included in glob matches", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "effect-basics", {
        name: "@test/skills/effect-basics",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          "effect-basics": { source: "@test/skills/effect-basics" },
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["effect-*"]));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
          // Only configured skill should be published
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "skills",
                "effect-basics",
                "index.json",
              ),
            ),
          ).toBe(true);
          // Only configured skills with sources are in installed set
        }),
      );
    });
  });

  describe("completion status", () => {
    it.effect("fails when plan contains failed publish steps", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "effect-basics", {
        name: "@test/skills/effect-basics",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {}, undefined, [
        { name: "local-registry", type: "registry", location: new URL("https://localhost:4300/") },
      ]);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublish(
            defaultArgs(["@test/skills/effect-basics"], {
              registry: Option.some("local-registry"),
            }),
          ).pipe(
            Effect.as({ error: false as const }),
            Effect.catchTag("CliError", (e) =>
              Effect.succeed({
                error: true as const,
                code: e.code,
                what: e.what,
                details: e.details,
              }),
            ),
          );

          expect(result).toMatchObject({ error: true, code: "PUBLISH_PLAN_FAILED" });
          if (result.error) {
            expect(result.what).toContain("Failed to publish");
            expect(result.details[0]).toContain("PUBLISH_SKILL_PUBLISH_FAILED");
            expect(result.details[0]).not.toContain("Registry URL:");
          }
          expect(mockLog.logs.warn.some((m) => m.includes("Done with errors"))).toBe(false);
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(false);
        }),
      );
    });
  });
});
