/**
 * Installing subagents.
 *
 * A subagent is rendered into each configured agent's own subagents
 * directory, so a user-scope workspace can only hold one when every
 * configured agent has a user-scope placement to render into.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  NO_MATERIALIZATION_OBSERVATION,
  SubagentManager,
  buildInstallOperation,
  type SubagentMaterializationFacts,
} from "@agentxm/extension-materialization";
import type { Handle } from "@agentxm/extension-model/unstable/extensions";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import {
  parseInputPattern,
  type InputParseResult,
} from "@agentxm/extension-model/unstable/sources/parser";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import {
  SourceHostProviders,
  sourceResolutionFailureCategory,
  type SourceResolutionFailure,
} from "@agentxm/extension-sources";
import {
  operationPresentation,
  type JobStepArtifact,
  type Plan,
} from "@agentxm/workspace-operations";
import { CodingAgentRepository } from "@agentxm/workspace-projection";
import { WorkspaceMutations } from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import {
  sourceFailureDetail,
  type RegistryLookupProbe,
} from "../../install/registry-source-resolution.js";
import {
  ExtensionSelectionInteraction,
  type ExtensionSelectionCancelled,
} from "../../install/selection-interaction.js";
import {
  installRefused,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
  type SubagentInstallIntent,
} from "../../install/vocabulary.js";
import { determineSubagentsToInstall } from "./selection.js";
import { resolveSubagentInstallSource } from "./source.js";

/** A subagent source after grammar parsing, before anything is discovered. */
export interface ParsedSubagentInstallRequest {
  readonly source: Source;
  readonly versionRange: Option.Option<VersionRange>;
  readonly requestedSubagents: ReadonlyArray<string>;
  readonly requestedOwner: Option.Option<Handle>;
  /** Which configured registry hosts were consulted, and what each answered. */
  readonly resolutionProbes: ReadonlyArray<RegistryLookupProbe>;
  readonly all: boolean;
  readonly nonInteractive: boolean;
}

const isRemoteReadNotImplemented = (error: SourceResolutionFailure): boolean =>
  sourceFailureDetail(error).includes("not implemented");

const discoverHowToFix = (source: Source, error: SourceResolutionFailure): string => {
  if (source.type === "registry") {
    if (isRemoteReadNotImplemented(error)) {
      return "Remote registry discovery is not yet supported for HTTP(S) sources. Use a file:// registry source, or install from github:owner/repo.";
    }
    return "Verify the configured registry is reachable and contains the requested owner/subagent.";
  }
  if (source.type === "local") {
    return "Verify the source path contains subagent directories with <name>.md files.";
  }
  return "Verify the source is reachable and contains valid subagent directories.";
};

const noSubagentsFoundHowToFix = (source: Source): string => {
  if (source.type === "registry") {
    return "Verify the owner and subagent name exist in the configured registry.";
  }
  if (source.type === "local") {
    return "Verify the source path contains subagent directories with <name>.md files.";
  }
  return "Verify the source contains subagent directories with <name>.md files.";
};

const extractRequestedSubagents = (
  argSubagents: ReadonlyArray<string>,
  parsedSource: InputParseResult,
): ReadonlyArray<string> =>
  argSubagents.length > 0
    ? argSubagents
    : parsedSource.pattern.pattern === "name-input"
      ? [parsedSource.pattern.name]
      : parsedSource.pattern.pattern === "registry-pattern-input"
        ? Option.isSome(parsedSource.pattern.name)
          ? [parsedSource.pattern.name.value]
          : []
        : [];

const extractRequestedOwner = (
  parsedSource: InputParseResult,
  source: Source,
): Option.Option<Handle> =>
  parsedSource.pattern.pattern === "registry-pattern-input"
    ? Option.some(parsedSource.pattern.owner)
    : source.type === "registry"
      ? source.owner
      : Option.none<Handle>();

const previousResolvedVersion = (entry: unknown): string | undefined => {
  if (typeof entry !== "object" || entry === null) return undefined;
  if (!("type" in entry) || entry.type !== "registry") return undefined;
  if (!("resolvedVersion" in entry) || typeof entry.resolvedVersion !== "string") return undefined;
  return entry.resolvedVersion;
};

const previousContentIdentity = (entry: unknown): string | undefined => {
  if (typeof entry !== "object" || entry === null) return undefined;
  if (!("contentIdentity" in entry) || typeof entry.contentIdentity !== "string") return undefined;
  return entry.contentIdentity;
};

const artifactChange = (args: {
  readonly installedBefore: boolean;
  readonly previousVersion: string | undefined;
  readonly version: string | undefined;
  readonly previousSourceHash: string | undefined;
  readonly sourceHash: string | undefined;
}): JobStepArtifact["change"] => {
  if (!args.installedBefore) return "created";
  const sameVersion = args.previousVersion === args.version;
  const sameSource =
    args.previousSourceHash === undefined ||
    args.sourceHash === undefined ||
    args.previousSourceHash === args.sourceHash;
  return sameVersion && sameSource ? "unchanged" : "updated";
};

/** What a subagent install command supplies before anything is parsed. */
export interface SubagentInstallArgs {
  readonly source: string;
  readonly subagents: ReadonlyArray<string>;
  readonly all: boolean;
  readonly nonInteractive: boolean;
}

/** Read the subagent source grammar and route it to the source that serves it. */
export const parseSubagentInstallRequest: (
  args: SubagentInstallArgs,
) => Effect.Effect<
  ParsedSubagentInstallRequest,
  ExtensionLifecycleFailed | SourceResolutionFailure,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.parseSubagentRequest")(function* (args: SubagentInstallArgs) {
  const parsedSourceOption = parseInputPattern(args.source.trim());
  if (Option.isNone(parsedSourceOption)) {
    return yield* installRefused({
      category: "validation",
      detail: "Invalid source: Unable to parse source",
      suggestions: [
        {
          description:
            "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
        },
      ],
    });
  }

  const parsedSource = parsedSourceOption.value;
  const versionRange =
    parsedSource.pattern.pattern === "registry-pattern-input"
      ? parsedSource.pattern.versionRange
      : Option.none<VersionRange>();

  const resolutionProbes: Array<RegistryLookupProbe> = [];
  const source = yield* resolveSubagentInstallSource(parsedSource, {
    onRegistryProbe: (probe) => {
      resolutionProbes.push(probe);
    },
  });

  return {
    source,
    versionRange,
    requestedSubagents: extractRequestedSubagents(args.subagents, parsedSource),
    requestedOwner: extractRequestedOwner(parsedSource, source),
    resolutionProbes,
    all: args.all,
    nonInteractive: args.nonInteractive,
  } satisfies ParsedSubagentInstallRequest;
});

/** Discover the subagents the parsed source offers, or refuse when it has none. */
export const discoverSubagentRefs: (
  request: ParsedSubagentInstallRequest,
) => Effect.Effect<
  ReadonlyArray<SubagentExtensionRef>,
  ExtensionLifecycleFailed,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.discoverSubagents")(function* (
  request: ParsedSubagentInstallRequest,
) {
  const sources = yield* SourceHostProviders;
  const discovered = yield* sources
    .find(request.source, {
      names: request.requestedSubagents,
      type: "subagent" as const,
      owner: request.requestedOwner,
      versionRange: request.versionRange,
    })
    .pipe(
      Effect.map(Array.filter((ref): ref is SubagentExtensionRef => ref.type === "subagent")),
      Effect.mapError((cause) =>
        installRefused({
          category: sourceResolutionFailureCategory(cause) === "not_found" ? "not_found" : "usage",
          detail: "Failed to discover subagents from source",
          suggestions: [{ description: discoverHowToFix(request.source, cause) }],
          cause,
        }),
      ),
    );
  if (Array.isReadonlyArrayEmpty(discovered)) {
    return yield* installRefused({
      category: "not_found",
      detail: "No subagents found in source",
      suggestions: [{ description: noSubagentsFoundHowToFix(request.source) }],
    });
  }
  return discovered;
});

/** Settle which of the discovered subagents this request installs. */
export const finalizeSubagentInstallIntent: (
  request: ParsedSubagentInstallRequest,
  discovered: ReadonlyArray<SubagentExtensionRef>,
) => Effect.Effect<
  SubagentInstallIntent,
  ExtensionLifecycleFailed | ExtensionSelectionCancelled,
  ExtensionSelectionInteraction
> = Effect.fn("InstallExtensions.finalizeSubagentIntent")(function* (
  request: ParsedSubagentInstallRequest,
  discovered: ReadonlyArray<SubagentExtensionRef>,
) {
  const [first, ...rest] = discovered;
  if (first === undefined) {
    return yield* installRefused({
      category: "not_found",
      detail: "No subagents found in source",
    });
  }
  const candidates: Array.NonEmptyReadonlyArray<SubagentExtensionRef> = [first, ...rest];
  const selected = yield* determineSubagentsToInstall(candidates, {
    requestedSubagents: request.requestedSubagents,
    all: request.all,
    nonInteractive: request.nonInteractive,
  });

  if (Array.isReadonlyArrayEmpty(selected)) {
    return { subagentsToInstall: [] } satisfies SubagentInstallIntent;
  }

  return {
    subagentsToInstall: selected.map((ref) => ({
      ref,
      versionRange: ref.refType === "registry" ? request.versionRange : Option.none<VersionRange>(),
    })),
  } satisfies SubagentInstallIntent;
});

/** The closures a settled subagent intent becomes. */
export const planSubagentInstall: (
  intent: SubagentInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | SubagentManager
> = Effect.fn("InstallExtensions.planSubagents")(function* (intent: SubagentInstallIntent) {
  const ws = yield* WorkspaceMutations;
  const subagentManager = yield* SubagentManager;
  const agentRepo = yield* CodingAgentRepository;

  // A user-scope workspace can only hold subagents when every configured
  // agent has a user-scope placement to render them into.
  if (ws.scope === "user") {
    const agents = yield* agentRepo.getConfiguredAgents().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Configured agents could not be read",
          cause,
        }),
      ),
    );
    const placements = yield* Effect.forEach(
      agents,
      (agent) =>
        agent
          .resolveEffectiveSubagentsDir({ workspaceRoot: ws.baseDir, scope: ws.scope })
          .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
      { concurrency: "unbounded" },
    ).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Configured subagent placement could not be resolved",
          cause,
        }),
      ),
    );
    const refused = placements.flatMap(({ agentId, outcome }) =>
      outcome._tag === "unsupported" ||
      outcome._tag === "misconfigured" ||
      outcome._tag === "disabled"
        ? [`${agentId}: ${outcome.reason}`]
        : [],
    );
    if (refused.length > 0) {
      return yield* installRefused({
        category: "validation",
        detail: `Cannot install subagents in user scope for the configured agent placement: ${refused.join("; ")}`,
      });
    }
  }

  const steps = yield* Effect.forEach(
    intent.subagentsToInstall,
    (entry) =>
      Effect.gen(function* () {
        const ref = entry.ref;
        const previousLockEntry = yield* ws
          .getLockedSubagent(ref.subagent.name)
          .pipe(Effect.catch(() => Effect.succeed(Option.none())));
        const previousVersion = Option.match(previousLockEntry, {
          onNone: () => undefined,
          onSome: previousResolvedVersion,
        });
        const sourceHashBeforeInstall = Option.match(previousLockEntry, {
          onNone: () => undefined,
          onSome: previousContentIdentity,
        });
        const version = ref.refType === "registry" ? ref.version : undefined;

        return buildInstallOperation(subagentManager, {
          toStepFailure: lifecycleStepFailure,
          ref,
          versionRange: entry.versionRange,
          installedBefore: subagentManager
            .isInstalled({ target: { type: "subagent", name: ref.subagent.name } })
            .pipe(Effect.catch(() => Effect.succeed(false))),
          buildArtifact: ({
            installedBefore,
            materialization,
          }: {
            readonly installedBefore: boolean;
            readonly materialization: Option.Option<SubagentMaterializationFacts>;
          }) =>
            Effect.gen(function* () {
              const lockEntryOption = yield* ws
                .getLockedSubagent(ref.subagent.name)
                .pipe(Effect.catch(() => Effect.succeed(Option.none())));
              const sourceHash = previousContentIdentity(Option.getOrUndefined(lockEntryOption));
              const change = artifactChange({
                installedBefore,
                previousVersion,
                version,
                previousSourceHash: sourceHashBeforeInstall,
                sourceHash,
              });
              const observation = Option.match(materialization, {
                onNone: () => NO_MATERIALIZATION_OBSERVATION,
                onSome: (facts) => facts.observation,
              });
              const targets = observation.targets.map((target) => ({
                path: target.path,
                change,
                ...(target.agentIds === undefined ? {} : { agentIds: target.agentIds }),
              }));
              return {
                path: targets[0]?.path ?? ref.subagent.name,
                scope: ws.scope,
                agents: observation.agents,
                ...(version !== undefined ? { version } : {}),
                change,
                ...(previousVersion !== undefined && previousVersion !== version
                  ? { previousVersion }
                  : {}),
                ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
              } satisfies JobStepArtifact;
            }),
        });
      }).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: `Subagent install planning failed for ${entry.ref.subagent.name}`,
            cause,
          }),
        ),
      ),
    { concurrency: 1 },
  );

  return {
    _tag: "Plan",
    name: intent.subagentsToInstall.length === 1 ? "Install subagent" : "Install subagents",
    description: Option.none(),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "subagent",
    ),
    jobs: [{ concurrency: 1, steps }],
  } satisfies Plan<InstallStepRequirements>;
});
