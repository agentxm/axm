import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "../../../app-error/index.js";
import { createRegistryClient, type RegistryClient } from "../../../registry/index.js";
import type { InputParseResult, InputPattern } from "../../../sources/index.js";
import {
  resolveShorthandInputSource,
  resolveSlashInputSource,
  routeUrlInput,
} from "../../../sources/resolve-source.js";
import { Workspace } from "../../../workspace/index.js";
import type { RegistrySource } from "../../../sources/index.js";

export type RegistryLookupProbe = {
  readonly location: string;
  readonly outcome: "matched" | "not-found" | "error";
  readonly reason: Option.Option<string>;
};

type ResolveSkillInstallSourceOptions = {
  readonly onRegistryProbe: (probe: RegistryLookupProbe) => void;
};

type RegistryLookupIssue = {
  readonly location: string;
  readonly message: string;
  readonly code: Option.Option<string>;
};

const isAppError = (error: unknown): error is AppError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "AppError" &&
  "what" in error &&
  "code" in error;

const summarizeLookupError = (error: unknown): string => {
  if (isAppError(error)) {
    return `${error.what} (${error.code})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const toLookupIssue = (location: URL, error: unknown): RegistryLookupIssue => ({
  location: location.href,
  message: summarizeLookupError(error),
  code: isAppError(error) ? Option.some(error.code) : Option.none<string>(),
});

const hasRemoteNotSupportedIssue = (issues: ReadonlyArray<RegistryLookupIssue>): boolean =>
  issues.some(
    (issue) =>
      Option.isSome(issue.code) &&
      (issue.code.value === "REGISTRY_REMOTE_NOT_SUPPORTED" ||
        (issue.code.value.startsWith("REGISTRY_REMOTE_") &&
          issue.code.value.endsWith("_NOT_IMPLEMENTED"))),
  );

const registryLookupHowToFix = ({
  issues,
  fallback,
}: {
  readonly issues: ReadonlyArray<RegistryLookupIssue>;
  readonly fallback: string;
}): string =>
  hasRemoteNotSupportedIssue(issues)
    ? "Remote registry discovery is not yet supported for HTTP(S) sources. Use a file:// registry source, or install from github:owner/repo."
    : fallback;

const checkRegistryMatch = ({
  client,
  namespace,
  skillName,
}: {
  readonly client: RegistryClient;
  readonly namespace: string;
  readonly skillName: Option.Option<string>;
}) =>
  Option.match(skillName, {
    onNone: () => client.namespaceExists(namespace),
    onSome: (name) => client.extensionExists({ namespace, type: "skill", name }),
  });

const resolveRegistrySource = (
  namespace: string,
  input: string,
  options: {
    readonly skillName: Option.Option<string>;
    readonly resolutionOptions: Option.Option<ResolveSkillInstallSourceOptions>;
  },
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const registrySources = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "REGISTRY_CONFIG_READ_FAILED",
          what: `Failed to read configured registry sources for namespace "${namespace}"`,
          details: [input],
          howToFix: "Check that your workspace settings file is valid and accessible",
          cause: e,
        }),
      ),
    );

    if (registrySources.length === 0) {
      return yield* makeAppError({
        code: "REGISTRY_NO_SOURCE_CONFIGURED",
        what: `No registry source is configured for namespace "${namespace}"`,
        details: [`Provided: ${input}`],
        howToFix: `Add a registry source for namespace "${namespace}" using "axm sources add"`,
      });
    }

    const checked: string[] = [];
    const issues: RegistryLookupIssue[] = [];

    // Sequential for...of + yield* with early return: first-match semantics.
    // Effect.forEach doesn't fit because we return on the first successful match
    // while accumulating errors/issues from non-matching registries.
    for (const regConfig of registrySources) {
      checked.push(regConfig.location.href);
      const client = yield* createRegistryClient(regConfig.location.href);
      const matchResult = yield* checkRegistryMatch({
        client,
        namespace,
        skillName: options.skillName,
      }).pipe(Effect.result);

      if (matchResult._tag === "Failure") {
        if (Option.isSome(options.resolutionOptions)) {
          options.resolutionOptions.value.onRegistryProbe({
            location: regConfig.location.href,
            outcome: "error",
            reason: Option.some(summarizeLookupError(matchResult.failure)),
          });
        }
        issues.push(toLookupIssue(regConfig.location, matchResult.failure));
        continue;
      }

      if (matchResult.success.exists) {
        if (Option.isSome(options.resolutionOptions)) {
          options.resolutionOptions.value.onRegistryProbe({
            location: regConfig.location.href,
            outcome: "matched",
            reason: Option.none<string>(),
          });
        }
        return {
          type: "registry" as const,
          location: regConfig.location,
          namespace: Option.some(namespace),
        } satisfies RegistrySource;
      }

      if (Option.isSome(options.resolutionOptions)) {
        options.resolutionOptions.value.onRegistryProbe({
          location: regConfig.location.href,
          outcome: "not-found",
          reason: Option.none<string>(),
        });
      }
    }

    if (Option.isSome(options.skillName)) {
      const skillName = options.skillName.value;
      return yield* makeAppError({
        code: "REGISTRY_SKILL_NOT_FOUND",
        what: `Skill "${namespace}/${skillName}" was not found in configured registries`,
        details: [
          `Provided: ${input}`,
          `Checked registries: ${checked.join(", ")}`,
          ...issues.map((issue) => `Lookup failed at ${issue.location}: ${issue.message}`),
        ],
        howToFix: registryLookupHowToFix({
          issues,
          fallback:
            "Verify the namespace/skill name, or install with an explicit source like github:owner/repo",
        }),
      });
    }

    return yield* makeAppError({
      code: "REGISTRY_NAMESPACE_NOT_FOUND",
      what: `None of the configured registry sources contain namespace "${namespace}"`,
      details: [
        `Provided: ${input}`,
        `Checked registries: ${checked.join(", ")}`,
        ...issues.map((issue) => `Lookup failed at ${issue.location}: ${issue.message}`),
      ],
      howToFix: registryLookupHowToFix({
        issues,
        fallback: `Verify the namespace name is correct, or add a registry that hosts "${namespace}"`,
      }),
    });
  });

const resolveSkillRegistrySourceByName = (
  name: string,
  input: string,
  resolutionOptions: Option.Option<ResolveSkillInstallSourceOptions>,
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    // DefaultNamespace: project settings > user settings > logged-in identity > none
    const maybeNamespace = yield* ws.getDefaultNamespace();

    if (Option.isNone(maybeNamespace)) {
      return yield* makeAppError({
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
      return yield* makeAppError({
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
    const issues: RegistryLookupIssue[] = [];
    // Sequential for...of + yield* with early return: first-match semantics.
    // Effect.forEach doesn't fit because we return on the first successful match
    // while accumulating errors/issues from non-matching registries.
    for (const reg of registryHosts) {
      checked.push(reg.location.href);
      const client = yield* createRegistryClient(reg.location.href);
      const existsResult = yield* client
        .extensionExists({ namespace, type: "skill", name })
        .pipe(Effect.result);
      if (existsResult._tag === "Failure") {
        if (Option.isSome(resolutionOptions)) {
          resolutionOptions.value.onRegistryProbe({
            location: reg.location.href,
            outcome: "error",
            reason: Option.some(summarizeLookupError(existsResult.failure)),
          });
        }
        issues.push(toLookupIssue(reg.location, existsResult.failure));
        continue;
      }

      if (existsResult.success.exists) {
        if (Option.isSome(resolutionOptions)) {
          resolutionOptions.value.onRegistryProbe({
            location: reg.location.href,
            outcome: "matched",
            reason: Option.none<string>(),
          });
        }
        return {
          type: "registry" as const,
          location: reg.location,
          namespace: Option.some(namespace),
        } satisfies RegistrySource;
      }

      if (Option.isSome(resolutionOptions)) {
        resolutionOptions.value.onRegistryProbe({
          location: reg.location.href,
          outcome: "not-found",
          reason: Option.none<string>(),
        });
      }
    }

    return yield* makeAppError({
      code: "REGISTRY_SKILL_NOT_FOUND",
      what: `Skill "${namespace}/${name}" was not found in configured registries`,
      details: [
        `Provided: ${input}`,
        `Default namespace: ${namespace}`,
        `Checked registries: ${checked.join(", ")}`,
        ...issues.map((issue) => `Lookup failed at ${issue.location}: ${issue.message}`),
      ],
      howToFix: registryLookupHowToFix({
        issues,
        fallback:
          "Verify the skill name, or install with an explicit source like github:owner/repo or @namespace/skills/name",
      }),
    });
  });

const resolveSkillRegistrySource = (
  pattern: Extract<InputPattern, { readonly pattern: "registry-pattern-input" }>,
  input: string,
  resolutionOptions: Option.Option<ResolveSkillInstallSourceOptions>,
) =>
  Effect.gen(function* () {
    if (Option.isSome(pattern.type) && pattern.type.value !== "skills") {
      return yield* makeAppError({
        code: "SKILL_INSTALL_WRONG_TYPE",
        what: `Cannot install "${pattern.type.value}" extensions with "skills install"`,
        details: [pattern.namespace],
        howToFix: `Use the "${pattern.type.value}" command instead, or remove the type qualifier to install as a skill`,
      });
    }

    return yield* resolveRegistrySource(pattern.namespace, input, {
      skillName: pattern.name,
      resolutionOptions,
    });
  });

export const resolveSkillUrl = (url: URL, input: string) => routeUrlInput(url, input);

export const resolveSkillInstallSource = (
  parseResult: InputParseResult,
  options?: ResolveSkillInstallSourceOptions,
) =>
  Effect.gen(function* () {
    const resolutionOptions = Option.fromUndefinedOr(options);
    const pattern = parseResult.pattern;
    switch (pattern.pattern) {
      case "registry-pattern-input":
        return yield* resolveSkillRegistrySource(
          pattern,
          parseResult.originalInput,
          resolutionOptions,
        );
      case "shorthand-input":
        return yield* resolveShorthandInputSource({
          pattern,
          originalInput: parseResult.originalInput,
        });
      case "slash-pattern":
        return yield* resolveSlashInputSource(pattern, parseResult.originalInput);
      case "name-input":
        return yield* resolveSkillRegistrySourceByName(
          pattern.name,
          parseResult.originalInput,
          resolutionOptions,
        );
      case "url-input":
        return yield* resolveSkillUrl(pattern.url, parseResult.originalInput);
      case "file-path-pattern":
        return { type: "local" as const, path: pattern.path };
      // Unsupported:
      case "git-scp-address":
      case "glob-input":
        return yield* makeAppError({
          code: "SKILL_INSTALL_UNSUPPORTED_INPUT",
          what: `Input pattern "${pattern.pattern}" is not supported for skill installation`,
          details: [parseResult.originalInput],
          howToFix:
            "Use a registry reference (e.g., @namespace/skill-name), a URL, or a shorthand (owner/repo) instead",
        });
    }
  });
