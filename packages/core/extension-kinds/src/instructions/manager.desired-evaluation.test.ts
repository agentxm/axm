/**
 * A Rules region plan built over the production workspace composition, where
 * the manager and its caller read desired state through one reader. The
 * cases count the physical reads one plan build makes of the documents a
 * desired-state evaluation reads: the inherited user settings, which only an
 * evaluation reads, and the lockfile.
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
import { RuleManager, type ManagerRequirements } from "@agentxm/workspace-kernel/materialization";
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
import { RuleManagerLive } from "./manager.js";

type RuleManagerShape = ServiceMap.Service.Shape<typeof RuleManager>;

const writeFile = (file: string, content: string) => {
  nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
  nodeFs.writeFileSync(file, content);
};

interface Workspace {
  readonly manager: RuleManagerShape;
  readonly recording: FileSystemRecording;
  /** Physical content reads of the inherited user settings and the lockfile. */
  readonly evaluations: () => { readonly inherited: number; readonly lock: number };
}

/**
 * A project workspace declaring the authored Rule `guide`, served by the
 * production workspace-state composition over a recording filesystem. The
 * Rules region is projected before `run`, and the recording starts empty.
 */
const inWorkspace = <A, E>(
  run: (workspace: Workspace) => Effect.Effect<A, E, ManagerRequirements | DesiredStateReader>,
) =>
  Effect.gen(function* () {
    const root = nodeFs.realpathSync(
      nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-rule-desired-evaluation-")),
    );
    try {
      const home = nodePath.join(root, "home");
      const inheritedPath = nodePath.join(home, ".axm", "workspace", "axm.json");
      const lockPath = nodePath.join(root, "axm.lock");
      writeFile(inheritedPath, "{}");
      writeFile(lockPath, "version = 1\n");
      writeFile(
        nodePath.join(root, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          instructionFiles: {},
          rules: { guide: "workspace" },
        }),
      );
      writeFile(
        nodePath.join(root, "rules", "guide", "rule.json"),
        JSON.stringify({ type: "rule", owner: "@acme", name: "guide", version: "1.0.0" }),
      );
      writeFile(nodePath.join(root, "rules", "guide", "src", "RULE.md"), "Guidance for guide.");
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
      const layer = RuleManagerLive.pipe(
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
        const manager = yield* RuleManager;
        yield* manager.projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));
        recording.reset();
        return yield* run({
          manager,
          recording,
          evaluations: () => ({
            inherited: recording.contentReads(inheritedPath),
            lock: recording.contentReads(lockPath),
          }),
        });
      }).pipe(Effect.provide(layer));
    } finally {
      nodeFs.rmSync(root, { recursive: true, force: true });
    }
  });

describe("RuleManager desired-state evaluation in one live plan build", () => {
  it.effect("derives its output authority from the evaluation its graph came from", () =>
    inWorkspace((workspace) =>
      Effect.gen(function* () {
        const plans = yield* workspace.manager.projectionPlans();
        expect(plans.map(({ unitId }) => unitId)).toEqual(["rule:instructions-region"]);
        // One evaluation, and the plan's own lockfile reads. Measured before
        // the authority shared the graph's evaluation: inherited 2, lock 4.
        expect(workspace.evaluations()).toEqual({ inherited: 1, lock: 3 });
      }),
    ),
  );

  it.effect("keeps capturing the authority when its caller supplies the graph", () =>
    inWorkspace((workspace) =>
      Effect.gen(function* () {
        const desiredGraph = yield* (yield* DesiredStateReader).graph();
        workspace.recording.reset();
        yield* workspace.manager.projectionPlans({ desiredGraph });
        // Only the authority evaluates, before and after.
        expect(workspace.evaluations()).toEqual({ inherited: 1, lock: 3 });
      }),
    ),
  );

  it.effect("reads desired state through an active read phase as before", () =>
    inWorkspace((workspace) =>
      Effect.gen(function* () {
        yield* withWorkspaceReadView(workspace.manager.projectionPlans());
        expect(workspace.evaluations()).toEqual({ inherited: 1, lock: 1 });
      }),
    ),
  );
});
