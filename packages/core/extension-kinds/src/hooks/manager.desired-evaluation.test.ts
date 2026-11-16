/**
 * Hook projection runs over the production workspace composition, where the
 * manager and its caller read desired state through one reader. Each case
 * counts the physical reads one run makes of the documents a desired-state
 * evaluation reads: the selected settings, the inherited user settings, and
 * the lockfile. Only an evaluation reads the inherited user settings.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
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
import { applyProjectionPlans } from "@agentxm/workspace-kernel/projection";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import { WorkspaceCatalogLive } from "@agentxm/workspace-kernel/sources/live";
import {
  DesiredStateReader,
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
      const layer = HookManagerLive.pipe(
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
});
