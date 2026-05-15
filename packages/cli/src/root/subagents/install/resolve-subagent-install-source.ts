import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { type ExtensionName, type Handle } from "@agentxm/client-core/unstable/extensions";
import { createRegistryClient, type RegistryClient } from "@agentxm/client-core/unstable/registry";
import type {
  InputParseResult,
  InputPattern,
  RegistrySource,
} from "@agentxm/client-core/unstable/sources";
import {
  resolveShorthandInputSource,
  resolveIdentifier,
  resolveSlashInputSource,
  routeUrlInput,
} from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

export type RegistryLookupProbe = {
  readonly location: string;
  readonly outcome: "matched" | "not-found" | "error";
  readonly reason: Option.Option<string>;
};

type ResolveSubagentInstallSourceOptions = {
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
  "detail" in error &&
  "code" in error;

const summarizeLookupError = (error: unknown): string => {
  if (isAppError(error)) {
    return `${error.detail} (${error.code})`;
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
  owner,
  subagentName,
}: {
  readonly client: RegistryClient;
  readonly owner: Handle;
  readonly subagentName: Option.Option<ExtensionName>;
}) =>
  Option.match(subagentName, {
    onNone: () => client.ownerExists(owner),
    onSome: (name) => client.extensionExists({ owner, type: "subagent", name }),
  });

const resolveRegistrySource = (
  owner: Handle,
  input: string,
  options: {
    readonly subagentName: Option.Option<ExtensionName>;
    readonly resolutionOptions: Option.Option<ResolveSubagentInstallSourceOptions>;
  },
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const registrySources = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read configured registry sources for owner "${owner}"`,
          suggestions: [
            {
              description: "Check that your workspace settings file is valid and accessible",
            },
          ],
          cause: e,
        }),
      ),
    );

    if (registrySources.length === 0) {
      return yield* makeAppError({
        code: "internal",
        detail: `No registry source is configured for owner "${owner}"`,
        suggestions: [
          {
            description: `Add a registry source for owner "${owner}" using "axm sources add"`,
            cmd: "axm sources add",
          },
        ],
      });
    }

    const issues: RegistryLookupIssue[] = [];

    // Sequential for...of + yield* with early return: first-match semantics.
    for (const regConfig of registrySources) {
      const client = yield* createRegistryClient(regConfig.location.href);
      const matchResult = yield* checkRegistryMatch({
        client,
        owner,
        subagentName: options.subagentName,
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
          owner: Option.some(owner),
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

    if (Option.isSome(options.subagentName)) {
      const subagentName = options.subagentName.value;
      return yield* makeAppError({
        code: "not_found",
        detail: `Subagent "${owner}/${subagentName}" was not found in configured registries`,
        suggestions: [
          {
            description: registryLookupHowToFix({
              issues,
              fallback:
                "Verify the owner/subagent name, or install with an explicit source like github:owner/repo",
            }),
          },
        ],
      });
    }

    return yield* makeAppError({
      code: "not_found",
      detail: `None of the configured registry sources contain owner "${owner}"`,
      suggestions: [
        {
          description: registryLookupHowToFix({
            issues,
            fallback: `Verify the owner name is correct, or add a registry that hosts "${owner}"`,
          }),
        },
      ],
    });
  });

const resolveSubagentRegistrySourceByName = (
  name: string,
  input: string,
  resolutionOptions: Option.Option<ResolveSubagentInstallSourceOptions>,
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const registryHosts = yield* ws.getRegistrySourceHosts();

    if (registryHosts.length === 0) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Subagent "${name}" could not be looked up (no registry sources)`,
        suggestions: [
          {
            description:
              "Configure a registry source in settings.json, or install with an explicit source like github:owner/repo",
          },
        ],
      });
    }
    const maybeProfile = yield* ws.getConfiguredOwner();

    const resolved = yield* Effect.scoped(
      resolveIdentifier({
        input: name,
        resourceType: "subagent",
        scope: "registry",
      }),
    ).pipe(
      Effect.mapError((error) => {
        if (error.code !== "not_found") return error;
        const label = Option.match(maybeProfile, {
          onNone: () => name,
          onSome: (owner) => `${owner}/${name}`,
        });
        return makeAppError({
          code: "not_found",
          detail: Option.isNone(maybeProfile)
            ? `Subagent "${name}" could not be looked up (no default owner)`
            : `Subagent "${label}" was not found in configured registries`,
          suggestions: [
            {
              description:
                "Verify the subagent name, or install with an explicit source like github:owner/repo or @owner/subagents/name",
            },
          ],
          cause: error,
        });
      }),
    );
    const resolvedOwner = Option.getOrUndefined(resolved.owner);
    if (resolvedOwner === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Subagent "${name}" was not found in configured registries`,
        suggestions: [
          {
            description:
              "Verify the subagent name, or install with an explicit source like github:owner/repo or @owner/subagents/name",
          },
        ],
      });
    }

    const defaultRegistry = registryHosts[0];
    if (defaultRegistry === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Subagent "${name}" could not be looked up (no registry sources)`,
      });
    }

    if (Option.isSome(resolutionOptions)) {
      resolutionOptions.value.onRegistryProbe({
        location: Option.getOrElse(
          Option.map(resolved.registryLocation, (location) => location.href),
          () => defaultRegistry.location.href,
        ),
        outcome: "matched",
        reason: Option.none<string>(),
      });
    }

    return {
      type: "registry" as const,
      location: Option.getOrElse(resolved.registryLocation, () => defaultRegistry.location),
      owner: Option.some(resolvedOwner),
    } satisfies RegistrySource;
  });

const resolveSubagentRegistrySource = (
  pattern: Extract<InputPattern, { readonly pattern: "registry-pattern-input" }>,
  input: string,
  resolutionOptions: Option.Option<ResolveSubagentInstallSourceOptions>,
) =>
  Effect.gen(function* () {
    if (Option.isSome(pattern.type) && pattern.type.value !== "subagents") {
      return yield* makeAppError({
        code: "internal",
        detail: `Cannot install "${pattern.type.value}" extensions with "subagents install"`,
        suggestions: [
          {
            description: `Use the "${pattern.type.value}" command instead, or remove the type qualifier to install as a subagent`,
          },
        ],
      });
    }

    return yield* resolveRegistrySource(pattern.owner, input, {
      subagentName: pattern.name,
      resolutionOptions,
    });
  });

export const resolveSubagentUrl = (url: URL, input: string) => routeUrlInput(url, input);

export const resolveSubagentInstallSource = (
  parseResult: InputParseResult,
  options?: ResolveSubagentInstallSourceOptions,
) =>
  Effect.gen(function* () {
    const resolutionOptions = Option.fromUndefinedOr(options);
    const pattern = parseResult.pattern;
    switch (pattern.pattern) {
      case "registry-pattern-input":
        return yield* resolveSubagentRegistrySource(
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
        return yield* resolveSubagentRegistrySourceByName(
          pattern.name,
          parseResult.originalInput,
          resolutionOptions,
        );
      case "url-input":
        return yield* resolveSubagentUrl(pattern.url, parseResult.originalInput);
      case "file-path-pattern":
        return { type: "local" as const, path: pattern.path };
      // Unsupported:
      case "git-scp-address":
      case "glob-input":
        return yield* makeAppError({
          code: "internal",
          detail: `Input pattern "${pattern.pattern}" is not supported for subagent installation`,
          suggestions: [
            {
              description:
                "Use a registry reference (e.g., @owner/subagents/name), a URL, or a shorthand (owner/repo) instead",
            },
          ],
        });
    }
  });
