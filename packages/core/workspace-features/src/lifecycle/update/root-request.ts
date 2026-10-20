/**
 * The grammar a root `update` request is written in.
 *
 * Root update names one extension by its Registry identity and nothing else.
 * A path, URL, or Git source names a package whose identity the workspace
 * cannot compare against what it already accepted, and a Library is a curated
 * collection rather than an installed package, so both are refused here with
 * the per-type route that does accept them. The refusal carries its own
 * how-to-fix sentence: what a person should type instead depends on what they
 * typed, and only this grammar knows that.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { OperationRefused, installRefused } from "@agentxm/workspace-kernel/operations";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { ExtensionName, Handle } from "@agentxm/extension-model/unstable/extensions";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";

import { decodeRootRegistryFqn } from "../root-registry-fqn.js";

/** One Registry identity a root update names, with the range it requested. */
export interface RootUpdateIntent {
  readonly source: string;
  readonly type: InstallableExtensionType;
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly versionRange: Option.Option<VersionRange>;
  readonly target: string;
}

const rootUpdateRegistryOnlyHowToFix = (source: string): string => {
  const parsed = parseInputPattern(source);

  if (Option.isNone(parsed)) {
    return "Use `axm update @<handle>/<plural-type>/<name>[@<version>]`. For path, URL, or git sources, use `axm skills update <source>` or `axm subagents update <source>` instead.";
  }

  switch (parsed.value.pattern.pattern) {
    case "file-path-pattern":
    case "url-input":
    case "git-scp-address":
    case "shorthand-input":
    case "slash-pattern":
      return `Root update only accepts registry FQNs. Use \`axm skills update ${source}\` or \`axm subagents update ${source}\` instead.`;
    case "name-input":
    case "glob-input":
      return `Root update only accepts registry FQNs. Use the matching per-type command instead: \`axm skills update ${source}\` or \`axm subagents update ${source}\`.`;
    case "registry-pattern-input":
      return "Use `axm update @<handle>/<plural-type>/<name>[@<version>]`.";
    case "workspace-pattern-input":
      return "Workspace-sourced extensions are locally authoritative and are not update targets.";
  }
};

/**
 * Read one root-update request. Fails with the refusal a person can act on;
 * succeeds with the Registry identity every later step is decided against.
 */
export const resolveRootUpdateIntent: (
  input: string,
) => Effect.Effect<RootUpdateIntent, OperationRefused> = Effect.fn(
  "UpdateExtensions.readRootRequest",
)(function* (input: string) {
  const source = input.trim();

  if (!source.startsWith("@")) {
    return yield* installRefused({
      category: "usage",
      detail: "Root update only accepts registry FQNs",
      suggestions: [{ description: rootUpdateRegistryOnlyHowToFix(source) }],
    });
  }

  const { ref, type } = yield* decodeRootRegistryFqn({
    verb: "update",
    grammar: "@<handle>/<plural-type>/<name>[@<version>]",
    source,
    fqn: source,
  });

  return {
    source,
    type,
    owner: ref.owner,
    name: ref.name,
    versionRange: Option.fromUndefinedOr(ref.versionRange),
    target: `${ref.owner}/${ref.type}/${ref.name}`,
  } satisfies RootUpdateIntent;
});
