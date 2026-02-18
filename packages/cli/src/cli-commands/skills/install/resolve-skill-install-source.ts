import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { createRegistryClient } from "../../../registry/index.js";
import type { InputParseResult, InputPattern } from "../../../sources/parser.js";
import {
  resolveShorthandInputSource,
  resolveSlashInputSource,
} from "../../../sources/resolve-source.js";
import { Workspace } from "../../../workspace/index.js";
import type { RegistrySource } from "../../../sources/types.js";

const resolveRegistrySource = (
  scope: string,
  input: string,
  options: {
    readonly findMatchingScope: boolean;
  },
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const registrySources = yield* ws.getConfiguredRegistrySources(Option.some(scope)).pipe(
      Effect.mapError((e) =>
        makeCliError({
          // TODO: update and make error more accurate/meaningful
          code: "SOURCE_PARSE_FAILED",
          what: `Failed to get registry sources: ${e._tag}`,
          details: [input],
        }),
      ),
    );

    if (registrySources.length === 0) {
      return yield* makeCliError({
        // TODO: update and make error more accurate/meaningful
        code: "SOURCE_PARSE_FAILED",
        what: `No registry source configured for scope "${scope}"`,
        details: [input],
      });
    }
    if (registrySources.length === 1 || !options.findMatchingScope) {
      const regConfig = registrySources[0]!;
      return {
        type: "registry" as const,
        location: regConfig.location,
        scope: Option.some(scope),
      } satisfies RegistrySource;
    }

    for (const regConfig of registrySources) {
      const client = yield* createRegistryClient(regConfig.location.href);
      const { exists: hasRequestedScope } = yield* client.scopeExists(scope);
      if (hasRequestedScope) {
        return {
          type: "registry" as const,
          location: regConfig.location,
          scope: Option.some(scope),
        } satisfies RegistrySource;
      }
    }

    return yield* makeCliError({
      // TODO: update and make error more accurate/meaningful
      code: "SOURCE_PARSE_FAILED",
      what: `No registry source contains scope "${scope}"`,
      details: [input],
    });
  });

const resolveSkillRegistrySourceByName = (name: string, input: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const scope = yield* ws.getConfiguredScope();
    const registrySources = yield* ws.getConfiguredRegistrySources(Option.some(scope)).pipe(
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
        what: `No registry source configured for scope "${scope}"`,
        details: [input],
      });
    }

    for (const regConfig of registrySources) {
      const client = yield* createRegistryClient(regConfig.location.href);
      const { exists } = yield* client.extensionExists({ scope, type: "skill", name });
      if (exists) {
        return {
          type: "registry" as const,
          location: regConfig.location,
          scope: Option.some(scope),
        } satisfies RegistrySource;
      }
    }

    return yield* makeCliError({
      code: "SOURCE_PARSE_FAILED",
      what: `No registry source contains skill "${scope}/${name}"`,
      details: [input],
    });
  });

const resolveSkillRegistrySource = (
  pattern: Extract<InputPattern, { readonly pattern: "registry-pattern-input" }>,
) =>
  Effect.gen(function* () {
    if (Option.isSome(pattern.type) && pattern.type.value !== "skills") {
      return yield* makeCliError({
        // TODO: update and make error more accurate/meaningful
        code: "SOURCE_PARSE_FAILED",
        what: "Expected a skills registry source",
        details: [pattern.scope],
      });
    }

    return yield* resolveRegistrySource(pattern.scope, pattern.scope, {
      findMatchingScope: true,
    });
  });

export const resolveSkillInstallSource = (parseResult: InputParseResult) =>
  Effect.gen(function* () {
    const pattern = parseResult.pattern;
    switch (pattern.pattern) {
      case "registry-pattern-input":
        return yield* resolveSkillRegistrySource(pattern);
      case "shorthand-input":
        return yield* resolveShorthandInputSource({
          pattern,
          originalInput: parseResult.originalInput,
        });
      case "slash-pattern":
        return yield* resolveSlashInputSource(pattern, parseResult.originalInput);
      case "name-input":
        return yield* resolveSkillRegistrySourceByName(pattern.name, parseResult.originalInput);
      // Unsupported:
      case "url-input":
      case "git-scp-address":
      case "file-path-pattern":
      case "glob-input":
        return yield* makeCliError({
          // TODO: update and make error more accurate/meaningful
          code: "SOURCE_PARSE_FAILED",
          what: "Glob patterns are not supported by resolveSkillInstallSource - use resolveSourcePattern instead",
          details: [parseResult.originalInput],
        });
    }
  });
