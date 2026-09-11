/**
 * Which source a skill install request names.
 *
 * Every locator grammar the product accepts routes here: a registry pattern,
 * a provider shorthand, an owner/repo slash, a bare name, a URL, an SCP
 * address, or a local path. A workspace locator is refused because a
 * workspace package is locally authoritative and installing over it would
 * discard the author's own content.
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
  routeScpInput,
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

const resolveSkillRegistrySource = (
  pattern: Extract<InputPattern, { readonly pattern: "registry-pattern-input" }>,
  options: Option.Option<RegistryResolutionOptions>,
) =>
  Effect.gen(function* () {
    if (Option.isSome(pattern.type) && pattern.type.value !== "skills") {
      return yield* installRefused({
        category: "usage",
        detail: `Cannot install "${pattern.type.value}" extensions with "skills install"`,
        recover: `Use the "${pattern.type.value}" command instead, or remove the type qualifier to install as a skill`,
      });
    }

    return yield* resolveConfiguredRegistrySource({
      sourceName: pattern.sourceName,
      owner: pattern.owner,
      extensionType: "skill",
      extensionName: pattern.name,
      options,
    });
  });

/** Route one parsed skill locator to the source that serves it. */
export const resolveSkillInstallSource: (
  parseResult: InputParseResult,
  options?: RegistryResolutionOptions,
) => Effect.Effect<
  Source,
  ExtensionLifecycleFailed | SourceResolutionFailure,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.resolveSkillSource")(function* (
  parseResult: InputParseResult,
  options?: RegistryResolutionOptions,
) {
  const resolutionOptions = Option.fromUndefinedOr(options);
  const pattern = parseResult.pattern;
  switch (pattern.pattern) {
    case "registry-pattern-input":
      return yield* resolveSkillRegistrySource(pattern, resolutionOptions);
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
        extensionType: "skill",
        options: resolutionOptions,
      });
    case "url-input":
      return yield* routeUrlInput(pattern.url, parseResult.originalInput);
    case "git-scp-address":
      return yield* routeScpInput(pattern, parseResult.originalInput);
    case "file-path-pattern":
      return { type: "local" as const, path: pattern.path };
    case "workspace-pattern-input":
      return yield* installRefused({
        category: "conflict",
        detail: `Workspace source "${parseResult.originalInput}" is locally authoritative and cannot be installed over`,
        suggestions: [
          { description: "Sync the workspace package", cmd: "axm sync" },
          { description: "Enable the workspace skill", cmd: "axm skills enable <name>" },
        ],
      });
    case "glob-input":
      return yield* installRefused({
        category: "usage",
        detail: `Input pattern "${pattern.pattern}" is not supported for skill installation`,
        recover:
          "Use a registry reference (e.g., @owner/skill-name), a URL, or a shorthand (owner/repo) instead",
      });
  }
});
