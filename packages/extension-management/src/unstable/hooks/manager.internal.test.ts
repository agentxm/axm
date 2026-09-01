import { toAppError } from "../app-error/conversions.js";
/**
 * Unit tests for HookManager service.
 *
 * Tests cover Claude Code hooks config materialization behavior.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { applyPlannedProjections } from "@agentxm/extension-workspace";
import { SourceHostProviders } from "../source-resolution/index.js";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { makeBaseWorkspaceMock, TEST_CONTENT_IDENTITY } from "@agentxm/workspace-state/testing";
import { WorkspaceCatalogLive } from "../cli-runtime/workspace-catalog-live.js";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import { computeMaterializedTreeIntegritySync, extensionName, handle } from "../test-helpers.js";
import { HookManager, HookManagerLive } from "./manager.js";
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
      Effect.fail(
        makeAppError({
          code: "validation",
          detail: "not used",
        }),
      ),
    cloneUrl: () => Option.none(),
    origin: () => "test",
  });

const makeHookManagerLayer = (
  workspaceRoot: string,
  options?: {
    readonly configuredAgents?: ReadonlyArray<string>;
    /** Hook names exposed as desired local-source hooks with accepted lock rows. */
    readonly hooks?: ReadonlyArray<string>;
  },
) => {
  const hookNames = options?.hooks ?? [];
  const entries = Object.fromEntries(
    hookNames.map((name) => [name, { source: "./source-hook", enabled: true }]),
  );
  return HookManagerLive.pipe(
    Layer.provideMerge(WorkspaceCatalogLive),
    Layer.provideMerge(CodingAgentRepositoryLive),
    Layer.provide(
      Layer.succeed(
        WorkspaceMutations,
        makeBaseWorkspaceMock(nodePath.join(workspaceRoot, ".axm"), {
          getConfiguredAgents: () => Effect.succeed(options?.configuredAgents ?? ["claude-code"]),
          getConfiguredHookEntries: () => Effect.succeed(entries),
          getLockedHooks: () =>
            Effect.sync(() =>
              Object.fromEntries(
                hookNames.map((name) => [
                  name,
                  {
                    type: "local" as const,
                    sourceType: "local" as const,
                    sourceName: "local" as const,
                    extensionType: "hook" as const,
                    workspaceName: extensionName(name),
                    packageFormat: "agentxm" as const,
                    packageOwner: handle("@acme"),
                    packageName: extensionName(name),
                    path: decodeRelativePathSync("source-hook"),
                    contentIdentity: TEST_CONTENT_IDENTITY,
                    treeIntegrity: computeMaterializedTreeIntegritySync(
                      nodePath.join(workspaceRoot, "agent_extensions", "local", "source-hook"),
                    ),
                  },
                ]),
              ),
            ),
        }),
      ),
    ),
    Layer.provide(makeSourceHostProviders()),
    Layer.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer)),
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
          if (manager.getLastMaterialization === undefined) {
            throw new Error("Hook materialization observation is unavailable");
          }
          expect(
            yield* manager.getLastMaterialization({
              target: { type: "hook", name: "identity-check" },
            }),
          ).toEqual({
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
        expect(raw).toContain("agent_extensions/local/source-hook/src/hook.sh");
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
          if (manager.getLastMaterialization === undefined) {
            throw new Error("Hook materialization observation is unavailable");
          }
          expect(
            yield* manager.getLastMaterialization({
              target: { type: "hook", name: "unsupported-agent" },
            }),
          ).toEqual({
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
        expect(instructions).toContain("agent_extensions/local/source-hook/src/hook.sh");
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

        expect(toAppError(error).detail).toContain("forbids advisory fallback");
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

          expect(toAppError(error).detail).toContain("cannot satisfy block decisions");
          expect(existsSync(settingsPath)).toBe(false);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
  );
});
