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
  SettingsReader,
  type Settings,
  type SettingsReaderService,
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
import { fileURLToPath as fromFileUrl, pathToFileURL } from "node:url";
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
import {
  HookManager,
  type ManagerRequirements,
  type PreparedHookWriterRoutes,
} from "@agentxm/workspace-kernel/materialization";
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
import type { ConfiguredAgentOutcome } from "@agentxm/workspace-kernel/operations";
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
    /** Shared runtime files the manifest declares, each written with placeholder content. */
    readonly assets?: ReadonlyArray<string>;
  },
) => {
  mkdirSync(nodePath.join(packageRoot, "src"), { recursive: true });
  for (const asset of options?.assets ?? []) {
    mkdirSync(nodePath.dirname(nodePath.join(packageRoot, asset)), { recursive: true });
    writeFileSync(nodePath.join(packageRoot, asset), `${asset}\n`);
  }
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
        ...(options?.assets === undefined ? {} : { assets: options.assets }),
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
    /** Counts the manager's own reads of the configured Hook entries. */
    readonly hookEntryReads?: { count: number };
  },
) => {
  const hookEntryReads = options?.hookEntryReads;
  // Only the manager reads through this wrapper; every other service reads the test settings directly.
  const managerSettings =
    hookEntryReads === undefined
      ? Layer.empty
      : Layer.effect(
          SettingsReader,
          Effect.gen(function* () {
            const reader = yield* SettingsReader;
            const entries: SettingsReaderService["entries"] = (type) =>
              Effect.suspend(() => {
                if (type === "hook") hookEntryReads.count += 1;
                return reader.entries(type);
              });
            return { ...reader, entries };
          }),
        );
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
    Layer.provide(managerSettings),
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

type HookManagerShape = ServiceMap.Service.Shape<typeof HookManager>;

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
  it.effect("contains every runtime file in the resolved root of a symlinked package", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(
        nodePath.join(realpathSync(tmpdir()), "axm-hook-linked-root-"),
      );
      try {
        const writeLinkedPackage = (name: string, entrypointTarget: string) => {
          const realRoot = nodePath.join(workspaceRoot, `real-${name}`);
          writeHookPackage(realRoot, name, { assets: ["assets/a.txt"] });
          const entrypoint = nodePath.join(realRoot, "src/hook.sh");
          rmSync(entrypoint);
          symlinkSync(entrypointTarget, entrypoint);
          const linkedRoot = nodePath.join(workspaceRoot, `linked-${name}`);
          symlinkSync(realRoot, linkedRoot);
          return makeLocalHookRef(name, linkedRoot);
        };
        writeFileSync(nodePath.join(workspaceRoot, "outside.sh"), "echo must-not-run\n");
        // The asset is checked first; the entrypoint after it links inside or outside the package.
        const inside = writeLinkedPackage("inside", "../assets/a.txt");
        const escaping = writeLinkedPackage("escaping", "../../outside.sh");
        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          const prepared = yield* manager.prepareProjection([inside]);
          expect(prepared.acquisitions).toMatchObject([{ name: "inside" }]);
          const failure = yield* manager.prepareProjection([escaping]).pipe(Effect.flip);
          expect(failure).toMatchObject({
            _tag: "HookDefinitionInvalid",
            detail: "Hook runtime resources must be readable files contained in the package",
            cause: { _tag: "PathTraversalDetected" },
          });
        }).pipe(Effect.provide(makeHookManagerLayer(workspaceRoot)));
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
      layerOptions?: Omit<NonNullable<Parameters<typeof makeHookManagerLayer>[1]>, "platform">,
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
        }).pipe(Effect.provide(makeHookManagerLayer(workspaceRoot, { ...layerOptions, platform })));
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

    it.effect("resolves a prepared package's root once while checking each runtime file", () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-hook-runtime-files-"),
        );
        try {
          const singleRoot = nodePath.join(workspaceRoot, "source-single");
          const assetsRoot = nodePath.join(workspaceRoot, "source-assets");
          writeHookPackage(singleRoot, "single");
          writeHookPackage(assetsRoot, "assets", { assets: ["assets/a.txt", "assets/b.txt"] });
          const runtimeFiles = ["assets/a.txt", "assets/b.txt", "src/hook.sh"].map((file) =>
            nodePath.join(assetsRoot, file),
          );
          const counted = yield* withRecordedManager(workspaceRoot, (manager, recording) =>
            Effect.gen(function* () {
              const rootResolutions = (packageRoot: string) =>
                recording.calls({ path: packageRoot, method: "realPath" }).length;
              recording.reset();
              const single = yield* manager.prepareProjection([
                makeLocalHookRef("single", singleRoot),
              ]);
              const singleCounts = rootResolutions(singleRoot);
              const runtimeFileChecks = () =>
                runtimeFiles.map((file) => ({
                  realPath: recording.calls({ path: file, method: "realPath" }).length,
                  stat: recording.calls({ path: file, method: "stat" }).length,
                }));
              recording.reset();
              const assets = yield* manager.prepareProjection([
                makeLocalHookRef("assets", assetsRoot),
              ]);
              const assetsCounts = {
                rootResolutions: rootResolutions(assetsRoot),
                runtimeFileChecks: runtimeFileChecks(),
              };
              // A later preparation of the same package resolves its root
              // again: the resolved root does not outlive one validation.
              recording.reset();
              const again = yield* manager.prepareProjection([
                makeLocalHookRef("assets", assetsRoot),
              ]);
              return {
                prepared: [
                  ...single.acquisitions,
                  ...assets.acquisitions,
                  ...again.acquisitions,
                ].map(({ name }) => name),
                single: singleCounts,
                assets: assetsCounts,
                again: {
                  rootResolutions: rootResolutions(assetsRoot),
                  runtimeFileChecks: runtimeFileChecks(),
                },
              };
            }),
          );
          // One resolution checks the runtime files and one the input's
          // overlap with the native target, however many files the package
          // declares. Measured before the root was resolved once per runtime
          // file: 2 and 4 (and 4 again).
          const eachFileOnce = [
            { realPath: 1, stat: 1 },
            { realPath: 1, stat: 1 },
            { realPath: 1, stat: 1 },
          ];
          expect(counted).toEqual({
            prepared: ["single", "assets", "assets"],
            single: 2,
            assets: { rootResolutions: 2, runtimeFileChecks: eachFileOnce },
            again: { rootResolutions: 2, runtimeFileChecks: eachFileOnce },
          });
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    );

    it.effect("reads a prepared package's fixture receipt once per preparation", () =>
      Effect.gen(function* () {
        const counted = yield* countPreparation;
        // A corrupt receipt is still reported, now from the one read.
        expect(counted.prepared.agentOutcomes).toMatchObject([
          {
            name: "audit",
            agentId: "claude-code",
            hook: { fixtureEvidence: { state: "invalid" } },
          },
        ]);
        expect({
          receiptReads: counted.receiptReads,
          receiptAccesses: counted.receiptAccesses,
          canonicalRootExistenceChecks: counted.canonicalRootExistenceChecks,
        }).toEqual({ receiptReads: 1, receiptAccesses: 2, canonicalRootExistenceChecks: 1 });
      }),
    );

    it.effect(
      "keeps each prepared contributor's fixture evidence under its own configuration",
      () =>
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(
            nodePath.join(realpathSync(tmpdir()), "axm-hook-prepared-statuses-"),
          );
          try {
            const configuration = { mode: { type: "string" } };
            const auditRoot = nodePath.join(workspaceRoot, "source-audit");
            const lintRoot = nodePath.join(workspaceRoot, "source-lint");
            writeHookPackage(auditRoot, "audit", { configuration });
            writeHookPackage(lintRoot, "lint", { configuration });
            // Both receipts record the audit configuration; only audit still uses it.
            yield* writeReceipt(workspaceRoot, auditRoot, { configuration: { mode: "strict" } });
            yield* writeReceipt(workspaceRoot, lintRoot, { configuration: { mode: "strict" } });
            const prepared = yield* withRecordedManager(workspaceRoot, (manager) =>
              manager.prepareProjection(
                [makeLocalHookRef("audit", auditRoot), makeLocalHookRef("lint", lintRoot)],
                {
                  hookConfigurations: new Map([
                    ["audit", { mode: "strict" }],
                    ["lint", { mode: "relaxed" }],
                  ]),
                },
              ),
            );
            expect(
              prepared.agentOutcomes.map(({ name, hook }) => ({
                name,
                state: hook?.fixtureEvidence.state,
              })),
            ).toEqual([
              { name: "audit", state: "historical" },
              { name: "lint", state: "stale" },
            ]);
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
    );

    it.effect("reads a prepared package's fixture receipt afresh in a later preparation", () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-hook-prepared-again-"),
        );
        try {
          const configuration = { mode: { type: "string" } };
          const packageRoot = nodePath.join(workspaceRoot, "source-audit");
          writeHookPackage(packageRoot, "audit", { configuration });
          const receiptPath = yield* writeReceipt(workspaceRoot, packageRoot, "corrupt");
          const counted = yield* withRecordedManager(workspaceRoot, (manager, recording) =>
            Effect.gen(function* () {
              const prepare = manager
                .prepareProjection([makeLocalHookRef("audit", packageRoot)], {
                  hookConfigurations: new Map([["audit", { mode: "strict" }]]),
                })
                .pipe(
                  Effect.map(({ agentOutcomes }) =>
                    agentOutcomes.map(({ name, hook }) => ({
                      name,
                      state: hook?.fixtureEvidence.state,
                    })),
                  ),
                );
              const first = yield* prepare;
              // The receipt changes between two preparations on the same manager.
              yield* writeReceipt(workspaceRoot, packageRoot, {
                configuration: { mode: "strict" },
              });
              recording.reset();
              const second = yield* prepare;
              return { first, second, receiptReads: recording.contentReads(receiptPath) };
            }),
          );
          expect(counted).toEqual({
            first: [{ name: "audit", state: "invalid" }],
            second: [{ name: "audit", state: "historical" }],
            receiptReads: 1,
          });
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    );

    it.effect("reads a retained contributor's receipt once when nothing is prepared", () =>
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(
          nodePath.join(realpathSync(tmpdir()), "axm-hook-retained-once-"),
        );
        try {
          const packageRoot = nodePath.join(workspaceRoot, "source-hook");
          writeHookPackage(packageRoot, "audit");
          const receiptPath = yield* writeReceipt(workspaceRoot, packageRoot, "corrupt");
          const counted = yield* Effect.gen(function* () {
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
              yield* manager.materializeInstall({ ref: makeLocalHookRef("audit", packageRoot) });
              recording.reset();
              yield* manager.projectionPlans();
              return {
                receiptReads: recording.contentReads(receiptPath),
                receiptAccesses: receiptAccesses(recording, receiptPath),
              };
            }).pipe(
              Effect.provide(makeHookManagerLayer(workspaceRoot, { hooks: ["audit"], platform })),
            );
          });
          expect(counted).toEqual({ receiptReads: 1, receiptAccesses: 2 });
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    );

    describe("within one preparation", () => {
      /** A workspace with the `audit` and `lint` packages and no native Hook settings yet. */
      const inWorkspace = <A, E, R>(
        use: (workspace: {
          readonly root: string;
          readonly settingsPath: string;
          readonly audit: LocalHookRef;
          readonly lint: LocalHookRef;
        }) => Effect.Effect<A, E, R>,
      ) =>
        Effect.gen(function* () {
          const root = mkdtempSync(nodePath.join(realpathSync(tmpdir()), "axm-hook-one-call-"));
          try {
            const auditRoot = nodePath.join(root, "source-audit");
            const lintRoot = nodePath.join(root, "source-lint");
            writeHookPackage(auditRoot, "audit");
            writeHookPackage(lintRoot, "lint");
            return yield* use({
              root,
              settingsPath: nodePath.join(root, ".claude/settings.json"),
              audit: makeLocalHookRef("audit", auditRoot),
              lint: makeLocalHookRef("lint", lintRoot),
            });
          } finally {
            rmSync(root, { recursive: true, force: true });
          }
        });
      /** The route probes of the native settings file that `effect` makes. */
      const settingsProbes = <A, E, R>(
        recording: FileSystemRecording,
        settingsPath: string,
        effect: Effect.Effect<A, E, R>,
      ) =>
        Effect.gen(function* () {
          recording.reset();
          const value = yield* effect;
          return {
            value,
            probes: recording.calls({ path: settingsPath, method: "readLink" }).length,
          };
        });

      it.effect("resolves the configured Hook writer routes once per preparation", () =>
        inWorkspace(({ root, settingsPath, audit, lint }) =>
          Effect.gen(function* () {
            const counted = yield* withRecordedManager(root, (manager, recording) =>
              Effect.gen(function* () {
                const probe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
                  settingsProbes(recording, settingsPath, effect).pipe(
                    Effect.map(({ probes }) => probes),
                  );
                return {
                  nothingPrepared: yield* probe(manager.projectionPlans()),
                  onePrepared: yield* probe(manager.prepareProjection([audit])),
                  twoPrepared: yield* probe(manager.prepareProjection([audit, lint])),
                };
              }),
            );
            // Resolving the routes probes the absent settings file twice; the
            // plan observation and each prepared input's overlap check probe
            // it too. Measured before the preparation shared its resolution:
            // 9, 15 and 19.
            // Each native settings run then admitted every spelling of the
            // file and re-resolved it per declaration: 9, 13 and 17.
            expect(counted).toEqual({ nothingPrepared: 5, onePrepared: 9, twoPrepared: 11 });
          }),
        ),
      );

      it.effect(
        "hands a preparation's writer routes to the same manager's outcome evaluation",
        () =>
          inWorkspace(({ root, settingsPath, audit }) =>
            Effect.gen(function* () {
              const counted = yield* withRecordedManager(root, (manager, recording) =>
                Effect.gen(function* () {
                  const writerRoutes = yield* manager.observedPrepareProjection(
                    [audit],
                    undefined,
                    ({ writerRoutes }) => Effect.succeed(writerRoutes),
                  );
                  const handed = yield* settingsProbes(
                    recording,
                    settingsPath,
                    manager.configuredAgentOutcomesForRef?.(
                      audit,
                      "projected",
                      writerRoutes === undefined ? {} : { writerRoutes },
                    ) ?? Effect.die("no outcome evaluation"),
                  );
                  const resolved = yield* settingsProbes(
                    recording,
                    settingsPath,
                    manager.configuredAgentOutcomesForRef?.(audit, "projected") ??
                      Effect.die("no outcome evaluation"),
                  );
                  return { handed, resolved };
                }),
              );
              expect(counted.handed.value).toEqual(counted.resolved.value);
              expect(counted.handed.value).toMatchObject([
                { name: "audit", agentId: "claude-code", path: ".claude/settings.json" },
              ]);
              // Measured before the preparation handed its routes on: 2 and 2.
              expect({ handed: counted.handed.probes, resolved: counted.resolved.probes }).toEqual({
                handed: 0,
                resolved: 2,
              });
            }),
          ),
      );

      it.effect(
        "resolves the routes afresh for writer routes of other agents or another manager",
        () =>
          inWorkspace(({ root, settingsPath, audit }) =>
            Effect.gen(function* () {
              const prepare = (
                manager: HookManagerShape,
                configuredAgents?: ReadonlyArray<string>,
              ) =>
                manager.observedPrepareProjection(
                  [audit],
                  configuredAgents === undefined ? undefined : { configuredAgents },
                  ({ writerRoutes }) => Effect.succeed(writerRoutes),
                );
              const evaluate = (
                manager: HookManagerShape,
                recording: FileSystemRecording,
                writerRoutes: PreparedHookWriterRoutes | undefined,
              ) =>
                settingsProbes(
                  recording,
                  settingsPath,
                  manager.configuredAgentOutcomesForRef?.(
                    audit,
                    "projected",
                    writerRoutes === undefined ? {} : { writerRoutes },
                  ) ?? Effect.die("no outcome evaluation"),
                );
              const anotherManagers = yield* withRecordedManager(root, (manager) =>
                prepare(manager),
              );
              const otherManager = yield* withRecordedManager(root, (manager, recording) =>
                evaluate(manager, recording, anotherManagers),
              );
              const otherAgents = yield* withRecordedManager(root, (manager, recording) =>
                prepare(manager, ["claude-code", "devin"]).pipe(
                  Effect.flatMap((writerRoutes) => evaluate(manager, recording, writerRoutes)),
                ),
              );
              expect(otherAgents.value).toEqual(otherManager.value);
              expect({
                otherManager: otherManager.probes,
                otherAgents: otherAgents.probes,
              }).toEqual({
                otherManager: 2,
                otherAgents: 2,
              });
            }),
          ),
      );

      it.effect(
        "evaluates a prepared Hook's outcomes from the manifest its preparation decoded",
        () =>
          inWorkspace(({ root, audit, lint }) =>
            Effect.gen(function* () {
              // The same Hook name, read from another directory.
              const movedRoot = nodePath.join(root, "source-audit-moved");
              writeHookPackage(movedRoot, "audit");
              const moved = makeLocalHookRef("audit", movedRoot);
              const manifestOf = (ref: LocalHookRef) =>
                nodePath.join(fromFileUrl(ref.location), "hook.json");
              const counted = yield* withRecordedManager(root, (manager, recording) =>
                Effect.gen(function* () {
                  const preparedManifests = yield* manager.observedPrepareProjection(
                    [audit, lint],
                    undefined,
                    ({ preparedManifests }) => Effect.succeed(preparedManifests),
                  );
                  const evaluate = (
                    ref: LocalHookRef,
                    handed: typeof preparedManifests | undefined,
                  ) =>
                    Effect.gen(function* () {
                      recording.reset();
                      const outcomes = yield* manager.configuredAgentOutcomesForRef?.(
                        ref,
                        "projected",
                        handed === undefined ? {} : { preparedManifests: handed },
                      ) ?? Effect.die("no outcome evaluation");
                      return { outcomes, reads: recording.contentReads(manifestOf(ref)) };
                    });
                  return {
                    handed: yield* evaluate(audit, preparedManifests),
                    unhanded: yield* evaluate(audit, undefined),
                    otherRoot: yield* evaluate(moved, preparedManifests),
                    otherName: yield* evaluate(
                      audit,
                      preparedManifests?.filter(({ name }) => name !== "audit"),
                    ),
                  };
                }),
              );
              expect(counted.handed.outcomes).toEqual(counted.unhanded.outcomes);
              expect(counted.handed.outcomes).toMatchObject([
                { name: "audit", agentId: "claude-code", outcome: "projected" },
              ]);
              // Measured before the preparation handed its decodes on: 1, 1, 1 and 1.
              expect({
                handed: counted.handed.reads,
                unhanded: counted.unhanded.reads,
                otherRoot: counted.otherRoot.reads,
                otherName: counted.otherName.reads,
              }).toEqual({ handed: 0, unhanded: 1, otherRoot: 1, otherName: 1 });
            }),
          ),
      );

      it.effect("observes a retargeted settings directory in a later preparation", () =>
        inWorkspace(({ root, audit }) =>
          Effect.gen(function* () {
            const paths = yield* withRecordedManager(root, (manager) =>
              Effect.gen(function* () {
                const path = manager
                  .prepareProjection([audit])
                  .pipe(Effect.map(({ agentOutcomes }) => agentOutcomes.map(({ path }) => path)));
                const first = yield* path;
                mkdirSync(nodePath.join(root, "routed"));
                symlinkSync("routed", nodePath.join(root, ".claude"));
                return { first, second: yield* path };
              }),
            );
            expect(paths).toEqual({
              first: [".claude/settings.json"],
              second: ["routed/settings.json"],
            });
          }),
        ),
      );

      it.effect("refuses an unwritable writer route before observing any plan", () =>
        inWorkspace(({ root, settingsPath, audit }) =>
          Effect.gen(function* () {
            const outside = mkdtempSync(nodePath.join(realpathSync(tmpdir()), "axm-hook-outside-"));
            try {
              symlinkSync(outside, nodePath.join(root, ".claude"));
              let used = false;
              const failure = yield* withRecordedManager(root, (manager) =>
                manager
                  .observedPrepareProjection([audit], undefined, () =>
                    Effect.sync(() => {
                      used = true;
                    }),
                  )
                  .pipe(Effect.flip),
              );
              expect(failure).toMatchObject({
                _tag: "HookDefinitionInvalid",
                detail: `Hook native location is not writable: ${settingsPath}`,
              });
              expect(used).toBe(false);
              expect(existsSync(nodePath.join(outside, "settings.json"))).toBe(false);
            } finally {
              rmSync(outside, { recursive: true, force: true });
            }
          }),
        ),
      );

      it.effect("evaluates each prepared contributor's outcomes once per preparation", () =>
        inWorkspace(({ root, audit }) =>
          Effect.gen(function* () {
            yield* writeReceipt(root, fromFileUrl(audit.location), "corrupt");
            const hookEntryReads = { count: 0 };
            const counted = yield* withRecordedManager(
              root,
              (manager) =>
                Effect.gen(function* () {
                  const reads = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
                    Effect.gen(function* () {
                      hookEntryReads.count = 0;
                      const value = yield* effect;
                      return { value, reads: hookEntryReads.count };
                    });
                  const nothingPrepared = yield* reads(manager.projectionPlans());
                  const prepared = yield* reads(manager.prepareProjection([audit]));
                  // A withdrawn prepared contributor is left out of the projected
                  // evaluation, so its outcomes are evaluated on their own.
                  const withdrawn = yield* manager.prepareProjection([audit], {
                    hookWithdrawals: [
                      {
                        name: "audit",
                        ref: "@acme/hooks/audit",
                        root: canonicalRootOf(root, fromFileUrl(audit.location)),
                        scope: "project",
                      },
                    ],
                  });
                  return {
                    nothingPrepared: nothingPrepared.reads,
                    prepared: prepared.reads,
                    outcomes: prepared.value.agentOutcomes,
                    withdrawnOutcomes: withdrawn.agentOutcomes,
                  };
                }),
              { hookEntryReads },
            );
            expect(counted.outcomes).toMatchObject([
              {
                name: "audit",
                agentId: "claude-code",
                hook: { fixtureEvidence: { state: "invalid" } },
              },
            ]);
            expect(counted.withdrawnOutcomes).toEqual(counted.outcomes);
            // The configuration, the projected evaluation and the rendering
            // each read the entries; measured before the outcomes were shared:
            // 1 and 4.
            expect({
              nothingPrepared: counted.nothingPrepared,
              prepared: counted.prepared,
            }).toEqual({ nothingPrepared: 1, prepared: 3 });
          }),
        ),
      );

      it.effect(
        "keeps each prepared contributor's own outcomes beside an installed Hook ordered before them",
        () =>
          inWorkspace(({ root }) =>
            Effect.gen(function* () {
              const configuration = { mode: { type: "string" } };
              const auditRoot = nodePath.join(root, "configured-audit");
              const lintRoot = nodePath.join(root, "configured-lint");
              const installedRoot = nodePath.join(root, "source-hook");
              writeHookPackage(auditRoot, "audit", { configuration });
              writeHookPackage(lintRoot, "lint", { configuration });
              // An installed Hook whose marker orders before both prepared ones.
              writeHookPackage(installedRoot, "aaa");
              yield* writeReceipt(root, auditRoot, { configuration: { mode: "strict" } });
              yield* writeReceipt(root, lintRoot, { configuration: { mode: "strict" } });
              const lint = makeLocalHookRef("lint", lintRoot);
              const audit = makeLocalHookRef("audit", auditRoot);
              const hookConfigurations = new Map([
                ["audit", { mode: "strict" }],
                ["lint", { mode: "relaxed" }],
              ]);
              const states = (outcomes: ReadonlyArray<ConfiguredAgentOutcome>) =>
                outcomes.map(({ name, hook }) => ({ name, state: hook?.fixtureEvidence.state }));
              const prepared = yield* withRecordedManager(
                root,
                (manager) =>
                  Effect.gen(function* () {
                    yield* manager.materializeInstall({
                      ref: makeLocalHookRef("aaa", installedRoot),
                    });
                    const both = yield* manager.prepareProjection([lint, audit], {
                      hookConfigurations,
                    });
                    // Lint alone is left out of the projected evaluation.
                    const lintWithdrawn = yield* manager.prepareProjection([lint, audit], {
                      hookConfigurations,
                      hookWithdrawals: [
                        {
                          name: "lint",
                          ref: "@acme/hooks/lint",
                          root: canonicalRootOf(root, lintRoot),
                          scope: "project",
                        },
                      ],
                    });
                    return {
                      both: states(both.agentOutcomes),
                      lintWithdrawn: states(lintWithdrawn.agentOutcomes),
                      acquisitions: both.acquisitions.map(({ name }) => name),
                    };
                  }),
                { hooks: ["aaa"] },
              );
              const own = [
                { name: "audit", state: "historical" },
                { name: "lint", state: "stale" },
              ];
              expect(prepared).toEqual({
                both: own,
                lintWithdrawn: own,
                acquisitions: ["lint", "audit"],
              });
            }),
          ),
      );
    });
  });
});
