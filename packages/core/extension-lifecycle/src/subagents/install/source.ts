/**
 * Which source a subagent install request names.
 *
 * The same routing the skill request uses, minus the SCP address form, which
 * no subagent source has ever been published under.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type {
  InputParseResult,
  InputPattern,
} from "@agentxm/extension-model/unstable/sources/parser";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import {
  resolveShorthandInputSource,
  resolveSlashInputSource,
  routeUrlInput,
  type SourceResolutionFailure,
} from "@agentxm/extension-sources";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import {
  resolveConfiguredRegistrySource,
  resolveDefaultRegistrySourceByName,
  type RegistryResolutionOptions,
} from "../../install/registry-source-resolution.js";
import { installRefused, type ResolveInstallRequirements } from "../../install/vocabulary.js";

const resolveSubagentRegistrySource = (
  pattern: Extract<InputPattern, { readonly pattern: "registry-pattern-input" }>,
  options: Option.Option<RegistryResolutionOptions>,
) =>
  Effect.gen(function* () {
    if (Option.isSome(pattern.type) && pattern.type.value !== "subagents") {
      return yield* installRefused({
        category: "usage",
        detail: `Cannot install "${pattern.type.value}" extensions with "subagents install"`,
        recover: `Use the "${pattern.type.value}" command instead, or remove the type qualifier to install as a subagent`,
      });
    }

    return yield* resolveConfiguredRegistrySource({
      sourceName: pattern.sourceName,
      owner: pattern.owner,
      extensionType: "subagent",
      extensionName: pattern.name,
      options,
    });
  });

/** Route one parsed subagent locator to the source that serves it. */
export const resolveSubagentInstallSource: (
  parseResult: InputParseResult,
  options?: RegistryResolutionOptions,
) => Effect.Effect<
  Source,
  ExtensionLifecycleFailed | SourceResolutionFailure,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.resolveSubagentSource")(function* (
  parseResult: InputParseResult,
  options?: RegistryResolutionOptions,
) {
  const resolutionOptions = Option.fromUndefinedOr(options);
  const pattern = parseResult.pattern;
  switch (pattern.pattern) {
    case "registry-pattern-input":
      return yield* resolveSubagentRegistrySource(pattern, resolutionOptions);
    case "shorthand-input":
      return yield* resolveShorthandInputSource({
        pattern,
        originalInput: parseResult.originalInput,
      });
    case "slash-pattern":
      return yield* resolveSlashInputSource(pattern, parseResult.originalInput);
    case "name-input":
      return yield* resolveDefaultRegistrySourceByName({
        name: pattern.name,
        extensionType: "subagent",
        options: resolutionOptions,
      });
    case "url-input":
      return yield* routeUrlInput(pattern.url, parseResult.originalInput);
    case "file-path-pattern":
      return { type: "local" as const, path: pattern.path };
    case "workspace-pattern-input":
      return yield* installRefused({
        category: "conflict",
        detail: `Workspace source "${parseResult.originalInput}" is locally authoritative and cannot be installed over`,
        suggestions: [
          { description: "Sync the workspace package", cmd: "axm sync" },
          { description: "Enable the workspace subagent", cmd: "axm subagents enable <name>" },
        ],
      });
    case "git-scp-address":
    case "glob-input":
      return yield* installRefused({
        category: "usage",
        detail: `Input pattern "${pattern.pattern}" is not supported for subagent installation`,
        recover:
          "Use a registry reference (e.g., @owner/subagents/name), a URL, or a shorthand (owner/repo) instead",
      });
  }
});
