/**
 * Unit tests for the list command handler.
 *
 * Tests the read-only display of installed skills with optional agent filtering.
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
import { TestFlagsLayer } from "@axm.sh/core/unstable/cli-flags";
import type { WorkspaceContextOptions } from "@axm.sh/core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@axm.sh/core/unstable/workspace";
import { resolveBuiltinPack } from "../../builtin-pack/index.js";
import { handleList } from "./list.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  lockfileSkills: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify({ agents }));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: lockfileSkills }),
  );
};

const makeLockEntry = (agents: string[] = ["claude-code"]) => ({
  type: "local",
  path: "/installed",
  agents,
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("list.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "list-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const { layer: rendererLayer, state: rendererState } = TestRenderer.make();
    const [promptLayer] = makeTestPrompt();
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      rendererLayer,
      promptLayer,
      TestFlagsLayer(),
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(
      coreWorkspaceLayer({ ...wsOptions, resolveBuiltinPack: resolveBuiltinPack() }),
      BaseLayer,
    );
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    const logs = logsByTag(rendererState);

    return { provide, logs };
  };

  // ---------------------------------------------------------------------------
  // Display all skills
  // ---------------------------------------------------------------------------

  it.effect("displays all installed skills", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      "skill-one": makeLockEntry(),
      "skill-two": makeLockEntry(),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: [] });

        expect(logs.message.some((m) => m.includes("skill-one"))).toBe(true);
        expect(logs.message.some((m) => m.includes("skill-two"))).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Empty lockfile
  // ---------------------------------------------------------------------------

  it.effect("shows no skills message when lockfile is empty", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: [] });

        expect(logs.info.some((m) => m.includes("No skills installed"))).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Filter by single agent
  // ---------------------------------------------------------------------------

  it.effect("filters skills by single agent", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      "skill-claude": makeLockEntry(["claude-code"]),
      "skill-cursor": makeLockEntry(["cursor"]),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: ["claude-code"] });

        expect(logs.message.some((m) => m.includes("skill-claude"))).toBe(true);
        expect(logs.message.some((m) => m.includes("skill-cursor"))).toBe(false);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Filter by multiple agents (OR logic)
  // ---------------------------------------------------------------------------

  it.effect("filters by multiple agents using OR logic", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      "skill-claude": makeLockEntry(["claude-code"]),
      "skill-cursor": makeLockEntry(["cursor"]),
      "skill-other": makeLockEntry(["other-agent"]),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: ["claude-code", "cursor"] });

        expect(logs.message.some((m) => m.includes("skill-claude"))).toBe(true);
        expect(logs.message.some((m) => m.includes("skill-cursor"))).toBe(true);
        expect(logs.message.some((m) => m.includes("skill-other"))).toBe(false);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Agent filter matches nothing
  // ---------------------------------------------------------------------------

  it.effect("shows empty message when agent filter matches nothing", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      "skill-one": makeLockEntry(["claude-code"]),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: ["nonexistent-agent"] });

        expect(logs.info.some((m) => m.includes("No skills installed"))).toBe(true);
      }),
    );
  });
});
