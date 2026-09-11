/**
 * Which configured registry supplies a skill or subagent named without one.
 *
 * A bare name or an unqualified `@owner/name` says nothing about which
 * registry hosts it, so every configured host is probed in order and the
 * first that answers wins. Each probe is recorded so the application can
 * show, verbatim, which registries were consulted and what each one said.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type {
  ExtensionName,
  ExtensionType,
  Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import { createRegistryClient } from "@agentxm/registry-client";
import {
  resolveIdentifier,
  sourceResolutionFailureCategory,
  type SourceResolutionFailure,
} from "@agentxm/extension-sources";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { WorkspaceMutations } from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../errors.js";
import { registryLoginSuggestions } from "./registry-login-suggestion.js";
import { installRefused, type ResolveInstallRequirements } from "./vocabulary.js";

/** How to declare a registry when none is configured for the requested owner. */
export const ADD_REGISTRY_SOURCE: SuggestedAction = {
  description: "Add a registry under `sources` in workspace settings",
  cmd: "axm help settings",
};

/** The two types whose bare names are resolved against configured registries. */
export type InstallableRegistryType = Extract<ExtensionType, "skill" | "subagent">;

/** What one configured registry host answered when it was consulted. */
export interface RegistryLookupProbe {
  readonly location: string;
  readonly outcome: "matched" | "not-found" | "error";
  readonly reason: Option.Option<string>;
}

export interface RegistryResolutionOptions {
  readonly onRegistryProbe: (probe: RegistryLookupProbe) => void;
}

/** The sentence a source-resolution failure carries, for probe evidence. */
export const sourceFailureDetail = (error: SourceResolutionFailure): string => {
  switch (error._tag) {
    case "SourceSyntaxInvalid":
    case "SourceHostNotConfigured":
    case "SourceNotResolvable":
    case "SourceNetworkFailure":
    case "GitOperationFailed":
    case "WorkspaceCatalogUnavailable":
    case "AxmSkillGateUnavailable":
      return error.detail;
    case "RegistryProblem":
      return error.detail ?? error.title ?? error.category;
    case "RegistryRequestFailed":
    case "RegistryOperationFailed":
      return error.detail;
  }
};

const summarizeLookupFailure = (error: SourceResolutionFailure): string =>
  `${sourceFailureDetail(error)} (${sourceResolutionFailureCategory(error)})`;

const extensionLabel = (type: InstallableRegistryType): string =>
  type === "skill" ? "Skill" : "Subagent";

const qualifiedExtension = (type: InstallableRegistryType, owner: Handle, name: string): string =>
  `${owner}/${type === "skill" ? "skills" : "subagents"}/${name}`;

const explicitSourceSuggestion = (type: InstallableRegistryType): string =>
  `Verify the owner/${type} name, or install with an explicit source like github:owner/repo`;

/** Render one probe as the line the application prints under `--verbose`. */
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

/** Which configured registry to probe, for which extension. */
export interface ConfiguredRegistryLookup {
  readonly sourceName: string;
  readonly owner: Handle;
  readonly extensionType: InstallableRegistryType;
  readonly extensionName: Option.Option<ExtensionName>;
  readonly options: Option.Option<RegistryResolutionOptions>;
}

/** Probe every host configured under `sourceName` for the named extension. */
export const resolveConfiguredRegistrySource: (
  args: ConfiguredRegistryLookup,
) => Effect.Effect<RegistrySource, ExtensionLifecycleFailed, ResolveInstallRequirements> =
  Effect.fn("InstallExtensions.resolveConfiguredRegistrySource")(function* (
    args: ConfiguredRegistryLookup,
  ) {
    const workspace = yield* WorkspaceMutations;
    const registrySources = (yield* workspace.getRegistrySourceHosts().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: `Failed to read configured registry sources for owner "${args.owner}"`,
          recover: "Check that your workspace settings file is valid and accessible",
          cause,
        }),
      ),
    )).filter((source) => source.name === args.sourceName);

    if (registrySources.length === 0) {
      return yield* installRefused({
        category: "not_found",
        detail: `No registry source is configured for owner "${args.owner}"`,
        recover: `Add a registry source for owner "${args.owner}"`,
        ...(ADD_REGISTRY_SOURCE.cmd === undefined ? {} : { cmd: ADD_REGISTRY_SOURCE.cmd }),
      });
    }

    for (const registrySource of registrySources) {
      const client = yield* createRegistryClient(registrySource.location.href).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "network",
            detail: `Registry ${registrySource.location.href} could not be reached`,
            cause,
          }),
        ),
      );
      const matchResult = yield* Option.match(args.extensionName, {
        onNone: () => client.ownerExists(args.owner),
        onSome: (name) =>
          client.extensionExists({ owner: args.owner, type: args.extensionType, name }),
      }).pipe(Effect.result);

      if (matchResult._tag === "Failure") {
        if (Option.isSome(args.options)) {
          args.options.value.onRegistryProbe({
            location: registrySource.location.href,
            outcome: "error",
            reason: Option.some(summarizeLookupFailure(matchResult.failure)),
          });
        }
        continue;
      }

      if (matchResult.success.exists) {
        if (Option.isSome(args.options)) {
          args.options.value.onRegistryProbe({
            location: registrySource.location.href,
            outcome: "matched",
            reason: Option.none<string>(),
          });
        }
        return {
          type: "registry" as const,
          name: registrySource.name,
          location: registrySource.location,
          owner: Option.some(args.owner),
        } satisfies RegistrySource;
      }

      if (Option.isSome(args.options)) {
        args.options.value.onRegistryProbe({
          location: registrySource.location.href,
          outcome: "not-found",
          reason: Option.none<string>(),
        });
      }
    }

    const loginSuggestions = yield* registryLoginSuggestions(
      registrySources.map((source) => source.location.href),
    );
    if (Option.isSome(args.extensionName)) {
      return yield* installRefused({
        category: "not_found",
        detail: `${extensionLabel(args.extensionType)} "${qualifiedExtension(args.extensionType, args.owner, args.extensionName.value)}" was not found in configured registries`,
        recover: explicitSourceSuggestion(args.extensionType),
        suggestions: loginSuggestions,
      });
    }

    return yield* installRefused({
      category: "not_found",
      detail: `None of the configured registry sources contain owner "${args.owner}"`,
      recover: `Verify the owner name is correct, or add a registry that hosts "${args.owner}"`,
      suggestions: loginSuggestions,
    });
  });

/** Which bare name to resolve against the default registry. */
export interface DefaultRegistryLookup {
  readonly name: string;
  readonly extensionType: InstallableRegistryType;
  readonly options: Option.Option<RegistryResolutionOptions>;
}

/** Resolve a bare name against the default `agentxm` registry and configured owner. */
export const resolveDefaultRegistrySourceByName: (
  args: DefaultRegistryLookup,
) => Effect.Effect<RegistrySource, ExtensionLifecycleFailed, ResolveInstallRequirements> =
  Effect.fn("InstallExtensions.resolveDefaultRegistrySourceByName")(function* (
    args: DefaultRegistryLookup,
  ) {
    const workspace = yield* WorkspaceMutations;
    const label = extensionLabel(args.extensionType);
    const registryHosts = (yield* workspace.getRegistrySourceHosts().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Configured registry sources could not be read",
          cause,
        }),
      ),
    )).filter((source) => source.name === "agentxm");

    if (registryHosts.length === 0) {
      return yield* installRefused({
        category: "not_found",
        detail: `${label} "${args.name}" could not be looked up (no registry sources)`,
        suggestions: [ADD_REGISTRY_SOURCE],
      });
    }

    const maybeOwner = yield* workspace.getConfiguredOwner().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Configured workspace owner could not be read",
          cause,
        }),
      ),
    );
    const loginSuggestions = yield* registryLoginSuggestions(
      registryHosts.map((source) => source.location.href),
    );
    const resolved = yield* Effect.scoped(
      resolveIdentifier({
        input: args.name,
        resourceType: args.extensionType,
        scope: "registry",
        registrySourceName: "agentxm",
      }),
    ).pipe(
      Effect.mapError((failure) => {
        if (sourceResolutionFailureCategory(failure) !== "not_found") {
          return installRefused({
            category: "network",
            detail: sourceFailureDetail(failure),
            cause: failure,
          });
        }
        const detail = Option.match(maybeOwner, {
          onNone: () => `${label} "${args.name}" could not be looked up (no default owner)`,
          onSome: (owner) =>
            `${label} "${qualifiedExtension(args.extensionType, owner, args.name)}" was not found in configured registries`,
        });
        return installRefused({
          category: "not_found",
          detail,
          suggestions: [
            { description: explicitSourceSuggestion(args.extensionType) },
            ...loginSuggestions,
          ],
          cause: failure,
        });
      }),
    );
    const resolvedOwner = Option.getOrUndefined(resolved.owner);
    if (resolvedOwner === undefined) {
      return yield* installRefused({
        category: "not_found",
        detail: `${label} "${args.name}" was not found in configured registries`,
        suggestions: [
          { description: explicitSourceSuggestion(args.extensionType) },
          ...loginSuggestions,
        ],
      });
    }

    const defaultRegistry = registryHosts[0];
    if (defaultRegistry === undefined) {
      return yield* installRefused({
        category: "not_found",
        detail: `${label} "${args.name}" could not be looked up (no registry sources)`,
      });
    }

    if (Option.isSome(args.options)) {
      args.options.value.onRegistryProbe({
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
