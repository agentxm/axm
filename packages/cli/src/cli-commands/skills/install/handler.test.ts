/**
 * Unit tests for the skills install handler error propagation.
 *
 * Verifies that resolver errors (e.g., REGISTRY_SKILL_NOT_FOUND) are preserved
 * rather than being wrapped in a generic INVALID_SOURCE error, while true parse
 * failures still produce INVALID_SOURCE.
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
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { SourceHostProvidersLive } from "../../../sources/index.js";
import { SkillManagerLive } from "../../../extensions/skills/manager.js";
import { InstallSkillCommandWorkflowActionsLive } from "./command-actions.js";
import { handleInstall, type InstallHandlerArgs } from "./handler.js";
import { CliError } from "../../../cli-error/index.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    sources?: ReadonlyArray<unknown>;
    namespace?: string;
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = { agents: ["claude-code"] };
  if (opts?.sources) settings["sources"] = opts.sources;
  if (opts?.namespace) settings["namespace"] = opts.namespace;
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: {} }),
  );
};

const createRegistrySkill = ({
  registryRoot,
  namespace,
  name,
}: {
  readonly registryRoot: string;
  readonly namespace: string;
  readonly name: string;
}) => {
  const skillDir = path.join(registryRoot, "extensions", namespace, "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "index.json"),
    JSON.stringify({
      name,
      namespace,
      type: "skill",
      versions: [
        {
          version: "1.0.0",
          published: "2025-01-01T00:00:00Z",
          agents: [],
          integrity: "sha512-AAAA==",
        },
      ],
    }),
  );
};

const defaultArgs = (
  source: string,
  overrides: Partial<InstallHandlerArgs> = {},
): InstallHandlerArgs => ({
  source,
  scope: "project",
  skills: [],
  yes: true,
  all: false,
  force: false,
  nonInteractive: Option.some(true),
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("skills install handler — error propagation", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-install-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const [logLayer, logMock] = makeClackLogTestLayer();
    const [spinnerLayer, spinnerMock] = makeClackSpinnerTestLayer();
    const [confirmLayer] = makeClackPromptTestLayer({ type: "return", value: true });
    const [selectLayer] = makeClackPromptTestLayer({ type: "select", index: 0 });
    const [multiselectLayer, multiselectMock] = makeClackPromptTestLayer({
      type: "multiselect",
      indices: [],
    });
    const [textInputLayer] = makeClackPromptTestLayer();
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      spinnerLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
      textInputLayer,
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      yes: true,
      nonInteractive: Option.some(true),
      preview: false,
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const SMLayer = Layer.provide(SkillManagerLive, Layer.mergeAll(BaseLayer, WsLayer, SPLayer));
    const ActionsLayer = Layer.provide(
      InstallSkillCommandWorkflowActionsLive,
      Layer.mergeAll(BaseLayer, WsLayer, SPLayer, SMLayer),
    );
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer, ActionsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return {
      provide,
      logMock,
      multiselectMock,
      spinnerMock,
    };
  };

  it.effect(
    "preserves REGISTRY_SKILL_NOT_FOUND from resolver instead of wrapping in INVALID_SOURCE",
    () => {
      const { provide } = makeLayers();
      // Workspace has a default namespace but no registries contain the skill
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/empty-reg" }],
        namespace: "@myorg",
      });

      return provide(
        Effect.gen(function* () {
          // "nonexistent-skill" is a bare name — it will go through resolveSkillRegistrySourceByName
          // which will fail with REGISTRY_SKILL_NOT_FOUND when no registry has it
          const error = yield* handleInstall(defaultArgs("nonexistent-skill")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("REGISTRY_SKILL_NOT_FOUND");
        }),
      );
    },
  );

  it.effect("returns INVALID_SOURCE for unparseable input", () => {
    const { provide, spinnerMock } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        // Empty string cannot be parsed — parseInputPattern returns Option.none()
        const error = yield* handleInstall(defaultArgs("")).pipe(Effect.flip);
        expect(error._tag).toBe("CliError");
        expect((error as CliError).code).toBe("INVALID_SOURCE");
        expect(spinnerMock.starts).toContain("Parsing source...");
        expect(spinnerMock.stops).toContain("Failed");
      }),
    );
  });

  it.effect(
    "discovers from the resolved registry source when an earlier registry is unsupported",
    () => {
      const { provide } = makeLayers();

      const registryDir = path.join(tempDir, "registry");
      createRegistrySkill({
        registryRoot: registryDir,
        namespace: "@myorg",
        name: "effect-basics",
      });

      initWorkspace(path.join(tempDir, ".axm"), {
        namespace: "@myorg",
        sources: [
          { type: "registry", name: "remote", location: "http://localhost:4300" },
          { type: "registry", name: "local", location: `file://${registryDir}` },
        ],
      });

      return provide(handleInstall(defaultArgs("effect-basics", { all: true })));
    },
  );

  it.effect("auto-selects a uniquely matched bare-name skill without multiselect prompt", () => {
    const { provide, logMock, multiselectMock } = makeLayers({
      yes: false,
      nonInteractive: Option.none(),
    });

    const registryDir = path.join(tempDir, "registry");
    createRegistrySkill({ registryRoot: registryDir, namespace: "@myorg", name: "effect-basics" });

    initWorkspace(path.join(tempDir, ".axm"), {
      namespace: "@myorg",
      sources: [
        { type: "registry", name: "remote", location: "http://localhost:4300" },
        { type: "registry", name: "local", location: `file://${registryDir}` },
      ],
    });

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(
          defaultArgs("effect-basics", {
            yes: false,
            nonInteractive: Option.none(),
          }),
        );

        expect(multiselectMock.calls).toHaveLength(0);
        expect(logMock.logs.message.some((line) => line.startsWith("Resolution:"))).toBe(true);
      }),
    );
  });

  it.effect("returns DISCOVER_FAILED with a concrete reason detail", () => {
    const { provide } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        const error = yield* handleInstall(defaultArgs("/path/does/not/exist")).pipe(Effect.flip);
        expect(error._tag).toBe("CliError");
        expect((error as CliError).code).toBe("DISCOVER_FAILED");
        const details = (error as CliError).details;
        const reason = details.find((d) => d.startsWith("Reason:"));
        expect(reason).toBeDefined();
        expect(reason).not.toBe("Reason:");
      }),
    );
  });
});
