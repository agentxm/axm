/** Route a skill or subagent locator to its source. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { extensionTypeToPlural } from "@agentxm/extension-model/unstable/extensions";
import type { InputParseResult } from "@agentxm/extension-model/unstable/sources/parser";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import {
  resolveShorthandInputSource,
  resolveSlashInputSource,
  routeScpInput,
  routeUrlInput,
  type SourceResolutionFailure,
} from "../../resolution/sources/index.js";
import type { ExtensionLifecycleFailed } from "../errors.js";
import {
  resolveConfiguredRegistrySource,
  resolveDefaultRegistrySourceByName,
  type InstallableRegistryType,
  type RegistryResolutionOptions,
} from "./registry-source-resolution.js";
import { installRefused, type ResolveInstallRequirements } from "./vocabulary.js";

export type LocatorInstallType = InstallableRegistryType;

const SCP_ADDRESS_ROUTED: Record<LocatorInstallType, boolean> = {
  skill: true,
  subagent: false,
};

export const resolveInstallSource: (
  type: LocatorInstallType,
  parseResult: InputParseResult,
  options?: RegistryResolutionOptions,
) => Effect.Effect<
  Source,
  ExtensionLifecycleFailed | SourceResolutionFailure,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.resolveSource")(function* (
  type: LocatorInstallType,
  parseResult: InputParseResult,
  options?: RegistryResolutionOptions,
) {
  const pattern = parseResult.pattern;
  const resolutionOptions = Option.fromUndefinedOr(options);
  switch (pattern.pattern) {
    case "registry-pattern-input":
      if (Option.isSome(pattern.type) && pattern.type.value !== extensionTypeToPlural[type]) {
        return yield* installRefused({
          category: "usage",
          detail: `Cannot install "${pattern.type.value}" extensions with "${extensionTypeToPlural[type]} install"`,
          recover: `Use the "${pattern.type.value}" command instead, or remove the type qualifier to install as a ${type}`,
        });
      }
      return yield* resolveConfiguredRegistrySource({
        sourceName: pattern.sourceName,
        owner: pattern.owner,
        extensionType: type,
        extensionName: pattern.name,
        options: resolutionOptions,
      });
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
        extensionType: type,
        options: resolutionOptions,
      });
    case "url-input":
      return yield* routeUrlInput(pattern.url, parseResult.originalInput);
    case "git-scp-address":
      if (SCP_ADDRESS_ROUTED[type]) {
        return yield* routeScpInput(pattern, parseResult.originalInput);
      }
      return yield* installRefused({
        category: "usage",
        detail: `Input pattern "${pattern.pattern}" is not supported for ${type} installation`,
        recover: `Use a registry reference (e.g., @owner/${extensionTypeToPlural[type]}/name), a URL, or a shorthand (owner/repo) instead`,
      });
    case "file-path-pattern":
      return { type: "local", path: pattern.path };
    case "workspace-pattern-input":
      return yield* installRefused({
        category: "conflict",
        detail: `Workspace source "${parseResult.originalInput}" is locally authoritative and cannot be installed over`,
        suggestions: [
          { description: "Sync the workspace package", cmd: "axm sync" },
          {
            description: `Enable the workspace ${type}`,
            cmd: `axm ${extensionTypeToPlural[type]} enable <name>`,
          },
        ],
      });
    case "glob-input":
      return yield* installRefused({
        category: "usage",
        detail: `Input pattern "${pattern.pattern}" is not supported for ${type} installation`,
        recover: `Use a registry reference (e.g., @owner/${extensionTypeToPlural[type]}/name), a URL, or a shorthand (owner/repo) instead`,
      });
  }
});
