import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { parseInputPattern, type InputPattern } from "../../../sources/parser.js";
import {
  routeFilePathInput,
  routeNameInput,
  routeScpInput,
  routeShorthandInput,
  routeSlashInput,
  routeUrlInput,
} from "../../../sources/resolve-source.js";
import { Workspace } from "../../../workspace/index.js";
import type { RegistrySource } from "../../../sources/types.js";

const resolveSkillRegistrySource = (
  pattern: Extract<InputPattern, { readonly pattern: "registry-pattern-input" }>,
  input: string,
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    if (Option.isSome(pattern.type) && pattern.type.value !== "skills") {
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Expected a skills registry source",
        details: [input],
      });
    }

    const scope = Option.some(pattern.scope);
    const registrySources = yield* ws.getConfiguredRegistrySources(scope).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: `Failed to get registry sources: ${e._tag}`,
          details: [input],
        }),
      ),
    );

    if (registrySources.length === 0) {
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: `No registry source configured for scope "${pattern.scope}"`,
        details: [input],
      });
    }

    const regConfig = registrySources[0]!;
    return {
      type: "registry" as const,
      scope: pattern.scope,
      extensionTypes: ["skills"],
      versionConstraint: pattern.versionConstraint,
      location: regConfig.location,
    } satisfies RegistrySource;
  });

export const resolveSkillInstallSource = (input: string) =>
  Effect.gen(function* () {
    const trimmed = input.trim();
    const patternOpt = parseInputPattern(trimmed);
    if (Option.isNone(patternOpt)) {
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Unable to parse source",
        details: [input],
      });
    }

    const pattern = patternOpt.value;
    switch (pattern.pattern) {
      case "registry-pattern-input":
        return yield* resolveSkillRegistrySource(pattern, trimmed);
      case "name-input":
        return yield* routeNameInput(pattern.name, trimmed);
      case "url-input":
        return yield* routeUrlInput(pattern.url, trimmed);
      case "git-scp-address":
        return yield* routeScpInput(pattern, trimmed);
      case "shorthand-input":
        return yield* routeShorthandInput(pattern.prefix, pattern.input, trimmed);
      case "file-path-pattern":
        return yield* routeFilePathInput(pattern.path);
      case "slash-pattern":
        return yield* routeSlashInput(pattern, trimmed);
      case "glob-input":
        return yield* makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: "Glob patterns are not supported by resolveSkillInstallSource - use resolveSourcePattern instead",
          details: [input],
        });
    }
  });
