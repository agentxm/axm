/**
 * Unit tests for HookManager service.
 *
 * Tests cover Claude Code hooks config materialization behavior.
 */

import { UNCONSTRAINED_DESIRED_NODE } from "../desired-state/index.js";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { treeIntegrityOfSync } from "../desired-state/test-support/tree-integrity-sync.js";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "../transitions/settlement/live.js";
import * as Option from "effect/Option";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { HookManager } from "../materialization/managers.js";
import { applyPlannedProjections } from "../projection/index.js";
import { SourceHostProviders, SourceNotResolvable } from "../resolution/sources/index.js";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { Settings } from "../desired-state/index.js";
import {
  MockWorkspaceTransactionScope,
  TEST_CONTENT_IDENTITY,
  WorkspaceReadTest,
} from "../desired-state/testing.js";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
  WorkspaceCatalogLive,
} from "../projection/live.js";
import { describeTestFailure, extensionName, handle } from "../materialization/test-helpers.js";
import { HookManagerLive } from "./manager.js";
import type { LocalHookRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";

const writeHookPackage = (
  packageRoot: string,
  name: string,
  options?: {
    readonly timeoutMs?: number;
    readonly bindings?: ReadonlyArray<Record<string, unknown>>;
    readonly fallback?: "auto" | "none";
  },
) => {
  mkdirSync(nodePath.join(packageRoot, "src"), { recursive: true });
  writeFileSync(
    nodePath.join(packageRoot, "hook.json"),
    JSON.stringify(
      {
        owner: "@acme",
        type: "hook",
        name,
        version: "1.0.0",
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: options?.bindings ?? [{ on: "tool.pre", matcherRaw: "Write|Edit" }],
        ...(options?.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options?.fallback === undefined ? {} : { fallback: options.fallback }),
      },
      null,
      2,
    ),
  );
  writeFileSync(nodePath.join(packageRoot, "src", "hook.sh"), "#!/usr/bin/env bash\n");
};

const makeLocalHookRef = (name: string, packageRoot: string): LocalHookRef => ({
  type: "hook",
  refType: "local",
  owner: handle("@acme"),
  name: extensionName(name),
  source: { type: "local", path: packageRoot },
  sourcePath: nodePath.basename(packageRoot),
  location: pathToFileURL(packageRoot).href,
  hook: { name: decodeExtensionNameSync(name) },
});

const makeSourceHostProviders = () =>
  Layer.succeed(SourceHostProviders, {
    resolveNamedRegistry: () => Effect.die("not used"),
    find: () => Effect.succeed([]),
    fetch: () =>
      Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
    acquireForTransition: () =>
      Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
    cloneUrl: () => Option.none(),
    origin: () => "test",
  });

const makeHookManagerLayer = (
  workspaceRoot: string,
  options?: {
    readonly configuredAgents?: NonNullable<Settings["agents"]>;
    /** Hook names exposed as desired local-source hooks with accepted lock rows. */
    readonly hooks?: ReadonlyArray<string>;
  },
) => {
  const hookNames = options?.hooks ?? [];
  const axmDir = nodePath.join(workspaceRoot, ".axm");
  const entries = Object.fromEntries(
    hookNames.map((name) => [name, { source: "./source-hook", enabled: true }]),
  );
  const readLockedHooks = () =>
    Effect.sync(() =>
      Object.fromEntries(
        hookNames.map((name) => [
          name,
          {
            source: { type: "path" as const, path: decodeRelativePathSync("source-hook") },
            identity: { owner: handle("@acme"), name: extensionName(name) },
            resolved: { tree: TEST_CONTENT_IDENTITY },
            treeIntegrity: treeIntegrityOfSync(
              nodePath.join(workspaceRoot, "agent_extensions", "path", "@acme", "hooks", name),
            ),
          },
        ]),
      ),
    );
  return HookManagerLive.pipe(
    Layer.provideMerge(WorkspaceCatalogLive),
    Layer.provideMerge(CodingAgentRepositoryLive),
    Layer.provideMerge(
      WorkspaceReadTest({
        baseDir: workspaceRoot,
        runtimeDir: axmDir,
        settings: {
          agents: [...(options?.configuredAgents ?? ["claude-code"])],
          hooks: entries,
        },
        acceptedResolutions: readLockedHooks().pipe(
          Effect.map((hooks) => ({ lockfileVersion: 8, skills: {}, hooks })),
        ),
        graph: {
          complete: true,
          nodes: hookNames.map((name) => ({
            type: "hook" as const,
            name,
            identity: { authority: "path", locator: "./source-hook" },
            source: "./source-hook",
            enabled: true,
            constraint: UNCONSTRAINED_DESIRED_NODE,
            origins: [{ type: "settings" as const, source: "./source-hook", enabled: true }],
          })),
          mcpSourceClosures: [],
          problems: [],
        },
      }),
    ),
    Layer.provideMerge(MockWorkspaceTransactionScope(axmDir)),
    Layer.provide(makeSourceHostProviders()),
    Layer.provideMerge(NativeWriteAuthorityLive),
    Layer.provideMerge(WorkspaceFileWriteLocksLive),
    Layer.provideMerge(
      Layer.provideMerge(RegistryTransportTest(FetchHttpClient.layer), NodeServices.layer),
    ),
  );
};

describe("HookManager", () => {
  it.effect("updates Claude Code settings without a workspace backup", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-hook-manager-"));
      try {
        const settingsDir = nodePath.join(workspaceRoot, ".claude");
        mkdirSync(settingsDir, { recursive: true });
        const settingsPath = nodePath.join(settingsDir, "settings.json");
        writeFileSync(
          settingsPath,
          '{\n  "hooks": {\n    "Stop": [{ "hooks": [{ "type": "command", "command": "echo keep" }] }]\n  }\n}\n',
        );

        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "identity-check");

        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          yield* manager.materializeInstall({
            ref: makeLocalHookRef("identity-check", packageRoot),
          });
          yield* applyPlannedProjections(manager);
          expect(yield* manager.aggregateProjectionObservation).toEqual({
            agents: ["claude-code"],
            targets: [
              { path: ".claude/settings.json", agentIds: ["claude-code"] },
              { path: "AGENTS.md" },
            ],
          });
        }).pipe(Effect.provide(makeHookManagerLayer(workspaceRoot, { hooks: ["identity-check"] })));

        const raw = readFileSync(settingsPath, "utf8");
        expect(raw).toContain("echo keep");
        expect(raw).toContain('"PreToolUse"');
        expect(raw).toContain('"matcher": "Write|Edit"');
        expect(raw).toContain("agent_extensions/path/@acme/hooks/identity-check/src/hook.sh");
        expect(raw).not.toContain('"name": "identity-check"');
        expect(existsSync(`${settingsPath}.bak`)).toBe(false);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("serializes structured canonical tool matchers for Claude Code", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-hook-manager-"));
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "shell-check", {
          bindings: [{ on: "tool.pre", match: { tools: ["shell.exec"] } }],
        });

        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          yield* manager.materializeInstall({
            ref: makeLocalHookRef("shell-check", packageRoot),
          });
          yield* applyPlannedProjections(manager);
        }).pipe(Effect.provide(makeHookManagerLayer(workspaceRoot, { hooks: ["shell-check"] })));

        const claudeRaw = readFileSync(
          nodePath.join(workspaceRoot, ".claude", "settings.json"),
          "utf8",
        );
        expect(claudeRaw).toContain('"matcher": "Bash"');
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("uses Devin's catalog hook writer dialect", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-hook-manager-devin-"));
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "devin-check");

        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          yield* manager.materializeInstall({
            ref: makeLocalHookRef("devin-check", packageRoot),
          });
          yield* applyPlannedProjections(manager);
        }).pipe(
          Effect.provide(
            makeHookManagerLayer(workspaceRoot, {
              configuredAgents: ["devin"],
              hooks: ["devin-check"],
            }),
          ),
        );

        const raw = readFileSync(nodePath.join(workspaceRoot, ".devin", "config.json"), "utf8");
        expect(raw).toContain('"PreToolUse"');
        expect(raw).toContain('"matcher": "Write|Edit"');
        expect(raw).not.toContain('"name": "devin-check"');
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("degrades a hook to a managed advisory rule when an agent has no writer", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-hook-manager-"));
      try {
        const settingsPath = nodePath.join(workspaceRoot, ".windsurf", "settings.json");
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "unsupported-agent");

        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          yield* manager.materializeInstall({
            ref: makeLocalHookRef("unsupported-agent", packageRoot),
          });
          yield* applyPlannedProjections(manager);
          expect(yield* manager.aggregateProjectionObservation).toEqual({
            agents: ["windsurf"],
            targets: [{ path: "AGENTS.md", agentIds: ["windsurf"] }],
          });
          if (manager.configuredAgentOutcomes === undefined) {
            throw new Error("Hook configured-agent outcomes are unavailable");
          }
          expect(yield* manager.configuredAgentOutcomes("current")).toMatchObject([
            {
              name: "unsupported-agent",
              agentId: "windsurf",
              outcome: "current",
              mechanism: "advisory-fallback",
              path: "AGENTS.md",
            },
          ]);
        }).pipe(
          Effect.provide(
            makeHookManagerLayer(workspaceRoot, {
              configuredAgents: ["windsurf"],
              hooks: ["unsupported-agent"],
            }),
          ),
        );

        const instructions = readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8");
        expect(instructions).toContain("region=hook-fallbacks");
        expect(instructions).toContain("managed advisory rule");
        expect(instructions).toContain(
          "agent_extensions/path/@acme/hooks/unsupported-agent/src/hook.sh",
        );
        expect(existsSync(settingsPath)).toBe(false);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("rejects advisory degradation when fallback is none", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-hook-manager-"));
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "native-only", { fallback: "none" });

        const error = yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          yield* manager.materializeInstall({
            ref: makeLocalHookRef("native-only", packageRoot),
          });
          yield* applyPlannedProjections(manager);
        }).pipe(
          Effect.provide(
            makeHookManagerLayer(workspaceRoot, {
              configuredAgents: ["windsurf"],
              hooks: ["native-only"],
            }),
          ),
          Effect.flip,
        );

        expect(describeTestFailure(error)).toContain("forbids advisory fallback");
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect(
    "fails before writing settings when a block decision is required on observe-only event",
    () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-hook-manager-"));
        try {
          const settingsPath = nodePath.join(workspaceRoot, ".claude", "settings.json");
          const packageRoot = nodePath.join(workspaceRoot, "source-hook");
          writeHookPackage(packageRoot, "decision-check", {
            bindings: [{ on: "session.start", requires: { decision: { kind: "block" } } }],
          });

          const error = yield* Effect.gen(function* () {
            const manager = yield* HookManager;
            yield* manager.materializeInstall({
              ref: makeLocalHookRef("decision-check", packageRoot),
            });
            yield* applyPlannedProjections(manager);
          }).pipe(
            Effect.provide(makeHookManagerLayer(workspaceRoot, { hooks: ["decision-check"] })),
            Effect.flip,
          );

          expect(describeTestFailure(error)).toContain("cannot satisfy block decisions");
          expect(existsSync(settingsPath)).toBe(false);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
  );
});
