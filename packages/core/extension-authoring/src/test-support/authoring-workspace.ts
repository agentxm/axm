/**
 * A real project workspace on a temporary directory, wired to the same
 * services an authoring command runs against.
 *
 * Specifications for this feature observe what an author observes: the files
 * a creation writes, the declarations it records, and the projections agents
 * read. Nothing here stubs the feature's own decisions — the managers, the
 * projection writers, and the workspace transaction are the production ones,
 * and only the process boundary (a temporary directory, an unreachable HTTP
 * client, an unattended plan interaction) is standing in.
 *
 * @internal Test-only. Not part of the package's public API.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { AgentPresenceProbeLive } from "@agentxm/agent-integration/live";
import { CredentialStoreTest } from "@agentxm/registry-auth/testing";
import { RegistryUrl } from "@agentxm/registry-client";
import { AxmSkillCandidateGateLive } from "@agentxm/extension-resolution/live";
import {
  decideNamedRegistryVersion,
  namedRegistryCandidates,
  resolveVersionEntryWithReleaseAge,
} from "@agentxm/extension-resolution";
import { RegistryResolutionPolicy } from "@agentxm/extension-sources";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import {
  HookManagerLive,
  KnowledgeManagerLive,
  McpServerManagerLive,
  PackManagerLive,
  RuleManagerLive,
  SkillManagerLive,
  SubagentManagerLive,
  ExtensionManagersLive,
} from "@agentxm/extension-materialization/live";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { previewPlanExecution, type PlanExecution } from "@agentxm/workspace-operations";
import {
  PlanInvocationTest,
  ResolvePlanInteractionTest,
  preapprovedPlanExecution,
} from "@agentxm/workspace-operations/testing";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
  WorkspaceCatalogLive,
} from "@agentxm/workspace-projection/live";
import { layer as workspaceStateLayer } from "@agentxm/workspace-state/live";

/** Settings an authoring specification seeds its workspace with. */
export interface AuthoringWorkspaceSettings {
  readonly owner?: string;
  readonly agents?: ReadonlyArray<string>;
}

export interface AuthoringWorkspace {
  /** Absolute project root the workspace is anchored to. */
  readonly root: string;
  /** Read a workspace-relative file, or `undefined` when it is absent. */
  readonly read: (relativePath: string) => string | undefined;
  /** Whether a workspace-relative path exists. */
  readonly exists: (relativePath: string) => boolean;
  /** The decoded settings document. */
  readonly settings: () => unknown;
  /** Every workspace-relative path that exists under a directory, sorted. */
  readonly tree: () => ReadonlyArray<string>;
  readonly cleanup: () => void;
}

/** Resolution policy the real managers carry; a creation never consults it. */
const RegistryResolutionPolicyTest = Layer.succeed(RegistryResolutionPolicy, {
  selectVersion: resolveVersionEntryWithReleaseAge,
  decideNamedVersion: decideNamedRegistryVersion,
  namedCandidates: namedRegistryCandidates,
});

const walk = (root: string, directory: string): ReadonlyArray<string> => {
  const entries = fs.existsSync(directory)
    ? fs.readdirSync(directory, { withFileTypes: true })
    : [];
  return entries.flatMap((entry) => {
    const absolute = nodePath.join(directory, entry.name);
    const relative = nodePath.relative(root, absolute);
    return entry.isDirectory() ? walk(root, absolute) : [relative];
  });
};

/**
 * Create a temporary project workspace whose settings name an owner and the
 * agents it configures.
 */
export const makeAuthoringWorkspace = (
  settings: AuthoringWorkspaceSettings = {},
): AuthoringWorkspace => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-authoring-")));
  fs.writeFileSync(
    nodePath.join(root, "axm.json"),
    `${JSON.stringify(
      {
        ...(settings.owner === undefined ? {} : { owner: settings.owner }),
        agents: settings.agents ?? [],
      },
      null,
      2,
    )}\n`,
  );
  const absolute = (relativePath: string) => nodePath.join(root, relativePath);
  return {
    root,
    read: (relativePath) =>
      fs.existsSync(absolute(relativePath))
        ? fs.readFileSync(absolute(relativePath), "utf-8")
        : undefined,
    exists: (relativePath) => fs.existsSync(absolute(relativePath)),
    settings: () => JSON.parse(fs.readFileSync(absolute("axm.json"), "utf-8")),
    tree: () => [...walk(root, root)].sort(),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
};

/**
 * Every service an authoring use case keeps in `R`, composed the way the
 * application composes them.
 */
export const authoringWorkspaceLayer = (workspace: AuthoringWorkspace) => {
  // Nothing in a creation prompts, so the interaction records what it was
  // asked and answers without a person.
  const interaction = ResolvePlanInteractionTest();
  // Owner resolution names the signed-in handle only when it has to refuse;
  // an empty credential store and a placeholder Registry keep that lookup
  // answerable without reaching a real keychain or network.
  const identity = Layer.mergeAll(
    CredentialStoreTest(),
    Layer.succeed(RegistryUrl, "https://registry.example.com"),
  );
  const platform = Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer);
  const presence = Layer.provideMerge(AgentPresenceProbeLive, platform);
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
    Layer.mergeAll(AxmSkillCandidateGateLive, RegistryResolutionPolicyTest),
    projection,
  );
  const sources = Layer.provideMerge(SourceHostProvidersLive, policy);
  const managers = Layer.provideMerge(
    Layer.mergeAll(
      SkillManagerLive,
      SubagentManagerLive,
      RuleManagerLive,
      HookManagerLive,
      KnowledgeManagerLive,
      McpServerManagerLive,
      PackManagerLive,
    ),
    sources,
  );
  return Layer.mergeAll(
    Layer.provideMerge(ExtensionManagersLive, managers),
    PlanInvocationTest,
    interaction.layer,
    identity,
  );
};

/** An execution that previews without prompting. */
export const previewExecution: PlanExecution = previewPlanExecution;

/** An execution that applies without prompting. */
export const applyExecution: PlanExecution = preapprovedPlanExecution;
