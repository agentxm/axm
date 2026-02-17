import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { parseInputPattern } from "../../../sources/parser.js";
import {
  routeFilePathInput,
  routeNameInput,
  routeRegistryInput,
  routeScpInput,
  routeShorthandInput,
  routeSlashInput,
  routeUrlInput,
} from "../../../sources/resolve-source.js";

export const resolveSkillInstallSource = (input: string) =>
  Effect.gen(function* () {
    const trimmed = input.trim();
    if (!trimmed) {
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Source string cannot be empty",
        details: [input],
      });
    }

    const patternOpt = parseInputPattern(trimmed);
    if (Option.isNone(patternOpt)) {
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Unable to parse source",
        details: [input],
      });
    }

    const pattern = patternOpt.value;
    switch (pattern._tag) {
      case "UrlInput":
        return yield* routeUrlInput(pattern.url, trimmed);
      case "GitScpAddress":
        return yield* routeScpInput(pattern, trimmed);
      case "ShorthandInput":
        return yield* routeShorthandInput(pattern.prefix, pattern.input, trimmed);
      case "NameInput":
        return yield* routeNameInput(pattern.name, trimmed);
      case "FilePathPattern":
        return yield* routeFilePathInput(pattern.path);
      case "RegistryPatternInput":
        return yield* routeRegistryInput(pattern, trimmed);
      case "SlashPattern":
        return yield* routeSlashInput(pattern, trimmed);
      case "GlobInput":
        return yield* makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: "Glob patterns are not supported by resolveSkillInstallSource - use resolveSourcePattern instead",
          details: [input],
        });
    }
  });
