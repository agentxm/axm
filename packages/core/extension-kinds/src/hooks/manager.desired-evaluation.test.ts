/**
 * Hook projection runs over the production workspace composition, where the
 * manager and its caller read desired state through one reader. Each case
 * counts the physical reads one run makes of the documents a desired-state
 * evaluation reads: the selected settings, the inherited user settings, and
 * the lockfile. Only an evaluation reads the inherited user settings.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import { arch, platform as hostPlatform } from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as ServiceMap from "effect/Context";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import {
  OfflineHttpClient,
  RegistryClientFactoryTest,
  RegistryTransportTest,
} from "@agentxm/registry-client/testing";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { HookManager, type ManagerRequirements } from "@agentxm/workspace-kernel/materialization";
import { applyProjectionPlans, observeObservedPlans } from "@agentxm/workspace-kernel/projection";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import { WorkspaceCatalogLive } from "@agentxm/workspace-kernel/sources/live";
import {
  DesiredStateReader,
  computePackageContentHash,
  hookConfigurationHash,
  hookReceiptFilename,
  usableAcceptedCanonicalRef,
  SettingsIoError,
  SettingsReader,
  type SettingsReaderService,
  withWorkspaceReadView,
} from "@agentxm/workspace-kernel/workspace-state";
import { WorkspaceStateLive } from "@agentxm/workspace-kernel/workspace-state/live";
import { MockWorkspaceTransactionScope } from "@agentxm/workspace-kernel/workspace-state/testing";
import { HookManagerLive } from "./manager.js";

type HookManagerShape = ServiceMap.Service.Shape<typeof HookManager>;

const writeFile = (file: string, content: string) => {
  nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
  nodeFs.writeFileSync(file, content);
};

/** An authored Hook package `name` under the project's authored Hook root. */
const writeAuthoredHook = (root: string, name: string) => {
  const packageRoot = nodePath.join(root, "hooks", name);
  writeFile(
    nodePath.join(packageRoot, "hook.json"),
    JSON.stringify({
      owner: "@acme",
      type: "hook",
      name,
      version: "1.0.0",
      implementations: [
        {
          id: "claude-code",
          protocol: "claude-code",
          bindings: [
            {
              id: "binding-0",
              event: "PreToolUse",
              matcher: "Write|Edit",
              handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
            },
          ],
        },
      ],
    }),
  );
  writeFile(nodePath.join(packageRoot, "src", "hook.sh"), "#!/usr/bin/env bash\n");
  return packageRoot;
};

interface Workspace {
  readonly root: string;
  readonly manager: HookManagerShape;
  readonly recording: FileSystemRecording;
  /** Physical content reads of the documents a desired-state evaluation reads. */
  readonly reads: () => {
    readonly settings: number;
    readonly inherited: number;
    readonly lock: number;
  };
}

/**
 * A project workspace declaring the authored Hooks `names` for Claude Code,
 * served by the production workspace-state composition over a recording
 * filesystem. The Hooks are projected before `run`, and the recording starts
 * empty.
 */
const inWorkspace = <A, E>(
  names: ReadonlyArray<string>,
  run: (workspace: Workspace) => Effect.Effect<A, E, ManagerRequirements | DesiredStateReader>,
  /** Counts, and on request fails, the manager's own reads of the configured Hook entries. */
  hookEntries?: HookEntryReads,
) =>
  Effect.gen(function* () {
    const root = nodeFs.realpathSync(
      nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-hook-desired-evaluation-")),
    );
    try {
      const home = nodePath.join(root, "home");
      const inheritedPath = nodePath.join(home, ".axm", "workspace", "axm.json");
      const settingsPath = nodePath.join(root, "axm.json");
      const lockPath = nodePath.join(root, "axm.lock");
      writeFile(inheritedPath, "{}");
      writeFile(lockPath, "version = 1\n");
      writeFile(
        settingsPath,
        JSON.stringify({
          owner: "@acme",
          agents: ["claude-code"],
          hooks: Object.fromEntries(names.map((name) => [name, "workspace"])),
        }),
      );
      for (const name of names) writeAuthoredHook(root, name);
      const { fileSystem, recording } = makeRecordingFileSystem(
        yield* Effect.gen(function* () {
          return yield* FileSystem.FileSystem;
        }).pipe(Effect.provide(NodeFileSystem.layer)),
      );
      const platform = Layer.provideMerge(
        Layer.succeed(FileSystem.FileSystem, fileSystem),
        NativePlatformTest,
      );
      const state = WorkspaceStateLive({
        projectRoot: decodeAbsolutePathSync(root),
        scope: "project",
      }).pipe(
        Layer.provide(RegistryClientFactoryTest(OfflineHttpClient)),
        Layer.provide(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
        ),
      );
      // Only the manager reads through this wrapper.
      const managerSettings =
        hookEntries === undefined
          ? Layer.empty
          : Layer.effect(
              SettingsReader,
              Effect.gen(function* () {
                const reader = yield* SettingsReader;
                const entries: SettingsReaderService["entries"] = (type) =>
                  Effect.suspend(() => {
                    if (type !== "hook") return reader.entries(type);
                    hookEntries.count += 1;
                    return hookEntries.fail
                      ? Effect.fail(
                          new SettingsIoError({ path: settingsPath, cause: "unreadable" }),
                        )
                      : reader.entries(type);
                  });
                return { ...reader, entries };
              }),
            );
      const layer = HookManagerLive.pipe(
        Layer.provide(managerSettings),
        Layer.provideMerge(WorkspaceCatalogLive),
        Layer.provideMerge(CodingAgentRepositoryLive),
        Layer.provideMerge(NativeWriteAuthorityLive),
        Layer.provideMerge(state),
        Layer.provideMerge(MockWorkspaceTransactionScope(nodePath.join(root, ".axm"))),
        Layer.provide(
          Layer.succeed(SourceHostProviders, {
            resolveNamedRegistry: () => Effect.die("not used"),
            find: () => Effect.die("not used"),
            fetch: () => Effect.die("not used"),
            acquireForTransition: () => Effect.die("not used"),
            cloneUrl: () => Option.none(),
            origin: () => "registry",
          }),
        ),
        Layer.provideMerge(WorkspaceFileWriteLocksLive),
        Layer.provideMerge(
          Layer.provideMerge(RegistryTransportTest(FetchHttpClient.layer), platform),
        ),
      );
      return yield* Effect.gen(function* () {
        const manager = yield* HookManager;
        yield* manager.projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));
        recording.reset();
        return yield* run({
          root,
          manager,
          recording,
          reads: () => ({
            settings: recording.contentReads(settingsPath),
            inherited: recording.contentReads(inheritedPath),
            lock: recording.contentReads(lockPath),
          }),
        });
      }).pipe(Effect.provide(layer));
    } finally {
      nodeFs.rmSync(root, { recursive: true, force: true });
    }
  });

interface HookEntryReads {
  count: number;
  fail: boolean;
}

const evaluations = (workspace: Workspace) => {
  const { inherited, lock } = workspace.reads();
  return { inherited, lock };
};

describe("HookManager desired-state evaluation", () => {
  describe("one live projection plan build", () => {
    it.effect("derives its output authority from the evaluation its graph came from", () =>
      inWorkspace(["audit"], (workspace) =>
        Effect.gen(function* () {
          const plans = yield* workspace.manager.projectionPlans();
          expect(plans.map(({ unitId }) => unitId)).toEqual(["hook:agent-hook-entries"]);
          // One evaluation, and the lockfile read for the plan's Hook rows.
          // Measured before the authority shared the graph's evaluation:
          // inherited 2, lock 3.
          expect(evaluations(workspace)).toEqual({ inherited: 1, lock: 2 });
        }),
      ),
    );

    it.effect("keeps capturing the authority when its caller supplies the graph", () =>
      inWorkspace(["audit"], (workspace) =>
        Effect.gen(function* () {
          const desiredGraph = yield* (yield* DesiredStateReader).graph();
          workspace.recording.reset();
          yield* workspace.manager.projectionPlans({ desiredGraph });
          // The supplied graph stands for the plan's evaluation; only the
          // authority evaluates, before and after.
          expect(evaluations(workspace)).toEqual({ inherited: 1, lock: 2 });
        }),
      ),
    );

    it.effect("reads desired state through an active read phase as before", () =>
      inWorkspace(["audit"], (workspace) =>
        Effect.gen(function* () {
          yield* withWorkspaceReadView(workspace.manager.projectionPlans());
          expect(evaluations(workspace)).toEqual({ inherited: 1, lock: 1 });
        }),
      ),
    );
  });

  describe("withdrawing a Hook's native registrations", () => {
    const target = { type: "hook", name: "audit" } as const;

    it.effect("evaluates the desired state once while deactivating", () =>
      inWorkspace(["audit"], (workspace) =>
        Effect.gen(function* () {
          yield* workspace.manager.materializeDeactivate({ target });
          // Measured before the withdrawal handed its evaluation to its own
          // projection run: inherited 3, lock 4.
          expect(evaluations(workspace)).toEqual({ inherited: 1, lock: 2 });
        }),
      ),
    );

    it.effect("evaluates the desired state once while withdrawing before uninstall", () =>
      inWorkspace(["audit"], (workspace) =>
        Effect.gen(function* () {
          yield* workspace.manager.materializeUninstall({ target, nativeCleanup: "selected" });
          // The removal's own observation of the package evaluates once more.
          // Measured before: inherited 4, lock 6.
          expect(evaluations(workspace)).toEqual({ inherited: 2, lock: 4 });
        }),
      ),
    );

    it.effect("evaluates nothing more when the uninstall retains native registrations", () =>
      inWorkspace(["audit"], (workspace) =>
        Effect.gen(function* () {
          yield* workspace.manager.materializeUninstall({ target, nativeCleanup: "retain" });
          expect(evaluations(workspace)).toEqual({ inherited: 1, lock: 2 });
        }),
      ),
    );
  });

  describe("the configured Hook entries in one projection run", () => {
    /** Run `measure` with the entry read count reset after setup. */
    const entryReads = <A, E>(
      names: ReadonlyArray<string>,
      measure: (
        workspace: Workspace,
        counted: <B, F, R>(effect: Effect.Effect<B, F, R>) => Effect.Effect<number, F, R>,
      ) => Effect.Effect<A, E, ManagerRequirements | DesiredStateReader>,
    ) => {
      const hookEntries: HookEntryReads = { count: 0, fail: false };
      return inWorkspace(
        names,
        (workspace) =>
          measure(workspace, (effect) =>
            Effect.gen(function* () {
              hookEntries.count = 0;
              yield* effect;
              return hookEntries.count;
            }),
          ),
        hookEntries,
      );
    };

    it.effect("reads them once for the selection and evaluation, and once per observation", () =>
      entryReads(["audit", "lint"], (workspace, counted) =>
        Effect.gen(function* () {
          const observed = yield* counted(
            workspace.manager.observedProjectionPlans(undefined, observeObservedPlans),
          );
          const plans = yield* workspace.manager.projectionPlans();
          // A plan applied after its producing call returned reads them live.
          const applied = yield* counted(applyProjectionPlans(plans));
          const planned = yield* counted(
            workspace.manager.projectionPlans().pipe(Effect.flatMap(applyProjectionPlans)),
          );
          const outcomes = yield* counted(
            workspace.manager.configuredAgentOutcomes?.("current") ??
              Effect.die("The Hook manager evaluates configured-agent outcomes"),
          );
          // Measured before the reads were shared: 5, 2, 7 and 3 (one per
          // contributor in selection and rendering, one for the evaluation).
          expect({ observed, applied, planned, outcomes }).toEqual({
            observed: 2,
            applied: 1,
            planned: 3,
            outcomes: 1,
          });
          expect(
            JSON.parse(
              nodeFs.readFileSync(nodePath.join(workspace.root, ".claude/settings.json"), "utf8"),
            ).hooks.PreToolUse,
          ).toHaveLength(2);
        }),
      ),
    );

    it.effect("reads them only for the evaluation when no Hook contributes", () =>
      entryReads([], (workspace, counted) =>
        Effect.gen(function* () {
          const planned = yield* counted(
            workspace.manager.projectionPlans().pipe(Effect.flatMap(applyProjectionPlans)),
          );
          expect(planned).toBe(1);
        }),
      ),
    );

    it.effect("fails each consumer that needs them with the read's failure", () => {
      const hookEntries: HookEntryReads = { count: 0, fail: false };
      return inWorkspace(
        ["audit"],
        (workspace) =>
          Effect.gen(function* () {
            const plans = yield* workspace.manager.projectionPlans();
            hookEntries.fail = true;
            const selection = yield* Effect.flip(workspace.manager.projectionPlans());
            const apply = yield* Effect.flip(applyProjectionPlans(plans));
            expect([selection, apply]).toMatchObject([
              { _tag: "SettingsIoError" },
              { _tag: "SettingsIoError" },
            ]);
          }),
        hookEntries,
      );
    });

    it.effect("maps the evaluation's failure when no Hook contributes", () => {
      const hookEntries: HookEntryReads = { count: 0, fail: false };
      return inWorkspace(
        [],
        (workspace) =>
          Effect.gen(function* () {
            hookEntries.fail = true;
            const failure = yield* Effect.flip(workspace.manager.projectionPlans());
            expect(failure).toMatchObject({
              _tag: "HookDefinitionInvalid",
              detail: "Hook inspection could not read canonical evidence",
              cause: { _tag: "SettingsIoError" },
            });
          }),
        hookEntries,
      );
    });
  });

  describe("a contributor's package root in one projection run", () => {
    /** The root's real-path resolutions and existence probes during `effect`. */
    const rootChecks = <A, E, R>(
      workspace: Workspace,
      packageRoot: string,
      effect: Effect.Effect<A, E, R>,
    ) =>
      Effect.gen(function* () {
        workspace.recording.reset();
        yield* effect;
        const counts = workspace.recording.counts(packageRoot);
        return { realPath: counts.realPath ?? 0, exists: counts.access ?? 0 };
      });

    it.effect("keys a retained contributor's receipt from the root its validation resolved", () =>
      inWorkspace(["audit"], (workspace) =>
        Effect.gen(function* () {
          const packageRoot = nodePath.join(workspace.root, "hooks", "audit");
          const planned = yield* rootChecks(
            workspace,
            packageRoot,
            workspace.manager.projectionPlans(),
          );
          const outcomes = yield* rootChecks(
            workspace,
            packageRoot,
            workspace.manager.configuredAgentOutcomes?.("current") ??
              Effect.die("The Hook manager evaluates configured-agent outcomes"),
          );
          // The observation probes the root and the runtime-file validation
          // resolves it; the plan's native observation resolves it once more.
          // Measured before the evaluation took the validated root: planned
          // realPath 3 and exists 2, outcomes realPath 2 and exists 2.
          expect({ planned, outcomes }).toEqual({
            planned: { realPath: 2, exists: 1 },
            outcomes: { realPath: 1, exists: 1 },
          });
        }),
      ),
    );

    it.effect("keys a prepared contributor's receipt from the canonical root it validated", () =>
      inWorkspace(["audit"], (workspace) =>
        Effect.gen(function* () {
          const packageRoot = nodePath.join(workspace.root, "hooks", "audit");
          const ref = yield* usableAcceptedCanonicalRef({ type: "hook", name: "audit" });
          if (Option.isNone(ref) || ref.value.type !== "hook")
            return yield* Effect.die("The authored Hook restores a Hook ref");
          const hookRef = ref.value;
          const prepared = yield* rootChecks(
            workspace,
            packageRoot,
            workspace.manager.prepareProjection([hookRef]),
          );
          // An authored package is read from its canonical root. Measured
          // before the evaluation took the validated root: realPath 4 and
          // exists 1.
          expect(prepared).toEqual({ realPath: 3, exists: 0 });
        }),
      ),
    );

    it.effect("keys a symlinked package root's receipt from its real path", () =>
      inWorkspace(["audit"], (workspace) =>
        Effect.gen(function* () {
          const linkedRoot = nodePath.join(workspace.root, "hooks", "audit");
          const realRoot = nodePath.join(workspace.root, "authored-audit");
          nodeFs.renameSync(linkedRoot, realRoot);
          nodeFs.symlinkSync(realRoot, linkedRoot);
          const receiptPath = nodePath.join(
            workspace.root,
            ".axm",
            "hook-tests",
            hookReceiptFilename(realRoot),
          );
          writeFile(
            receiptPath,
            JSON.stringify({
              kind: "fixture-execution",
              package: "audit",
              version: "1.0.0",
              contentHash: yield* computePackageContentHash(realRoot),
              configurationHash: hookConfigurationHash({}),
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
          const outcomes = yield* workspace.manager.configuredAgentOutcomes?.("current") ??
            Effect.die("The Hook manager evaluates configured-agent outcomes");
          expect(
            outcomes.map(({ name, hook }) => ({ name, state: hook?.fixtureEvidence.state })),
          ).toEqual([{ name: "audit", state: "historical" }]);
        }),
      ),
    );
  });
});
