import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import {
  type ExtensionName,
  type ExtensionType,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import { createRegistryClient } from "@agentxm/registry-client";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import { resolveIdentifier } from "@agentxm/extension-management/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ADD_REGISTRY_SOURCE } from "../suggested-actions.js";
import { makeRegistryLoginSuggestionResolver } from "./registry-login-suggestion.js";

export type InstallableRegistryType = Extract<ExtensionType, "skill" | "subagent">;

export interface RegistryLookupProbe {
  readonly location: string;
  readonly outcome: "matched" | "not-found" | "error";
  readonly reason: Option.Option<string>;
}

export interface RegistryResolutionOptions {
  readonly onRegistryProbe: (probe: RegistryLookupProbe) => void;
}

interface RegistryLookupIssue {
  readonly code: Option.Option<string>;
}

const isAppError = (error: unknown): error is AppError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "AppError" &&
  "detail" in error &&
  "code" in error;

const summarizeLookupError = (error: unknown): string => {
  if (isAppError(error)) return `${error.detail} (${error.code})`;
  if (error instanceof Error) return error.message;
  return String(error);
};

const toLookupIssue = (error: unknown): RegistryLookupIssue => ({
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

const extensionLabel = (type: InstallableRegistryType): string =>
  type === "skill" ? "Skill" : "Subagent";

const qualifiedExtension = (type: InstallableRegistryType, owner: Handle, name: string): string =>
  `${owner}/${type === "skill" ? "skills" : "subagents"}/${name}`;

const explicitSourceSuggestion = (type: InstallableRegistryType): string =>
  `Verify the owner/${type} name, or install with an explicit source like github:owner/repo`;

const registryLookupHowToFix = (
  issues: ReadonlyArray<RegistryLookupIssue>,
  fallback: string,
): string =>
  hasRemoteNotSupportedIssue(issues)
    ? "Remote registry discovery is not yet supported for HTTP(S) sources. Use a file:// registry source, or install from github:owner/repo."
    : fallback;

export const formatRegistryProbe = (probe: RegistryLookupProbe): string => {
  switch (probe.outcome) {
    case "matched":
      return `${probe.location}: matched`;
    case "not-found":
      return `${probe.location}: no match`;
    case "error":
      return Option.match(probe.reason, {
        onNone: () => `${probe.location}: error`,
        onSome: (reason) => `${probe.location}: ${reason}`,
      });
  }
};

export const resolveConfiguredRegistrySource = ({
  sourceName,
  owner,
  extensionType,
  extensionName,
  options,
}: {
  readonly sourceName: string;
  readonly owner: Handle;
  readonly extensionType: InstallableRegistryType;
  readonly extensionName: Option.Option<ExtensionName>;
  readonly options: Option.Option<RegistryResolutionOptions>;
}) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const loginSuggestionsFor = yield* makeRegistryLoginSuggestionResolver;
    const registrySources = (yield* workspace.getRegistrySourceHosts().pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read configured registry sources for owner "${owner}"`,
          recover: "Check that your workspace settings file is valid and accessible",
          cause: error,
        }),
      ),
    )).filter((source) => source.name === sourceName);

    if (registrySources.length === 0) {
      return yield* makeAppError({
        code: "not_found",
        detail: `No registry source is configured for owner "${owner}"`,
        recover: `Add a registry source for owner "${owner}"`,
        cmd: ADD_REGISTRY_SOURCE.cmd,
      });
    }

    const issues: RegistryLookupIssue[] = [];
    for (const registrySource of registrySources) {
      const client = yield* createRegistryClient(registrySource.location.href);
      const matchResult = yield* Option.match(extensionName, {
        onNone: () => client.ownerExists(owner),
        onSome: (name) => client.extensionExists({ owner, type: extensionType, name }),
      }).pipe(Effect.result);

      if (matchResult._tag === "Failure") {
        if (Option.isSome(options)) {
          options.value.onRegistryProbe({
            location: registrySource.location.href,
            outcome: "error",
            reason: Option.some(summarizeLookupError(matchResult.failure)),
          });
        }
        issues.push(toLookupIssue(matchResult.failure));
        continue;
      }

      if (matchResult.success.exists) {
        if (Option.isSome(options)) {
          options.value.onRegistryProbe({
            location: registrySource.location.href,
            outcome: "matched",
            reason: Option.none<string>(),
          });
        }
        return {
          type: "registry" as const,
          name: registrySource.name,
          location: registrySource.location,
          owner: Option.some(owner),
        } satisfies RegistrySource;
      }

      if (Option.isSome(options)) {
        options.value.onRegistryProbe({
          location: registrySource.location.href,
          outcome: "not-found",
          reason: Option.none<string>(),
        });
      }
    }

    const loginSuggestions = yield* loginSuggestionsFor(
      registrySources.map((source) => source.location.href),
    );
    if (Option.isSome(extensionName)) {
      return yield* makeAppError({
        code: "not_found",
        detail: `${extensionLabel(extensionType)} "${qualifiedExtension(extensionType, owner, extensionName.value)}" was not found in configured registries`,
        recover: registryLookupHowToFix(issues, explicitSourceSuggestion(extensionType)),
        suggestions: loginSuggestions,
      });
    }

    return yield* makeAppError({
      code: "not_found",
      detail: `None of the configured registry sources contain owner "${owner}"`,
      recover: registryLookupHowToFix(
        issues,
        `Verify the owner name is correct, or add a registry that hosts "${owner}"`,
      ),
      suggestions: loginSuggestions,
    });
  });

export const resolveDefaultRegistrySourceByName = ({
  name,
  extensionType,
  options,
}: {
  readonly name: string;
  readonly extensionType: InstallableRegistryType;
  readonly options: Option.Option<RegistryResolutionOptions>;
}) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const loginSuggestionsFor = yield* makeRegistryLoginSuggestionResolver;
    const registryHosts = (yield* workspace.getRegistrySourceHosts()).filter(
      (source) => source.name === "agentxm",
    );
    const label = extensionLabel(extensionType);

    if (registryHosts.length === 0) {
      return yield* makeAppError({
        code: "not_found",
        detail: `${label} "${name}" could not be looked up (no registry sources)`,
        suggestions: [ADD_REGISTRY_SOURCE],
      });
    }

    const maybeOwner = yield* workspace.getConfiguredOwner();
    const loginSuggestions = yield* loginSuggestionsFor(
      registryHosts.map((source) => source.location.href),
    );
    const resolved = yield* Effect.scoped(
      resolveIdentifier({
        input: name,
        resourceType: extensionType,
        scope: "registry",
        registrySourceName: "agentxm",
      }),
    ).pipe(
      Effect.mapError((error) => {
        if (error.code !== "not_found") return error;
        const detail = Option.match(maybeOwner, {
          onNone: () => `${label} "${name}" could not be looked up (no default owner)`,
          onSome: (owner) =>
            `${label} "${qualifiedExtension(extensionType, owner, name)}" was not found in configured registries`,
        });
        return makeAppError({
          code: "not_found",
          detail,
          suggestions: [
            { description: explicitSourceSuggestion(extensionType) },
            ...loginSuggestions,
          ],
          cause: error,
        });
      }),
    );
    const resolvedOwner = Option.getOrUndefined(resolved.owner);
    if (resolvedOwner === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `${label} "${name}" was not found in configured registries`,
        suggestions: [
          { description: explicitSourceSuggestion(extensionType) },
          ...loginSuggestions,
        ],
      });
    }

    const defaultRegistry = registryHosts[0];
    if (defaultRegistry === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `${label} "${name}" could not be looked up (no registry sources)`,
      });
    }

    if (Option.isSome(options)) {
      options.value.onRegistryProbe({
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
      name: defaultRegistry.name,
      location: Option.getOrElse(resolved.registryLocation, () => defaultRegistry.location),
      owner: Option.some(resolvedOwner),
    } satisfies RegistrySource;
  });
