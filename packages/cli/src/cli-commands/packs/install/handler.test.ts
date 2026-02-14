/**
 * Unit tests for the packs install command handler.
 *
 * Tests the pack install flow: source validation, plan build, and execution.
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
import { SourceProvidersLive } from "../../../sources/index.js";
import { handleInstallPack, type InstallPackHandlerArgs } from "./handler.js";
import { CliError } from "../../../cli-error/index.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    lockfileSkills?: Record<string, unknown>;
    lockfilePacks?: Record<string, unknown>;
    settingsPacks?: Record<string, unknown>;
    sources?: ReadonlyArray<unknown>;
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = { agents: ["claude-code"] };
  if (opts?.settingsPacks) settings["packs"] = opts.settingsPacks;
  if (opts?.sources) settings["sources"] = opts.sources;
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({
      lockfileVersion: 1,
      skills: opts?.lockfileSkills ?? {},
      ...(opts?.lockfilePacks ? { packs: opts.lockfilePacks } : {}),
    }),
  );
};

const defaultArgs = (
  source: string,
  overrides: Partial<InstallPackHandlerArgs> = {},
): InstallPackHandlerArgs => ({
  source,
  global: false,
  yes: true,
  force: false,
  nonInteractive: Option.some(true),
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("packs install handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "packs-install-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (
    tuiConfig?: {
      confirmBehavior?: import("../../../tui/index.js").ConfirmBehavior;
      selectBehavior?: import("../../../tui/index.js").SelectBehavior;
      multiselectBehavior?: import("../../../tui/index.js").MultiselectBehavior;
    },
    wsOverrides?: Partial<WorkspaceContextOptions>,
  ) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [spinnerLayer, mockSpinner] = makeSpinnerTestLayer();
    const [confirmLayer] = makeConfirmTestLayer(
      tuiConfig?.confirmBehavior ?? { type: "return", value: true },
    );
    const [selectLayer] = makeSelectTestLayer(
      tuiConfig?.selectBehavior ?? { type: "return", index: 0 },
    );
    const [multiselectLayer] = makeMultiselectTestLayer(
      tuiConfig?.multiselectBehavior ?? { type: "return", indices: [] },
    );
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
    const SPLayer = Layer.provide(SourceProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog, mockSpinner };
  };

  // ---------------------------------------------------------------------------
  // Non-registry source rejected
  // ---------------------------------------------------------------------------

  describe("non-registry source rejection", () => {
    it.effect("rejects local path sources", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleInstallPack(defaultArgs("./local-path")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("registry");
        }),
      );
    });

    it.effect("rejects github sources", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleInstallPack(defaultArgs("github:owner/repo")).pipe(
            Effect.flip,
          );
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("registry");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Already installed (no --force)
  // ---------------------------------------------------------------------------

  describe("already installed", () => {
    it.effect("skips when pack already installed and no --force", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        lockfilePacks: {
          "my-pack": {
            type: "registry",
            scope: "@acme",
            name: "my-pack",
            resolvedVersion: "1.0.0",
            checksum: "abc",
            sourceName: "default",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {},
            resolvedCommands: {},
            resolvedMcpServers: {},
          },
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/my-pack"));

          expect(mockLog.logs.warn.some((m) => m.includes("already installed"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Nothing to install"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Preview mode
  // ---------------------------------------------------------------------------

  describe("preview mode", () => {
    it.effect("fails at registry guard when no registry configured", () => {
      const { provide } = makeLayers(
        { confirmBehavior: { type: "return", value: false } },
        { preview: true, yes: false, nonInteractive: Option.some(true) },
      );
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          // Fails at registry guard since no registry is configured in non-interactive mode
          const error = yield* handleInstallPack(defaultArgs("@acme/test-pack")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("REGISTRY_NOT_CONFIGURED");
        }),
      );
    });
  });
});
