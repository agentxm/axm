/**
 * Unit tests for the subagents update handler.
 *
 * Tests the re-resolution, change detection, selective update, and preview flows.
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
import {
  SourceHostProviders,
  SourceHostProvidersLive,
} from "@agentxm/client-core/unstable/source-resolution";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import {
  SubagentManagerLive,
  type RegistrySubagentRef,
} from "@agentxm/client-core/unstable/subagents";
import type { RegistrySource } from "@agentxm/client-core/unstable/sources";
import { handleUpdate, type UpdateHandlerArgs } from "./handler.js";
import {
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
} from "../../../test-helpers.js";
import { exactVersion, extensionName, handle } from "../../../test-stubs.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    subagents?: Record<string, unknown>;
    subagentLocks?: Record<string, unknown>;
    sources?: ReadonlyArray<Record<string, unknown>>;
    agents?: string[];
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = {
    agents: opts?.agents ?? ["claude-code"],
  };
  if (opts?.subagents) settings["subagents"] = opts.subagents;
  if (opts?.sources) settings["sources"] = opts.sources;
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  const lockfile: Record<string, unknown> = {
    lockfileVersion: 4,
    skills: {},
    subagents: opts?.subagentLocks ?? {},
  };
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

const defaultArgs = (overrides: Partial<UpdateHandlerArgs> = {}): UpdateHandlerArgs => ({
  source: Option.none(),
  agents: [],
  subagents: [],
  force: false,
  yes: false,
  preview: false,
  ...overrides,
});

const makeRegistrySubagentRef = (
  name: string,
  version: string,
  source: RegistrySource,
): RegistrySubagentRef => ({
  type: "subagent",
  refType: "registry",
  source,
  subagent: {
    name: extensionName(name),
    description: Option.none(),
  },
  owner: handle("@acme"),
  name: extensionName(name),
  version: exactVersion(version),
  publisherBindingId: "hbnd_test",
  integrity: Option.none(),
  packages: [],
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("subagents-update.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-update-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      prompt: {
        confirmResponses: [true],
      },
      ...opts,
    });
    const BaseLayer = handlerTestContext.baseLayer;
    const WsLayer = handlerTestContext.wsLayer;
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const AgentRepoLayer = Layer.provide(CodingAgentRepositoryLive, WsLayer);
    const SubagentMgrLayer = Layer.provide(
      SubagentManagerLive,
      Layer.mergeAll(WsLayer, AgentRepoLayer, BaseLayer),
    );
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer, AgentRepoLayer, SubagentMgrLayer);
    const provide = makeEffectProvide(FullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  describe("no subagents installed", () => {
    it.effect("reports nothing to update when no subagents are installed", () => {
      const { provide, logs } = makeLayers();

      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs());

          expect(logs.success.some((m) => m.includes("No subagents installed"))).toBe(true);
        }),
      );
    });

    it.effect("reports disabled-only subagent updates as no-op without skip logs", () => {
      const { provide, logs, rendererState } = makeLayers();

      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: {
          researcher: { source: "@acme/subagents/researcher", enabled: false },
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs());

          expect(logs.info).toEqual([]);
          expect(logs.success).toContain("No subagents installed.");
          expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Update subagents",
            message: "No subagents installed.",
          });
        }),
      );
    });

    it.effect("reports disabled-only subagent updates as JSON no-op without logs", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });

      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: {
          researcher: { source: "@acme/subagents/researcher", enabled: false },
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs());

          expect(logs.info).toEqual([]);
          expect(logs.success).toEqual([]);
          expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Update subagents",
            message: "No subagents installed.",
          });
        }),
      );
    });
  });

  describe("selective update with --name filter", () => {
    it.effect("filters by name", () => {
      const { provide, logs } = makeLayers();

      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: {
          researcher: "file:///nonexistent/path",
          summarizer: "file:///nonexistent/path2",
        },
        subagentLocks: {
          researcher: {
            type: "local",
            path: "nonexistent/path",
            contentIdentity: "researcher-content",
          },
          summarizer: {
            type: "local",
            path: "nonexistent/path2",
            contentIdentity: "summarizer-content",
          },
        },
      });

      return provide(
        Effect.gen(function* () {
          // Filter to only "nonexistent-*" which matches nothing
          yield* handleUpdate(defaultArgs({ subagents: ["nonexistent-*"] }));

          expect(
            logs.success.some((m) => m.includes("No installed subagents match the --name filter")),
          ).toBe(true);
        }),
      );
    });

    it.effect(
      "updates a registry subagent when positional source matches its installed name",
      () => {
        const ctx = makeWorkspaceHandlerTestContext({
          prompt: {
            confirmResponses: [true],
          },
        });
        const source = {
          type: "registry" as const,
          location: new URL("file:///tmp/subagents-registry"),
          owner: Option.some(handle("@acme")),
          name: "test",
        };
        const sourcesLayer = Layer.succeed(SourceHostProviders, {
          find: () => Effect.succeed([makeRegistrySubagentRef("researcher", "2.0.0", source)]),
          resolveNamedRegistry: () => Effect.die("unused"),
          fetch: () => Effect.die("unused"),
          cloneUrl: () => Option.none(),
          origin: () => "test",
        });
        const BaseLayer = ctx.baseLayer;
        const WsLayer = ctx.wsLayer;
        const AgentRepoLayer = Layer.provide(CodingAgentRepositoryLive, WsLayer);
        const SubagentMgrLayer = Layer.provide(
          SubagentManagerLive,
          Layer.mergeAll(WsLayer, AgentRepoLayer, BaseLayer),
        );
        const FullLayer = Layer.mergeAll(
          BaseLayer,
          WsLayer,
          sourcesLayer,
          AgentRepoLayer,
          SubagentMgrLayer,
        );
        const provide = makeEffectProvide(FullLayer);

        initWorkspace(path.join(tempDir, ".axm"), {
          subagents: {
            researcher: path.join(tempDir, "researcher-source"),
          },
          subagentLocks: {
            researcher: {
              type: "registry",
              owner: "@acme",
              name: "researcher",
              resolvedVersion: "1.0.0",
              integrity: "sha384-test",
              sourceName: "test",
              publisherBindingId: "hbnd_test",
              agents: ["claude-code"],
              installedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        });

        return provide(
          Effect.gen(function* () {
            yield* handleUpdate(defaultArgs({ source: Option.some("researcher"), preview: true }));

            expect(
              ctx.logs.info.some((message) => message.includes("Would update 1 subagent")),
            ).toBe(true);
            expect(ctx.logs.warn).toEqual([]);
          }),
        );
      },
    );

    it.effect(
      "reports no-op when positional source matches no installed subagent or source",
      () => {
        const { provide, logs, rendererState } = makeLayers();

        initWorkspace(path.join(tempDir, ".axm"), {
          subagents: {
            researcher: path.join(tempDir, "researcher-source"),
          },
          subagentLocks: {
            researcher: {
              type: "registry",
              owner: "@acme",
              name: "researcher",
              resolvedVersion: "1.0.0",
              integrity: "sha384-test",
              sourceName: "test",
              publisherBindingId: "hbnd_test",
              agents: ["claude-code"],
              installedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        });

        return provide(
          Effect.gen(function* () {
            yield* handleUpdate(defaultArgs({ source: Option.some("missing") }));

            expect(logs.success).toContain(
              'No installed subagent matched "missing" as a name or source.',
            );
            expectNoOpPlanResult(rendererState.results[0]?.data, {
              planName: "Update subagents",
              message: 'No installed subagent matched "missing" as a name or source.',
            });
          }),
        );
      },
    );
  });

  describe("preview mode", () => {
    it.effect("reports nothing to update for empty lockfile in preview mode", () => {
      const { provide, logs } = makeLayers();

      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs());

          expect(logs.success.some((m) => m.includes("No subagents installed"))).toBe(true);
        }),
      );
    });

    it.effect("reports a held Registry subagent as a zero-step policy outcome", () => {
      const ctx = makeWorkspaceHandlerTestContext({ machine: true });
      const sourcesLayer = Layer.succeed(SourceHostProviders, {
        find: () => Effect.die("unused"),
        resolveNamedRegistry: (_source, options) =>
          Effect.succeed({
            kind: "policy_held" as const,
            target: `${options.owner}/subagents/${options.name}`,
            candidate: {
              version: "2.0.0",
              publishedAt: "2026-08-11T12:00:00.000Z",
              eligibleAt: "2026-08-12T12:00:00.000Z",
              minimumReleaseAgeSeconds: 86_400,
            },
          }),
        fetch: () => Effect.die("unused"),
        cloneUrl: () => Option.none(),
        origin: () => "test",
      });
      const agentRepoLayer = Layer.provide(CodingAgentRepositoryLive, ctx.wsLayer);
      const subagentManagerLayer = Layer.provide(
        SubagentManagerLive,
        Layer.mergeAll(ctx.wsLayer, agentRepoLayer, ctx.baseLayer),
      );
      const provide = makeEffectProvide(
        Layer.mergeAll(
          ctx.baseLayer,
          ctx.wsLayer,
          sourcesLayer,
          agentRepoLayer,
          subagentManagerLayer,
        ),
      );
      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: { researcher: "@acme/subagents/researcher" },
        sources: [
          {
            name: "test",
            type: "registry",
            location: "file:///tmp/subagents-registry",
          },
        ],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs());

          const result = expectNoOpPlanResult(ctx.rendererState.results[0]?.data, {
            planName: "Update subagents",
            totalSteps: 0,
          });
          expect(result).toMatchObject({
            holdbackCount: 1,
            holdbacks: [
              {
                target: "@acme/subagents/researcher",
                candidateVersion: "2.0.0",
              },
            ],
          });
        }),
      );
    });

    it.effect("emits skipped unresolved subagents as plan steps without warning logs", () => {
      const ctx = makeWorkspaceHandlerTestContext({
        machine: true,
        prompt: {
          confirmResponses: [true],
        },
      });
      const source = {
        type: "registry" as const,
        location: new URL("file:///tmp/subagents-registry"),
        owner: Option.some(handle("@acme")),
        name: "test",
      };
      const sourcesLayer = Layer.succeed(SourceHostProviders, {
        find: (_source, request) =>
          Effect.succeed(
            request.names.includes("researcher")
              ? [makeRegistrySubagentRef("researcher", "2.0.0", source)]
              : [],
          ),
        resolveNamedRegistry: () => Effect.die("unused"),
        fetch: () => Effect.die("unused"),
        cloneUrl: () => Option.none(),
        origin: () => "test",
      });
      const BaseLayer = ctx.baseLayer;
      const WsLayer = ctx.wsLayer;
      const AgentRepoLayer = Layer.provide(CodingAgentRepositoryLive, WsLayer);
      const SubagentMgrLayer = Layer.provide(
        SubagentManagerLive,
        Layer.mergeAll(WsLayer, AgentRepoLayer, BaseLayer),
      );
      const FullLayer = Layer.mergeAll(
        BaseLayer,
        WsLayer,
        sourcesLayer,
        AgentRepoLayer,
        SubagentMgrLayer,
      );
      const provide = makeEffectProvide(FullLayer);

      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: {
          researcher: path.join(tempDir, "researcher-source"),
          missing: path.join(tempDir, "missing-source"),
        },
        subagentLocks: {
          researcher: {
            type: "registry",
            owner: "@acme",
            name: "researcher",
            resolvedVersion: "1.0.0",
            integrity: "sha384-test",
            sourceName: "test",
            publisherBindingId: "hbnd_test",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          missing: {
            type: "registry",
            owner: "@acme",
            name: "missing",
            resolvedVersion: "1.0.0",
            integrity: "sha384-test",
            sourceName: "test",
            publisherBindingId: "hbnd_test",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs({ preview: true }));

          expect(ctx.logs.warn).toEqual([]);
          const result = expectPreviewedPlanResult(ctx.rendererState.results[0]?.data, {
            planName: "Update subagents",
            totalSteps: 2,
          });
          expect(planResultSteps(result)).toEqual([
            expect.objectContaining({ label: "researcher", status: "ready" }),
            expect.objectContaining({ label: "Skip missing", status: "ready" }),
          ]);
        }),
      );
    });
  });
});
