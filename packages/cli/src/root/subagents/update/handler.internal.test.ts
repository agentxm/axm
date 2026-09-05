/**
 * Unit tests for the subagents update handler.
 *
 * Tests the re-resolution, change detection, selective update, and preview flows.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { SourceHostProviders } from "@agentxm/extension-sources";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import { SubagentManagerLive } from "@agentxm/extension-lifecycle/live";
import { type RegistrySubagentRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import YAML from "yaml";
import { handleUpdate, type UpdateHandlerArgs } from "./handler.js";
import {
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  expectRecord,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
  stringProperty,
} from "../../../test-helpers.js";
import { exactVersion, extensionName, handle, writeWorkspaceFiles } from "../../../test-stubs.js";

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
  writeWorkspaceFiles(axmDir, {
    agents: opts?.agents,
    subagents: opts?.subagents,
    sources: opts?.sources,
    lockfileSubagents: opts?.subagentLocks,
  });
};

const defaultArgs = (overrides: Partial<UpdateHandlerArgs> = {}): UpdateHandlerArgs => ({
  source: Option.none(),
  subagents: [],
  force: false,
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

/**
 * Publish a subagent into a file-based Registry with the layout the
 * production resolver reads: a per-extension index and one archive per
 * version. Publication predates the deterministic test clock, so every
 * version is immediately eligible.
 */
const writeRegistrySubagent = ({
  registryRoot,
  name,
  versions,
  publisherBindingId,
}: {
  readonly registryRoot: string;
  readonly name: string;
  readonly versions: ReadonlyArray<{ readonly version: string; readonly body: string }>;
  readonly publisherBindingId: string;
}) => {
  const dir = path.join(registryRoot, "extensions", "@acme", "subagents", name);
  fs.mkdirSync(dir, { recursive: true });
  const entries = versions.map(({ version, body }) => {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-update-zip-"));
    try {
      fs.mkdirSync(path.join(staging, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(staging, "subagent.json"),
        JSON.stringify({
          owner: "@acme",
          type: "subagent",
          name,
          version,
          description: `The ${name} subagent.`,
        }),
      );
      fs.writeFileSync(
        path.join(staging, "src", `${name}.md`),
        `---\nname: ${name}\ndescription: The ${name} subagent.\n---\n\n${body}\n`,
      );
      execFileSync("zip", ["-qr", path.join(dir, `${version}.zip`), "subagent.json", "src"], {
        cwd: staging,
      });
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
    const archive = fs.readFileSync(path.join(dir, `${version}.zip`));
    return {
      version,
      published: "1960-01-01T00:00:00Z",
      integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
    };
  });
  fs.writeFileSync(
    path.join(dir, "index.json"),
    JSON.stringify(
      {
        owner: "@acme",
        type: "subagent",
        name,
        publisherBindingId,
        deprecation: null,
        versions: entries,
      },
      null,
      2,
    ),
  );
};

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
      resolvePlanState: handlerTestContext.resolvePlanState,
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
        subagents: { researcher: "test:@acme/subagents/researcher" },
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
          expect(planResultUnits(result)).toEqual([
            expect.objectContaining({ label: "Skip missing", state: "ready" }),
            expect.objectContaining({ label: "researcher", state: "ready" }),
          ]);
        }),
      );
    });
  });

  describe("publisher binding change", () => {
    /**
     * The accepted resolution of `researcher` was published under one
     * publisher binding; the Registry now serves a newer version under a
     * different one.
     */
    const publisherChangeWorkspace = () => {
      const registryRoot = path.join(tempDir, "registry");
      writeRegistrySubagent({
        registryRoot,
        name: "researcher",
        publisherBindingId: "hbnd_new",
        versions: [
          { version: "1.0.0", body: "Research carefully." },
          { version: "2.0.0", body: "Research thoroughly." },
        ],
      });
      initWorkspace(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        sources: [
          {
            name: "local-reg",
            type: "registry",
            location: pathToFileURL(registryRoot).href,
          },
        ],
        subagents: { researcher: "local-reg:@acme/subagents/researcher" },
        subagentLocks: {
          researcher: {
            type: "registry",
            owner: "@acme",
            name: "researcher",
            resolvedVersion: "1.0.0",
            integrity: "sha512-accepted",
            sourceName: "local-reg",
            publisherBindingId: "hbnd_old",
          },
        },
      });
    };

    const lockedVersion = () => {
      const lockfile = expectRecord(
        YAML.parse(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8")),
        "Expected lockfile object",
      );
      const lockedSubagents = expectRecord(lockfile["subagents"], "Expected lockfile.subagents");
      return stringProperty(
        expectRecord(lockedSubagents["researcher"], "Expected researcher lock entry"),
        "resolvedVersion",
      );
    };

    it.effect(
      "blocks an unattended apply with an interactive recovery that offers no preapproval",
      () => {
        const { provide, rendererState, resolvePlanState } = makeLayers({ machine: true });
        publisherChangeWorkspace();

        return provide(
          Effect.gen(function* () {
            yield* handleUpdate(defaultArgs());

            expect(resolvePlanState.confirmApplyChangesCalls).toEqual([]);
            const [entry] = rendererState.results;
            expect(entry?.data).toMatchObject({
              result: {
                outcome: "blocked",
                blocking: {
                  class: "approval-required",
                  subject: "publisher-ownership-change",
                  detail: expect.stringContaining("Interactive approval is required"),
                  escape: {
                    description: expect.stringContaining("Approve interactively"),
                    cmd: expect.not.stringContaining("--yes"),
                  },
                },
              },
            });
            expect(JSON.stringify(entry?.data)).not.toContain("--yes");
            expect(lockedVersion()).toBe("1.0.0");
          }),
        );
      },
    );

    it.effect("reports the publisher change in preview and changes nothing", () => {
      const { provide, rendererState, resolvePlanState } = makeLayers({ machine: true });
      publisherChangeWorkspace();

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs({ preview: true }));

          const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
            planName: "Update subagents",
            totalSteps: 1,
          });
          expect(result).toMatchObject({
            riskConditions: [
              expect.objectContaining({
                level: "confirmable",
                consent: "interactive-only",
                id: "publisher-ownership-change",
              }),
            ],
          });
          expect(resolvePlanState.confirmApplyChangesCalls).toEqual([]);
          expect(lockedVersion()).toBe("1.0.0");
        }),
      );
    });

    it.effect("applies after a person approves the change at a prompt", () => {
      const { provide, resolvePlanState } = makeLayers({
        flags: { nonInteractive: false },
        prompt: { confirmResponses: [true] },
      });
      publisherChangeWorkspace();

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs());

          expect(resolvePlanState.confirmApplyChangesCalls).toHaveLength(1);
          expect(lockedVersion()).toBe("2.0.0");
        }),
      );
    });
  });
});
