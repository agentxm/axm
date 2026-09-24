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
import type * as Config from "effect/Config";
import * as Option from "effect/Option";

import {
  NO_MATERIALIZATION_OBSERVATION,
  SubagentManager,
  type SubagentMaterializationFacts,
} from "../../../materialization/index.js";
import { buildInstallOperation } from "../../../reconciliation/index.js";
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
} from "../../../resolution/sources/index.js";
import { operationPresentation, type Plan } from "../../../transitions/planning/index.js";

import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import { lifecycleStepFailure } from "../../../lifecycle/step-failure.js";
import {
  sourceFailureDetail,
  type RegistryLookupProbe,
} from "../../../lifecycle/install/registry-source-resolution.js";
import {
  installRefused,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
  type SubagentInstallIntent,
} from "../../../lifecycle/install/vocabulary.js";
import {
  determineSubagentsToInstall,
  SubagentSelectionInteraction,
  type SubagentSelectionFailure,
} from "../application/index.js";
import { resolveSubagentInstallSource } from "./source.js";
import { prepareSubagentInstallations } from "../application/installation.js";
import { makeSubagentInstallationFacts } from "../adapters/installation.js";

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
  ExtensionLifecycleFailed | Config.ConfigError,
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
        cause._tag === "ConfigError"
          ? cause
          : installRefused({
              category:
                sourceResolutionFailureCategory(cause) === "not_found" ? "not_found" : "usage",
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
  ExtensionLifecycleFailed | SubagentSelectionFailure,
  SubagentSelectionInteraction
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
  const subagentManager = yield* SubagentManager;
  const facts = yield* makeSubagentInstallationFacts;
  const prepared = yield* prepareSubagentInstallations(facts, intent.subagentsToInstall).pipe(
    Effect.catchTag("SubagentPlacementUnavailable", (error) =>
      installRefused({ category: "validation", detail: error.reason }),
    ),
  );
  const steps = prepared.map((entry) =>
    buildInstallOperation(subagentManager, {
      toStepFailure: lifecycleStepFailure,
      ref: entry.ref,
      declaration: { name: entry.ref.subagent.name, versionRange: entry.versionRange },
      force: intent.force === true,
      installedBefore: entry.installedBefore,
      buildArtifact: ({
        installedBefore,
        materialization,
      }: {
        readonly installedBefore: boolean;
        readonly materialization: Option.Option<SubagentMaterializationFacts>;
      }) =>
        entry.buildArtifact({
          installedBefore,
          observation: Option.match(materialization, {
            onNone: () => NO_MATERIALIZATION_OBSERVATION,
            onSome: (facts) => facts.observation,
          }),
        }),
    }),
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
