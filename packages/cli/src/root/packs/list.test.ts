/**
 * Unit tests for the packs list command handler.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@agentxm/client-core/unstable/workspace";
import { expectNoPlanEnvelope } from "../../test-helpers.js";
import { handleList } from "./list.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (axmDir: string, lockfilePacks: Record<string, unknown> = {}) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify({ agents: ["claude-code"] }));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: {}, packs: lockfilePacks }),
  );
};

const makePackLockEntry = (overrides: Partial<Record<string, unknown>> = {}) => ({
  type: "registry",
  owner: "@acme",
  name: "starter-pack",
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "default",
  installedAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  resolvedSkills: {},
  resolvedCommands: {},
  resolvedMcpServers: {},
  resolvedSubagents: {},
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("packs list.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "packs-list-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: {
    readonly machine?: boolean;
    readonly wsOverrides?: Partial<WorkspaceMutationsOptions>;
  }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const rendererLayer = renderer.layer;
    const rendererState = renderer.state;
    const BaseLayer = Layer.mergeAll(NodeServices.layer, rendererLayer, TestFlagsLayer());
    const wsOptions: WorkspaceMutationsOptions = {
      scope: "project",
      ...opts?.wsOverrides,
    };
    const WsLayer = Layer.provide(coreWorkspaceLayer({ ...wsOptions }), BaseLayer);
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, rendererState };
  };

  it.effect("displays all installed packs", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      "starter-pack": makePackLockEntry({ name: "starter-pack" }),
      "frontend-tools": makePackLockEntry({
        name: "frontend-tools",
        owner: "@team",
        resolvedVersion: "2.3.1",
        sourceName: "company",
      }),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ includeIgnored: false });

        expect(rendererState.tables).toHaveLength(1);
        expect(rendererState.tables[0]?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: "starter-pack",
              owner: "@acme",
              version: "1.0.0",
              source: "default",
            }),
            expect.objectContaining({
              name: "frontend-tools",
              owner: "@team",
              version: "2.3.1",
              source: "company",
            }),
          ]),
        );
      }),
    );
  });

  it.effect("emits a single empty list payload when lockfile is empty", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleList({ includeIgnored: false });

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 0,
          items: [],
        });
        expect(rendererState.logs).toEqual([]);
      }),
    );
  });

  it.effect("emits machine-readable items for --json consumers", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(path.join(tempDir, ".axm"), {
      "starter-pack": makePackLockEntry({ name: "starter-pack" }),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ includeIgnored: false });

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [
            {
              name: "starter-pack",
              activation: "enabled",
              owner: "@acme",
              version: "1.0.0",
              source: "default",
              classification: { kind: "lifecycle", lifecycle: "implicit" },
            },
          ],
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });
});
