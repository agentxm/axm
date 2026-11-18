/**
 * The authoring environment over a recording filesystem, for tests that count
 * the filesystem work one authoring phase performs.
 *
 * The composition matches `authoringWorkspaceEnvironment`; only the
 * filesystem every service captures is the recording one, so manager reads
 * are counted together with the use case's own.
 *
 * @internal Test-only. Not part of the package's public API.
 */

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { layerRecordingFileSystem } from "@agentxm/test-support";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { AgentPresenceProbeLive } from "@agentxm/workspace-kernel/agent-adapters/live";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { PlanSources, makePlanSources } from "@agentxm/workspace-kernel/planning";
import {
  PlanInvocationTest,
  ResolvePlanInteractionTest,
} from "@agentxm/workspace-kernel/planning/testing";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import {
  AxmSkillCandidateGateLive,
  RegistryResolutionPolicyLive,
} from "@agentxm/workspace-kernel/resolution/live";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import { ArtifactHttpClient } from "@agentxm/workspace-kernel/sources";
import {
  SourceHostProvidersLive,
  WorkspaceCatalogLive,
} from "@agentxm/workspace-kernel/sources/live";
import { layer as workspaceStateLayer } from "@agentxm/workspace-kernel/workspace-state/live";
import { CredentialStoreTest } from "@agentxm/registry-access/testing";
import { RegistryClientFactoryTest, RegistryContextTest } from "@agentxm/registry-client/testing";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";

import { withKindManagers } from "../../testing/workspace-world.js";
import type { AuthoringWorkspace } from "./authoring-workspace.js";

/** Every authoring service over a recording filesystem, with its `FileSystemRecorder`. */
export const recordingAuthoringWorkspaceLayer = (workspace: AuthoringWorkspace) => {
  const identity = Layer.mergeAll(
    CredentialStoreTest(),
    RegistryContextTest("https://registry.example.com"),
  );
  // The recording filesystem is merged last, so it replaces the native one
  // every later layer captures.
  const platform = Layer.provideMerge(
    WorkspaceFileWriteLocksLive,
    Layer.mergeAll(
      NativePlatformTest,
      FetchHttpClient.layer,
      layerRecordingFileSystem(NodeFileSystem.layer),
    ),
  );
  const presence = Layer.provideMerge(
    AgentPresenceProbeLive,
    Layer.provideMerge(RegistryClientFactoryTest(FetchHttpClient.layer), platform),
  );
  const state = Layer.provideMerge(
    workspaceStateLayer({ scope: "project", projectRoot: decodeAbsolutePathSync(workspace.root) }),
    presence,
  );
  const agents = Layer.provideMerge(CodingAgentRepositoryLive, state);
  const projection = Layer.provideMerge(
    Layer.mergeAll(NativeWriteAuthorityLive, WorkspaceCatalogLive),
    agents,
  );
  const policy = Layer.provideMerge(
    Layer.mergeAll(
      AxmSkillCandidateGateLive,
      RegistryResolutionPolicyLive,
      Layer.succeed(
        ArtifactHttpClient,
        HttpClient.make(() => Effect.die("Unexpected HTTP artifact request")),
      ),
    ),
    projection,
  );
  const sources = Layer.provideMerge(SourceHostProvidersLive, policy);
  return Layer.provideMerge(
    Layer.effect(PlanSources, makePlanSources),
    Layer.mergeAll(
      withKindManagers(sources),
      PlanInvocationTest,
      ResolvePlanInteractionTest().layer,
      identity,
    ),
  );
};
