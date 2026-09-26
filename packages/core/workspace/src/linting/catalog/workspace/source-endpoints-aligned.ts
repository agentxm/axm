/**
 * Reports configured source hosts that diverge from accepted lock authority.
 *
 * The desired-state graph decides which configured source each declaration
 * binds to; this rule only joins that binding with the accepted row's
 * endpoint and reports the ones that no longer agree.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";
import {
  acceptedRowKey,
  lockEntries,
  type DesiredExtensionNode,
  type Lockfile,
  type SourceHostConfig,
} from "../../../desired-state/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import { settingsDisplayPath } from "../../../desired-state/index.js";

const RULE_ID = "workspace/source-endpoints-aligned";

/** The endpoint an accepted row was resolved from, for the host kinds a source can name. */
const acceptedEndpoint = (source: Lockfile["skills"][string]["source"]): Option.Option<URL> =>
  source.type === "git"
    ? Option.some(new URL("/", source.url))
    : source.type === "registry"
      ? Option.some(source.url)
      : Option.none();

/**
 * The configured source a desired node binds to: the Registry the graph bound
 * a Registry declaration to, or the git host a shorthand locator names.
 */
const boundSourceName = (node: DesiredExtensionNode): Option.Option<string> => {
  switch (node.identity.authority) {
    case "registry":
      return Option.fromUndefinedOr(node.identity.registry.sourceName);
    case "git":
      return Option.flatMap(parseInputPattern(node.identity.locator), (parsed) =>
        parsed.pattern.pattern === "shorthand-input"
          ? Option.some(parsed.pattern.prefix)
          : Option.none(),
      );
    default:
      return Option.none();
  }
};

const collectFindings = (
  nodes: ReadonlyArray<DesiredExtensionNode>,
  lockfile: Lockfile,
  configuredSources: ReadonlyArray<SourceHostConfig>,
  settingsPath: string,
): ReadonlyArray<AdvisoryFinding> =>
  nodes.flatMap((node) => {
    const sourceName = boundSourceName(node);
    const rowKey = acceptedRowKey(node);
    if (Option.isNone(sourceName) || Option.isNone(rowKey)) return [];
    const configured = configuredSources.find((source) => source.name === sourceName.value);
    if (configured === undefined) return [];
    const accepted = lockEntries[node.type].entry(lockfile, rowKey.value);
    if (Option.isNone(accepted)) return [];
    const lockedEndpoint = acceptedEndpoint(accepted.value.source);
    if (Option.isNone(lockedEndpoint) || configured.location.href === lockedEndpoint.value.href) {
      return [];
    }
    return [
      {
        kind: "advisory",
        ruleId: RULE_ID,
        severity: "error",
        message: `Accepted resolution '${node.type}:${node.name}' binds source '${sourceName.value}' to ${configured.type} ${lockedEndpoint.value.href}, but the configured source now resolves to ${configured.type} ${configured.location.href}. Use an explicit source transition before syncing.`,
        location: { file: settingsPath },
      },
    ];
  });

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
