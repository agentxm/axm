/**
 * Unit tests for the skills update handler.
 *
 * Tests error recovery when skill source resolution fails during update.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { SourceHostProvidersLive } from "../../../sources/index.js";
import { handleUpdate, type UpdateHandlerArgs } from "./handler.js";
import {
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../../test-helpers.js";

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
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      prompt: {
        confirmResponses: [true],
      },
    });
    const SPLayer = Layer.provide(
      SourceHostProvidersLive,
      Layer.merge(handlerTestContext.baseLayer, handlerTestContext.wsLayer),
    );
    const FullLayer = Layer.mergeAll(
      handlerTestContext.baseLayer,
      handlerTestContext.wsLayer,
      SPLayer,
    );
    const provide = makeEffectProvide(FullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
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
        expect(getAppError(error).code).toBe("UPDATE_FAILED");
      }),
    );
  });
});
