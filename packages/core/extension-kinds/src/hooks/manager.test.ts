/**
 * Unit tests for HookManager service.
 *
 * Tests cover Claude Code hooks config materialization behavior.
 */

import {
  UNCONSTRAINED_DESIRED_NODE,
  computePackageContentHash,
  hookConfigurationHash,
  hookReceiptFilename,
  type Settings,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { arch, platform as hostPlatform, tmpdir } from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import * as FileSystem from "effect/FileSystem";
import type * as ServiceMap from "effect/Context";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  treeIntegrityOfSync,
  MockWorkspaceTransactionScope,
  WorkspaceReadTest,
  describeTestFailure,
  extensionName,
  handle,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import * as Option from "effect/Option";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { HookManager, type ManagerRequirements } from "@agentxm/workspace-kernel/materialization";
import {
  applyPlannedProjections,
  applyProjectionPlans,
  observeObservedPlans,
  observeProjectionPlans,
} from "@agentxm/workspace-kernel/projection";
import { SourceHostProviders, SourceNotResolvable } from "@agentxm/workspace-kernel/sources";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import { HookManagerLive } from "./manager.js";
import type { LocalHookRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { WorkspaceCatalogLive } from "@agentxm/workspace-kernel/sources/live";

const writeHookPackage = (
  packageRoot: string,
  name: string,
  options?: {
    readonly timeoutMs?: number;
    readonly runtime?: "bash" | "node" | "python";
    readonly bindings?: ReadonlyArray<Record<string, unknown>>;
    readonly fixtures?: ReadonlyArray<Record<string, unknown>>;
    readonly configuration?: Record<string, unknown>;
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
        ...(options?.fixtures === undefined ? {} : { fixtures: options.fixtures }),
        ...(options?.configuration === undefined ? {} : { configuration: options.configuration }),
        implementations: ["claude-code", "codex", "devin"].map((protocol) => ({
          id: protocol,
          protocol,
          bindings: (options?.bindings ?? [{ event: "PreToolUse", matcher: "Write|Edit" }]).map(
            (binding, index) => ({
              id: `binding-${index}`,
              ...binding,
              handler: {
                type: "command",
                runtime: options?.runtime ?? "bash",
                entrypoint: "src/hook.sh",
                ...(options?.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
              },
            }),
          ),
        })),
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
    /** Native platform services; a recording filesystem replaces the platform one. */
    readonly platform?: typeof NativePlatformTest;
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
            resolved: { tree: treeIntegrityOfSync(nodePath.join(workspaceRoot, "source-hook")) },
            treeIntegrity: treeIntegrityOfSync(nodePath.join(workspaceRoot, "source-hook")),
          },
        ]),
      ),
    );
  return HookManagerLive.pipe(
    Layer.provideMerge(WorkspaceCatalogLive),
    Layer.provideMerge(CodingAgentRepositoryLive),
    Layer.provideMerge(NativeWriteAuthorityLive),
    Layer.provideMerge(
      WorkspaceReadTest({
        baseDir: workspaceRoot,
        runtimeDir: axmDir,
        settings: {
          agents: [...(options?.configuredAgents ?? ["claude-code"])],
          hooks: entries,
        },
        acceptedResolutions: readLockedHooks().pipe(
          Effect.map((hooks) => ({ lockfileVersion: 1, skills: {}, hooks })),
        ),
        graph: {
          packMembership: [],
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
    Layer.provideMerge(WorkspaceFileWriteLocksLive),
    Layer.provideMerge(
      Layer.provideMerge(
        RegistryTransportTest(FetchHttpClient.layer),
        options?.platform ?? NativePlatformTest,
      ),
    ),
  );
};

describe("HookManager", () => {
  it.effect("refuses an entrypoint symlink escaping the package before native publication", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-hook-resource-"),
      );
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "audit");
        const entrypoint = nodePath.join(packageRoot, "src/hook.sh");
        rmSync(entrypoint);
        writeFileSync(nodePath.join(workspaceRoot, "outside.sh"), "echo must-not-run\n");
        symlinkSync("../../outside.sh", entrypoint);
        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          const failure = yield* manager
            .prepareProjection([makeLocalHookRef("audit", packageRoot)])
            .pipe(Effect.flip);
          expect(failure).toMatchObject({
            _tag: "HookDefinitionInvalid",
            cause: { _tag: "PathTraversalDetected" },
          });
          expect(existsSync(nodePath.join(workspaceRoot, ".claude/settings.json"))).toBe(false);
        }).pipe(Effect.provide(makeHookManagerLayer(workspaceRoot, { hooks: ["audit"] })));
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );
  it.effect("refuses a hook.json key the manifest schema does not declare", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(realpathSync(tmpdir()), "axm-hook-excess-"));
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "audit");
        const manifestPath = nodePath.join(packageRoot, "hook.json");
        const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
        writeFileSync(
          manifestPath,
          JSON.stringify(
            typeof manifest === "object" && manifest !== null
              ? { ...manifest, undeclared: true }
              : manifest,
          ),
        );
        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          const failure = yield* manager
            .prepareProjection([makeLocalHookRef("audit", packageRoot)])
            .pipe(Effect.flip);
          expect(failure).toMatchObject({
            _tag: "HookDefinitionInvalid",
            cause: { _tag: "ManifestError", code: "manifest_schema_invalid" },
          });
        }).pipe(Effect.provide(makeHookManagerLayer(workspaceRoot, { hooks: ["audit"] })));
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );
  it.effect("activates a distributed package with intentionally omitted fixture files", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-hook-distributed-"),
      );
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "audit", {
          fixtures: [
            {
              id: "author-only",
              implementation: "claude-code",
              binding: "binding-0",
              input: "fixtures/input.json",
              expect: { exitCode: 0, stdout: "fixtures/output.txt" },
            },
          ],
        });
        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          yield* manager.materializeInstall({ ref: makeLocalHookRef("audit", packageRoot) });
          yield* manager.projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));
          expect(
            readFileSync(nodePath.join(workspaceRoot, ".claude/settings.json"), "utf8"),
          ).toContain("src/hook.sh");
        }).pipe(Effect.provide(makeHookManagerLayer(workspaceRoot, { hooks: ["audit"] })));
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );
  it.effect(
    "refuses an aliased TOML co-reader before settings, canonical content, or native publication",
    () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-hook-cross-kind-"),
        );
        try {
          const packageRoot = nodePath.join(workspaceRoot, "source-hook");
          writeHookPackage(packageRoot, "audit");
          mkdirSync(nodePath.join(workspaceRoot, ".claude"));
          mkdirSync(nodePath.join(workspaceRoot, ".codex"));
          const native = nodePath.join(workspaceRoot, ".claude/settings.json");
          writeFileSync(native, "");
          symlinkSync(
            "../.claude/settings.json",
            nodePath.join(workspaceRoot, ".codex/config.toml"),
          );
          yield* Effect.gen(function* () {
            const manager = yield* HookManager;
            const prepared = yield* manager
              .prepareProjection([makeLocalHookRef("audit", packageRoot)])
              .pipe(Effect.result);
            expect(prepared._tag).toBe("Failure");
            expect(readFileSync(native, "utf8")).toBe("");
            expect(existsSync(nodePath.join(workspaceRoot, "agent_extensions"))).toBe(false);
            expect(existsSync(nodePath.join(workspaceRoot, "axm.json"))).toBe(false);
          }).pipe(
            Effect.provide(
              makeHookManagerLayer(workspaceRoot, {
                configuredAgents: ["claude-code", "codex"],
                hooks: ["audit"],
              }),
            ),
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
  );

  it.effect("projects declared native routes without insertion receipts", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-hook-new-route-"),
      );
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "audit");
        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          yield* manager.materializeInstall({ ref: makeLocalHookRef("audit", packageRoot) });
          yield* manager
            .projectionPlans({ nativeInsertionEligibleAgentIds: new Set(["devin"]) })
            .pipe(Effect.flatMap(applyProjectionPlans));
          expect(existsSync(nodePath.join(workspaceRoot, ".axm/projection-containers.json"))).toBe(
            false,
          );
          for (const route of [".devin/config.json", ".claude/settings.json"])
            expect(readFileSync(nodePath.join(workspaceRoot, route), "utf8")).toContain(
              "src/hook.sh",
            );
        }).pipe(
          Effect.provide(
            makeHookManagerLayer(workspaceRoot, {
              configuredAgents: ["claude-code", "devin"],
              hooks: ["audit"],
            }),
          ),
        );
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("keeps an aliased native route free of ownership receipts", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-hook-existing-route-"),
      );
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "audit", { bindings: [{ event: "SessionStart" }] });
        mkdirSync(nodePath.join(workspaceRoot, ".claude"));
        mkdirSync(nodePath.join(workspaceRoot, ".devin"));
        writeFileSync(nodePath.join(workspaceRoot, ".claude/settings.json"), "");
        symlinkSync("../.claude/settings.json", nodePath.join(workspaceRoot, ".devin/config.json"));
        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          yield* manager.materializeInstall({ ref: makeLocalHookRef("audit", packageRoot) });
          yield* manager
            .projectionPlans({ nativeInsertionEligibleAgentIds: new Set(["devin"]) })
            .pipe(Effect.flatMap(applyProjectionPlans));
          expect(existsSync(nodePath.join(workspaceRoot, ".axm/projection-containers.json"))).toBe(
            false,
          );
        }).pipe(
          Effect.provide(
            makeHookManagerLayer(workspaceRoot, {
              configuredAgents: ["claude-code", "devin"],
              hooks: ["audit"],
            }),
          ),
        );
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  for (const coReader of ["devin", "gemini-cli"] as const) {
    it.effect(
      `${coReader === "devin" ? "coalesces compatible" : "refuses incompatible"} readers of one aliased native Hook file`,
      () =>
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(
            nodePath.join(realpathSync(tmpdir()), "axm-hook-locations-"),
          );
          try {
            const packageRoot = nodePath.join(workspaceRoot, "source-hook");
            writeHookPackage(packageRoot, "audit", { bindings: [{ event: "SessionStart" }] });
            mkdirSync(nodePath.join(workspaceRoot, ".claude"));
            const native = nodePath.join(workspaceRoot, ".claude/settings.json");
            const otherPath = coReader === "devin" ? ".devin/config.json" : ".gemini/settings.json";
            const alias = nodePath.join(workspaceRoot, otherPath);
            mkdirSync(nodePath.dirname(alias));
            writeFileSync(native, "{}\n");
            symlinkSync("../.claude/settings.json", alias);
            yield* Effect.gen(function* () {
              const manager = yield* HookManager;
              const prepared = yield* manager
                .prepareProjection([makeLocalHookRef("audit", packageRoot)])
                .pipe(Effect.result);
              if (coReader === "gemini-cli") {
                expect(prepared._tag).toBe("Failure");
                expect(readFileSync(native, "utf8")).toBe("{}\n");
                return;
              }
              expect(prepared._tag).toBe("Success");
              yield* manager.materializeInstall({ ref: makeLocalHookRef("audit", packageRoot) });
              yield* applyPlannedProjections(manager);
              const materialization = yield* manager.aggregateProjectionObservation;
              expect(
                materialization.nativeLocations?.filter(
                  ({ mechanism }) => mechanism === "structured-entry",
                ),
              ).toMatchObject([
                {
                  address: { path: native },
                  aliases: [native, alias].sort(),
                  configuredConsumers: ["claude-code", "devin"],
                },
              ]);
              const beforeRepeat = readFileSync(native, "utf8");
              expect(beforeRepeat).not.toContain("x-axm");
              expect(beforeRepeat.match(/"command":/g)).toHaveLength(1);
              yield* applyPlannedProjections(manager);
              expect(readFileSync(native, "utf8")).toBe(beforeRepeat);
              expect(readlinkSync(alias)).toBe("../.claude/settings.json");
            }).pipe(
              Effect.provide(
                makeHookManagerLayer(workspaceRoot, {
                  configuredAgents: ["claude-code", coReader],
                  hooks: ["audit"],
                }),
              ),
            );
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
    );
  }

  it.effect("updates Claude Code settings without a workspace backup", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(realpathSync(tmpdir()), "axm-hook-manager-"));
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
          expect(yield* manager.aggregateProjectionObservation).toMatchObject({
            agents: ["claude-code"],
            targets: [{ path: ".claude/settings.json", agentIds: ["claude-code"] }],
          });
        }).pipe(Effect.provide(makeHookManagerLayer(workspaceRoot, { hooks: ["identity-check"] })));

        const raw = readFileSync(settingsPath, "utf8");
        expect(raw).toContain("echo keep");
        expect(raw).toContain('"PreToolUse"');
        expect(raw).toContain('"matcher": "Write|Edit"');
        expect(raw).toContain("agent_extensions/_local/project/source-hook/src/hook.sh");
        expect(raw).not.toContain('"name": "identity-check"');
        expect(existsSync(`${settingsPath}.bak`)).toBe(false);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("uses python3 for Python native commands", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(realpathSync(tmpdir()), "axm-python-hook-"));
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "audit", { runtime: "python" });
        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          yield* manager.materializeInstall({ ref: makeLocalHookRef("audit", packageRoot) });
          yield* applyPlannedProjections(manager);
        }).pipe(Effect.provide(makeHookManagerLayer(workspaceRoot, { hooks: ["audit"] })));
        expect(
          readFileSync(nodePath.join(workspaceRoot, ".claude/settings.json"), "utf8"),
        ).toContain("python3 ");
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("preserves explicit native tool matchers for Claude Code", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(realpathSync(tmpdir()), "axm-hook-manager-"));
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "shell-check", {
          bindings: [{ event: "PreToolUse", matcher: "Bash" }],
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
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-hook-manager-devin-"),
      );
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

  it.effect("blocks unsupported hosts without generating instruction content", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(realpathSync(tmpdir()), "axm-hook-manager-"));
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "native-only");

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

        expect(describeTestFailure(error)).toContain("No native Hook writer");
        expect(existsSync(nodePath.join(workspaceRoot, "AGENTS.md"))).toBe(false);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect(
    "fails before writing settings when a block decision is required on observe-only event",
    () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-hook-manager-"),
        );
        try {
          const settingsPath = nodePath.join(workspaceRoot, ".claude", "settings.json");
          const packageRoot = nodePath.join(workspaceRoot, "source-hook");
          writeHookPackage(packageRoot, "decision-check", {
            bindings: [{ event: "SessionStart", requires: { outcomes: ["deny"] } }],
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

          expect(describeTestFailure(error)).toContain("cannot preserve required semantics");
          expect(existsSync(settingsPath)).toBe(false);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
  );

  describe("eager projection observation", () => {
    /** Register `audit`, then count the settings reads and native parses of `observe`. */
    const countObservation = <A, E>(
      observe: (
        manager: ServiceMap.Service.Shape<typeof HookManager>,
      ) => Effect.Effect<A, E, ManagerRequirements>,
    ) =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-hook-observation-"),
        );
        try {
          const packageRoot = nodePath.join(workspaceRoot, "source-hook");
          writeHookPackage(packageRoot, "audit");
          const { fileSystem, recording } = makeRecordingFileSystem(
            yield* Effect.gen(function* () {
              return yield* FileSystem.FileSystem;
            }).pipe(Effect.provide(NodeFileSystem.layer)),
          );
          // The recording filesystem replaces the platform one; the rest of the platform stays.
          const platform = Layer.provideMerge(
            Layer.succeed(FileSystem.FileSystem, fileSystem),
            NativePlatformTest,
          );
          return yield* Effect.gen(function* () {
            const manager = yield* HookManager;
            yield* manager.materializeInstall({ ref: makeLocalHookRef("audit", packageRoot) });
            yield* manager.projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));
            recording.reset();
            const work = workObservations(false);
            const observed = yield* observe(manager).pipe(work.provide);
            return {
              observed,
              settingsReads: recording.contentReads(
                nodePath.join(workspaceRoot, ".claude/settings.json"),
              ),
              nativeParses: work.facts.filter((fact) => fact.kind === "axm.parse.native").length,
            };
          }).pipe(
            Effect.provide(makeHookManagerLayer(workspaceRoot, { hooks: ["audit"], platform })),
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      });

    it.effect("observes again when a caller observes plain projection plans", () =>
      Effect.gen(function* () {
        const counted = yield* countObservation((manager) =>
          manager.projectionPlans().pipe(Effect.flatMap(observeProjectionPlans)),
        );
        expect(counted.observed).toMatchObject([
          { unitId: "hook:agent-hook-entries", current: true },
        ]);
        // The manager's eager refusal and the caller's observation each run once.
        expect({
          settingsReads: counted.settingsReads,
          nativeParses: counted.nativeParses,
        }).toEqual({ settingsReads: 2, nativeParses: 4 });
      }),
    );

    it.effect("hands the eager observation to the consumer of observed projection plans", () =>
      Effect.gen(function* () {
        const counted = yield* countObservation((manager) =>
          manager.observedProjectionPlans(undefined, observeObservedPlans),
        );
        expect(counted.observed).toMatchObject([
          { unitId: "hook:agent-hook-entries", current: true },
        ]);
        // Only the manager's eager refusal observes; the consumer receives its result.
        expect({
          settingsReads: counted.settingsReads,
          nativeParses: counted.nativeParses,
        }).toEqual({ settingsReads: 1, nativeParses: 2 });
      }),
    );
  });

  describe("prepared projection evidence", () => {
    const canonicalRootOf = (workspaceRoot: string, sourceRoot: string) =>
      nodePath.join(
        workspaceRoot,
        "agent_extensions/_local/project",
        nodePath.basename(sourceRoot),
      );
    const receiptPathOf = (workspaceRoot: string, canonicalRoot: string) =>
      nodePath.join(workspaceRoot, ".axm/hook-tests", hookReceiptFilename(canonicalRoot));
    const writeReceipt = (
      workspaceRoot: string,
      sourceRoot: string,
      receipt: "corrupt" | { readonly configuration: Readonly<Record<string, unknown>> },
    ) =>
      Effect.gen(function* () {
        const canonicalRoot = canonicalRootOf(workspaceRoot, sourceRoot);
        const receiptPath = receiptPathOf(workspaceRoot, canonicalRoot);
        mkdirSync(nodePath.dirname(receiptPath), { recursive: true });
        if (receipt === "corrupt") {
          writeFileSync(receiptPath, "{ not a receipt");
          return receiptPath;
        }
        const contentHash = yield* computePackageContentHash(sourceRoot).pipe(
          Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
        );
        writeFileSync(
          receiptPath,
          JSON.stringify({
            kind: "fixture-execution",
            package: nodePath.basename(sourceRoot),
            version: "1.0.0",
            contentHash,
            configurationHash: hookConfigurationHash(receipt.configuration),
            startedAt: 0,
            completedAt: 0,
            cwd: "package-root",
            scope: "project",
            platform: { os: hostPlatform(), architecture: arch() },
            environment: [],
            environmentFreshness: "historical-only",
            nativeInvocation: "not-observed",
            sandboxed: false,
            fixtures: [],
            passed: true,
            receiptPath,
          }),
        );
        return receiptPath;
      });

    /** Run `use` against a manager whose filesystem records every call after setup. */
    const withRecordedManager = <A, E>(
      workspaceRoot: string,
      use: (
        manager: ServiceMap.Service.Shape<typeof HookManager>,
        recording: FileSystemRecording,
      ) => Effect.Effect<A, E, ManagerRequirements>,
    ) =>
      Effect.gen(function* () {
        const { fileSystem, recording } = makeRecordingFileSystem(
          yield* Effect.gen(function* () {
            return yield* FileSystem.FileSystem;
          }).pipe(Effect.provide(NodeFileSystem.layer)),
        );
        const platform = Layer.provideMerge(
          Layer.succeed(FileSystem.FileSystem, fileSystem),
          NativePlatformTest,
        );
        return yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          return yield* use(manager, recording);
        }).pipe(Effect.provide(makeHookManagerLayer(workspaceRoot, { platform })));
      });

    const receiptAccesses = (recording: FileSystemRecording, receiptPath: string) =>
      recording.calls({ path: receiptPath }).length;

    /** Prepare one hook ref whose receipt is corrupt, counting the preparation's calls. */
    const countPreparation = Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-hook-prepared-once-"),
      );
      try {
        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "audit");
        const receiptPath = yield* writeReceipt(workspaceRoot, packageRoot, "corrupt");
        const canonicalRoot = canonicalRootOf(workspaceRoot, packageRoot);
        const entrypoint = nodePath.join(packageRoot, "src/hook.sh");
        return yield* withRecordedManager(workspaceRoot, (manager, recording) =>
          Effect.gen(function* () {
            recording.reset();
            const prepared = yield* manager.prepareProjection([
              makeLocalHookRef("audit", packageRoot),
            ]);
            return {
              prepared,
              entrypointReads: recording.contentReads(entrypoint),
              entrypointInspections: recording.counts(entrypoint).lstat,
              receiptReads: recording.contentReads(receiptPath),
              receiptAccesses: receiptAccesses(recording, receiptPath),
              canonicalRootExistenceChecks: recording.calls({
                path: canonicalRoot,
                method: "access",
              }).length,
            };
          }),
        );
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    });

    it.effect("hashes a prepared package from one walk and one read of each file", () =>
      Effect.gen(function* () {
        const counted = yield* countPreparation;
        expect(counted.prepared.acquisitions).toMatchObject([{ name: "audit" }]);
        expect({
          entrypointReads: counted.entrypointReads,
          entrypointInspections: counted.entrypointInspections,
        }).toEqual({ entrypointReads: 1, entrypointInspections: 1 });
      }),
    );
  });
});
