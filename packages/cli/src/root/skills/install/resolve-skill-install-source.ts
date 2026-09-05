import { makeAppError } from "../../../app-error/index.js";
import type {
  InputParseResult,
  InputPattern,
} from "@agentxm/extension-model/unstable/sources/parser";
import {
  resolveShorthandInputSource,
  resolveSlashInputSource,
  routeScpInput,
  routeUrlInput,
} from "@agentxm/extension-sources";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  resolveConfiguredRegistrySource,
  resolveDefaultRegistrySourceByName,
  type RegistryResolutionOptions,
} from "../../shared/install-source-resolution.js";

export const resolveSkillUrl = (url: URL, input: string) => routeUrlInput(url, input);

const resolveSkillRegistrySource = (
  pattern: Extract<InputPattern, { readonly pattern: "registry-pattern-input" }>,
  options: Option.Option<RegistryResolutionOptions>,
) =>
  Effect.gen(function* () {
    if (Option.isSome(pattern.type) && pattern.type.value !== "skills") {
      return yield* makeAppError({
        code: "usage",
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

export const resolveSkillInstallSource = (
  parseResult: InputParseResult,
  options?: RegistryResolutionOptions,
) =>
  Effect.gen(function* () {
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
        return yield* resolveSkillUrl(pattern.url, parseResult.originalInput);
      case "git-scp-address":
        return yield* routeScpInput(pattern, parseResult.originalInput);
      case "file-path-pattern":
        return { type: "local" as const, path: pattern.path };
      case "workspace-pattern-input":
        return yield* makeAppError({
          code: "conflict",
          detail: `Workspace source "${parseResult.originalInput}" is locally authoritative and cannot be installed over`,
          suggestions: [
            { description: "Sync the workspace package", cmd: "axm sync" },
            { description: "Enable the workspace skill", cmd: "axm skills enable <name>" },
          ],
        });
      case "glob-input":
        return yield* makeAppError({
          code: "usage",
          detail: `Input pattern "${pattern.pattern}" is not supported for skill installation`,
          recover:
            "Use a registry reference (e.g., @owner/skill-name), a URL, or a shorthand (owner/repo) instead",
        });
    }
  });
