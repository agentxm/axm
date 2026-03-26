/**
 * Unit tests for the skills update handler.
 *
 * Tests error recovery when skill source resolution fails during update.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { TestRenderer, logsByTag } from "@axm.sh/core/unstable/cli-renderer";
import { makeTestPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliEnvironmentTest } from "@axm.sh/core/unstable/cli-flags";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { SourceHostProvidersLive } from "../../../sources/index.js";
import { handleUpdate, type UpdateHandlerArgs } from "./handler.js";
import { AppError } from "@axm.sh/core/unstable/app-error";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    skills?: Record<string, string>;
    agents?: string[];
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = {
    agents: opts?.agents ?? ["claude-code"],
  };
  if (opts?.skills) settings["skills"] = opts.skills;
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: {} }),
  );
};

const defaultArgs = (overrides: Partial<UpdateHandlerArgs> = {}): UpdateHandlerArgs => ({
  source: Option.none(),
  agents: [],
  skills: [],
  force: false,
  yes: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("update.handler — error recovery", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-update-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () => {
    const { layer: rendererLayer, state: rendererState } = TestRenderer.make();
    const [promptLayer] = makeTestPrompt({
      confirmResponses: [true],
    });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      rendererLayer,
      promptLayer,
      CliEnvironmentTest(),
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    const logs = logsByTag(rendererState);

    return { provide, logs, rendererState };
  };

  it.effect("emits warning when skill source resolution fails and reports UPDATE_FAILED", () => {
    const { provide, logs } = makeLayers();
    // Set up a workspace with one skill pointing to a nonexistent local path.
    // resolveSource will parse this as a local source, but sources.find will
    // fail because the directory does not exist — triggering the catch path.
    initWorkspace(path.join(tempDir, ".axm"), {
      skills: {
        "broken-skill": "/tmp/nonexistent-source-dir-that-does-not-exist",
      },
    });

    return provide(
      Effect.gen(function* () {
        const error = yield* handleUpdate(defaultArgs()).pipe(Effect.flip);

        // The catch path should have emitted a warning for the failed resolution
        expect(logs.warn.some((m: string) => m.includes('Failed to resolve "broken-skill"'))).toBe(
          true,
        );

        // Since all resolutions failed, the handler should fail with UPDATE_FAILED
        expect(error._tag).toBe("AppError");
        expect((error as AppError).code).toBe("UPDATE_FAILED");
      }),
    );
  });
});
