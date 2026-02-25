import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { createRegistryClient } from "../../../registry/index.js";
import type { InputParseResult, InputPattern } from "../../../sources/parser.js";
import {
  resolveShorthandInputSource,
  resolveSlashInputSource,
  routeUrlInput,
} from "../../../sources/resolve-source.js";
import { Workspace } from "../../../workspace/index.js";
import type { RegistrySource } from "../../../sources/types.js";

const resolveRegistrySource = (
  namespace: string,
  input: string,
  options: {
    readonly findMatchingNamespace: boolean;
  },
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const registrySources = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "REGISTRY_CONFIG_READ_FAILED",
          what: `Failed to read configured registry sources for namespace "${namespace}"`,
          details: [input],
          howToFix: "Check that your workspace settings file is valid and accessible",
          cause: e,
        }),
      ),
    );

    if (registrySources.length === 0) {
      return yield* makeCliError({
        code: "REGISTRY_NO_SOURCE_CONFIGURED",
        what: `No registry source is configured for namespace "${namespace}"`,
        details: [input],
        howToFix: `Add a registry source for namespace "${namespace}" using "axm sources add"`,
      });
    }
    if (registrySources.length === 1 || !options.findMatchingNamespace) {
      const regConfig = registrySources[0]!;
      return {
        type: "registry" as const,
        location: regConfig.location,
        namespace: Option.some(namespace),
      } satisfies RegistrySource;
    }

    for (const regConfig of registrySources) {
      const client = yield* createRegistryClient(regConfig.location.href);
      const { exists: hasRequestedNamespace } = yield* client.namespaceExists(namespace);
      if (hasRequestedNamespace) {
        return {
          type: "registry" as const,
          location: regConfig.location,
          namespace: Option.some(namespace),
        } satisfies RegistrySource;
      }
    }

    return yield* makeCliError({
      code: "REGISTRY_NAMESPACE_NOT_FOUND",
      what: `None of the configured registry sources contain namespace "${namespace}"`,
      details: [input],
      howToFix: `Verify the namespace name is correct, or add a registry that hosts "${namespace}"`,
    });
  });

const resolveSkillRegistrySourceByName = (name: string, input: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    // DefaultNamespace: project settings > user settings > logged-in identity > none
    const maybeNamespace = yield* ws.getDefaultNamespace();

    if (Option.isNone(maybeNamespace)) {
      return yield* makeCliError({
        code: "REGISTRY_SKILL_NOT_FOUND",
        what: `Skill "${name}" could not be looked up (no default namespace)`,
        details: [`Provided: ${input}`, `No default namespace configured and not logged in`],
        howToFix:
          "Configure a namespace in settings.json, log in with `axm auth login`, or install with an explicit source like github:owner/repo or @namespace/skills/name",
      });
    }
    const namespace = maybeNamespace.value;

    const registryHosts = yield* ws.getRegistrySourceHosts();

    if (registryHosts.length === 0) {
      return yield* makeCliError({
        code: "REGISTRY_SKILL_NOT_FOUND",
        what: `Skill "${namespace}/${name}" could not be looked up (no registry sources)`,
        details: [
          `Provided: ${input}`,
          `Default namespace: ${namespace}`,
          `No registry sources configured`,
        ],
        howToFix:
          "Configure a registry source in settings.json, or install with an explicit source like github:owner/repo",
      });
    }

    const checked: string[] = [];
    for (const reg of registryHosts) {
      checked.push(reg.location.href);
      const client = yield* createRegistryClient(reg.location.href);
      const { exists } = yield* client
        .extensionExists({ namespace, type: "skill", name })
        .pipe(Effect.orElseSucceed(() => ({ exists: false })));
      if (exists) {
        return {
          type: "registry" as const,
          location: reg.location,
          namespace: Option.some(namespace),
        } satisfies RegistrySource;
      }
    }

    return yield* makeCliError({
      code: "REGISTRY_SKILL_NOT_FOUND",
      what: `Skill "${namespace}/${name}" was not found in configured registries`,
      details: [
        `Provided: ${input}`,
        `Default namespace: ${namespace}`,
        `Checked registries: ${checked.join(", ")}`,
      ],
      howToFix:
        "Verify the skill name, or install with an explicit source like github:owner/repo or @namespace/skills/name",
    });
  });

const resolveSkillRegistrySource = (
  pattern: Extract<InputPattern, { readonly pattern: "registry-pattern-input" }>,
) =>
  Effect.gen(function* () {
    if (Option.isSome(pattern.type) && pattern.type.value !== "skills") {
      return yield* makeCliError({
        code: "SKILL_INSTALL_WRONG_TYPE",
        what: `Cannot install "${pattern.type.value}" extensions with "skills install"`,
        details: [pattern.namespace],
        howToFix: `Use the "${pattern.type.value}" command instead, or remove the type qualifier to install as a skill`,
      });
    }

    return yield* resolveRegistrySource(pattern.namespace, pattern.namespace, {
      findMatchingNamespace: true,
    });
  });

export const resolveSkillUrl = (url: URL, input: string) => routeUrlInput(url, input);

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
      case "url-input":
        return yield* resolveSkillUrl(pattern.url, parseResult.originalInput);
      case "file-path-pattern":
        return { type: "local" as const, path: pattern.path };
      // Unsupported:
      case "git-scp-address":
      case "glob-input":
        return yield* makeCliError({
          code: "SKILL_INSTALL_UNSUPPORTED_INPUT",
          what: `Input pattern "${pattern.pattern}" is not supported for skill installation`,
          details: [parseResult.originalInput],
          howToFix:
            "Use a registry reference (e.g., @namespace/skill-name), a URL, or a shorthand (owner/repo) instead",
        });
    }
  });
