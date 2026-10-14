/**
 * Reports desired bindings that diverge from accepted lock authority.
 *
 * The desired-state graph decides which endpoint each declaration binds to,
 * including a Pack member declared with its own Registry endpoint; this rule
 * only joins that binding with the accepted row's endpoint and reports the
 * ones that no longer agree. A configured alias names the binding in the
 * message and never decides agreement.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { sameRegistryEndpoint } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";
import {
  acceptedRowKey,
  lockEntries,
  type DesiredExtensionNode,
  type Lockfile,
  type SourceHostConfig,
  settingsDisplayPath,
} from "@agentxm/workspace-kernel/workspace-state";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";

const RULE_ID = "workspace/source-endpoints-aligned";

type AcceptedSource = Lockfile["skills"][string]["source"];

const finding = (message: string, settingsPath: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message,
  location: { file: settingsPath },
});

/** A Registry binding whose endpoint is not the one its accepted row was resolved from. */
const registryMismatch = (
  node: DesiredExtensionNode,
  accepted: AcceptedSource,
  settingsPath: string,
): ReadonlyArray<AdvisoryFinding> => {
  if (node.identity.authority !== "registry") return [];
  const bound = node.identity.registry.endpoint;
  if (bound === undefined || accepted.type !== "registry") return [];
  if (sameRegistryEndpoint(bound, accepted.url)) return [];
  const sourceName = node.identity.registry.sourceName;
  const binding =
    sourceName === undefined ? "its declared Registry endpoint" : `source '${sourceName}'`;
  return [
    finding(
      `Accepted resolution '${node.type}:${node.name}' was resolved from registry ${accepted.url.href}, but ${binding} now binds it to registry ${bound.href}. Use an explicit source transition before syncing.`,
      settingsPath,
    ),
  ];
};

/** A git shorthand whose configured host no longer serves the accepted repository. */
const gitHostMismatch = (
  node: DesiredExtensionNode,
  accepted: AcceptedSource,
  configuredSources: ReadonlyArray<SourceHostConfig>,
  settingsPath: string,
): ReadonlyArray<AdvisoryFinding> => {
  if (node.identity.authority !== "git" || accepted.type !== "git") return [];
  const prefix = Option.flatMap(parseInputPattern(node.identity.locator), (parsed) =>
    parsed.pattern.pattern === "shorthand-input"
      ? Option.some(parsed.pattern.prefix)
      : Option.none(),
  );
  if (Option.isNone(prefix)) return [];
  const configured = configuredSources.find((source) => source.name === prefix.value);
  if (configured === undefined) return [];
  const lockedHost = new URL("/", accepted.url).href;
  if (configured.location.href === lockedHost) return [];
  return [
    finding(
      `Accepted resolution '${node.type}:${node.name}' binds source '${prefix.value}' to ${configured.type} ${lockedHost}, but the configured source now resolves to ${configured.type} ${configured.location.href}. Use an explicit source transition before syncing.`,
      settingsPath,
    ),
  ];
};

const collectFindings = (
  nodes: ReadonlyArray<DesiredExtensionNode>,
  lockfile: Lockfile,
  configuredSources: ReadonlyArray<SourceHostConfig>,
  settingsPath: string,
): ReadonlyArray<AdvisoryFinding> =>
  nodes.flatMap((node) =>
    Option.match(
      Option.flatMap(acceptedRowKey(node), (key) => lockEntries[node.type].entry(lockfile, key)),
      {
        onNone: () => [],
        onSome: (accepted) => [
          ...registryMismatch(node, accepted.source, settingsPath),
          ...gitHostMismatch(node, accepted.source, configuredSources, settingsPath),
        ],
      },
    ),
  );

export const sourceEndpointsAlignedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Configured source endpoints remain aligned with accepted lock authority.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.health === undefined) return [];
      // An incomplete graph still binds every declaration it holds; only a
      // graph that cannot be read at all leaves nothing to compare.
      const graph = yield* Effect.result(context.health.desiredState);
      const lockfile = yield* Effect.result(context.workspace.state.lockfile);
      const sources = yield* Effect.result(context.workspace.sourceHosts.declared);
      if (
        Result.isFailure(graph) ||
        Result.isFailure(lockfile) ||
        Option.isNone(lockfile.success) ||
        Result.isFailure(sources)
      ) {
        return [];
      }
      return collectFindings(
        graph.success.nodes,
        lockfile.success.value,
        sources.success,
        settingsDisplayPath(context.subject.scope),
      );
    }),
};
