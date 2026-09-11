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
import { makeMemoryMcpSecretStore } from "@agentxm/extension-materialization/testing";
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
  /** Write a workspace-relative file, creating parents. */
  readonly write: (relativePath: string, contents: string) => void;
  /** Whether a workspace-relative path exists. */
  readonly exists: (relativePath: string) => boolean;
  /** The decoded settings document. */
  readonly settings: () => unknown;
  /** Replace the settings document wholesale. */
  readonly writeSettings: (value: unknown) => void;
  /** The lockfile text, or an empty string when there is none. */
  readonly lockfileText: () => string;
  /** Every workspace-relative path that exists under a directory, sorted. */
  readonly tree: () => ReadonlyArray<string>;
  /**
   * Byte-exact content of a subtree: workspace-relative path mapped to
   * `"directory"` or `"file:<base64>"`. Two snapshots are equal only when
   * every path and every byte is unchanged; a missing root snapshots empty.
   */
  readonly snapshot: (relativePath?: string) => Readonly<Record<string, string>>;
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
  const snapshot = (relativePath = "."): Readonly<Record<string, string>> => {
    const target = absolute(relativePath);
    const entries: Record<string, string> = {};
    if (!fs.existsSync(target)) return entries;
    if (!fs.statSync(target).isDirectory()) {
      entries["."] = `file:${fs.readFileSync(target).toString("base64")}`;
      return entries;
    }
    const visit = (directory: string): void => {
      for (const entry of fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
        const child = nodePath.join(directory, entry.name);
        const relative = nodePath.relative(target, child);
        if (entry.isDirectory()) {
          entries[relative] = "directory";
          visit(child);
        } else {
          entries[relative] = `file:${fs.readFileSync(child).toString("base64")}`;
        }
      }
    };
    visit(target);
    return entries;
  };
  return {
    root,
    read: (relativePath) =>
      fs.existsSync(absolute(relativePath))
        ? fs.readFileSync(absolute(relativePath), "utf-8")
        : undefined,
    write: (relativePath, contents) => {
      const target = absolute(relativePath);
      fs.mkdirSync(nodePath.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    },
    exists: (relativePath) => fs.existsSync(absolute(relativePath)),
    settings: () => JSON.parse(fs.readFileSync(absolute("axm.json"), "utf-8")),
    writeSettings: (value) => {
      fs.writeFileSync(absolute("axm.json"), `${JSON.stringify(value, null, 2)}\n`);
    },
    lockfileText: () =>
      fs.existsSync(absolute("axm-lock.yaml"))
        ? fs.readFileSync(absolute("axm-lock.yaml"), "utf-8")
        : "",
    tree: () => [...walk(root, root)].sort(),
    snapshot,
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
};

/**
 * Every service an authoring use case keeps in `R`, composed the way the
 * application composes them.
 */
export const authoringWorkspaceLayer = (workspace: AuthoringWorkspace) =>
  authoringWorkspaceEnvironment(workspace).layer;

/**
 * The same environment, with the plan interaction's recorded calls exposed.
 *
 * A preview must never ask a person to confirm, and an authoring use case
 * never prompts at all, so the recorded calls are evidence the specifications
 * assert on directly.
 */
export const authoringWorkspaceEnvironment = (workspace: AuthoringWorkspace) => {
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
  // MCP connection secrets stay in memory: a specification must never reach
  // the developer's real credential store, and an in-memory store answers the
  // same typed outcomes the real one does.
  const secrets = makeMemoryMcpSecretStore();
  return {
    layer: Layer.mergeAll(
      Layer.provideMerge(ExtensionManagersLive, managers),
      PlanInvocationTest,
      interaction.layer,
      identity,
      secrets.layer,
    ),
    /** Every plan presentation and confirmation the run asked for. */
    interaction: interaction.state,
    /** MCP connection secrets the run persisted, keyed by account digest. */
    secrets: secrets.entries,
  };
};

/** An execution that previews without prompting. */
export const previewExecution: PlanExecution = previewPlanExecution;

/** An execution that applies without prompting. */
export const applyExecution: PlanExecution = preapprovedPlanExecution;
