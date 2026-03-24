/**
 * Skill install command workflow actions.
 *
 * Implements `InstallExtensionCommandWorkflowActions` for the skill install
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CliFlags } from "../../../cli-flags/index.js";
import { makeAppError, type AppError } from "../../../app-error/index.js";
import {
  SourceHostProviders,
  parseInputPattern,
  type SkillExtensionRef,
  type Source,
} from "../../../sources/index.js";
import type { InputParseResult } from "../../../sources/index.js";
import { Output } from "../../../output/index.js";
import { Activity } from "../../../activity/index.js";
import { Input } from "../../../input/index.js";
import { Workspace } from "../../../workspace/index.js";
import { isUserScope, type WorkspaceScope } from "../../../workspace/scope.js";
import { SkillManager } from "../../../extensions/skills/manager.js";
import { buildInstallOperation } from "../../../workflows/install-operation/workflow.js";
import type { InstallExtensionCommandWorkflowActions } from "../../../workflows/install-command/workflow.js";
import type { Plan } from "../../../workspace/plan.js";
import type { InstallHandlerArgs } from "./handler.js";
import type { InstallSkillCommandIntent } from "./intent.js";
import {
  resolveSkillInstallSource,
  type RegistryLookupProbe,
} from "./resolve-skill-install-source.js";
import { determineSkillsToInstall } from "./select-skills.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Parsed and validated skill install arguments.
 */
export interface ParsedSkillInstallArgs {
  readonly source: Source;
  readonly versionConstraint: Option.Option<string>;
  readonly requestedSkills: ReadonlyArray<string>;
  readonly requestedNamespace: Option.Option<string>;
  readonly all: boolean;
  readonly scope: WorkspaceScope;
}

/**
 * Source request for skill install discovery.
 */
export interface SkillSourceRequest {
  readonly source: Source;
  readonly requestedSkills: ReadonlyArray<string>;
  readonly requestedNamespace: Option.Option<string>;
  readonly versionConstraint: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Helpers (pure, no service dependencies)
// -----------------------------------------------------------------------------

const isAppErrorCheck = (error: unknown): error is AppError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "AppError" &&
  "what" in error &&
  "code" in error;

const summarizeDiscoverError = (error: unknown): string => {
  if (isAppErrorCheck(error)) {
    return `${error.what} (${error.code})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const isRemoteReadNotImplemented = (error: unknown): boolean =>
  isAppErrorCheck(error) &&
  (error.code === "REGISTRY_REMOTE_NOT_SUPPORTED" ||
    (error.code.startsWith("REGISTRY_REMOTE_") && error.code.endsWith("_NOT_IMPLEMENTED")));

const discoverHowToFix = (source: Source, error: unknown): string => {
  if (source.type === "registry") {
    if (isRemoteReadNotImplemented(error)) {
      return "Remote registry discovery is not yet supported for HTTP(S) sources. Use a file:// registry source, or install from github:owner/repo.";
    }
    return "Verify the configured registry is reachable and contains the requested namespace/skill.";
  }
  if (source.type === "local") {
    return "Verify the source path contains directories with SKILL.md files.";
  }
  return "Verify the source is reachable and contains valid skill directories.";
};

const noSkillsFoundHowToFix = (source: Source): string => {
  if (source.type === "registry") {
    return "Verify the namespace and skill name exist in the configured registry.";
  }
  if (source.type === "local") {
    return "Verify the source path contains directories with SKILL.md files.";
  }
  return "Verify the source contains skill directories with SKILL.md files.";
};

const formatRegistryProbe = (probe: RegistryLookupProbe): string => {
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

const extractRequestedSkills = (
  argSkills: readonly string[],
  parsedSource: InputParseResult,
): ReadonlyArray<string> =>
  argSkills.length > 0
    ? argSkills
    : parsedSource.pattern.pattern === "name-input"
      ? [parsedSource.pattern.name]
      : parsedSource.pattern.pattern === "registry-pattern-input"
        ? Option.isSome(parsedSource.pattern.name)
          ? [parsedSource.pattern.name.value]
          : []
        : [];

const extractRequestedNamespace = (
  parsedSource: InputParseResult,
  source: Source,
): Option.Option<string> =>
  parsedSource.pattern.pattern === "registry-pattern-input"
    ? Option.some(parsedSource.pattern.namespace)
    : source.type === "registry"
      ? (source.namespace ?? Option.none<string>())
      : Option.none<string>();

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

type SkillsInstallHandlerArgs = InstallHandlerArgs;

export class InstallSkillCommandWorkflowActions extends ServiceMap.Service<
  InstallSkillCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    SkillsInstallHandlerArgs,
    ParsedSkillInstallArgs,
    SkillSourceRequest,
    SkillExtensionRef,
    InstallSkillCommandIntent
  >
>()("InstallSkillCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const InstallSkillCommandWorkflowActionsLive = Layer.effect(
  InstallSkillCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const output = yield* Output;
    const activity = yield* Activity;
    const skillMgr = yield* SkillManager;
    const ws = yield* Workspace;
    const input = yield* Input;
    const pathSvc = yield* Path.Path;
    const fsSvc = yield* FileSystem.FileSystem;
    const flags = yield* CliFlags;

    // Build a service layer providing all services needed by inner effects
    // (resolveSkillInstallSource, determineSkillsToInstall, etc.)
    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(Output, output),
      Layer.succeed(Activity, activity),
      Layer.succeed(Workspace, ws),
      Layer.succeed(Input, input),
      Layer.succeed(Path.Path, pathSvc),
      Layer.succeed(FileSystem.FileSystem, fsSvc),
      Layer.succeed(CliFlags, flags),
    );

    // Provide all captured services, bridging R to never and allowing
    // PromptCancelled to narrow to AppError for the interface contract.
    // PromptCancelled propagates at runtime to the command runner level.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridging service context
    const provide = <A>(effect: Effect.Effect<A, any, any>): Effect.Effect<A, AppError, never> =>
      Effect.provide(effect, envLayer) as Effect.Effect<A, AppError, never>;

    // PromptCancelled from prompts propagates through the workflow
    // to the run() handler. The provide() helper narrows E to AppError for the interface.
    const parseArgs = (args: SkillsInstallHandlerArgs) =>
      provide(
        Effect.gen(function* () {
          const scopeLabel = isUserScope(args.scope) ? "user" : "project";
          yield* output.info(`axm skills install (${scopeLabel})`);

          const parsed = yield* activity.withSpinner(
            "Parsing source...",
            () =>
              Effect.gen(function* () {
                const parsedSourceOption = parseInputPattern(args.source.trim());
                if (Option.isNone(parsedSourceOption)) {
                  return yield* makeAppError({
                    code: "INVALID_SOURCE",
                    what: "Invalid source: Unable to parse source",
                    details: [`Provided: ${args.source || "(empty)"}`],
                    howToFix:
                      "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
                  });
                }

                const parsedSource = parsedSourceOption.value;
                const versionConstraint =
                  parsedSource.pattern.pattern === "registry-pattern-input"
                    ? parsedSource.pattern.versionConstraint
                    : Option.none<string>();

                const resolutionProbes: RegistryLookupProbe[] = [];
                const source = yield* resolveSkillInstallSource(parsedSource, {
                  onRegistryProbe: (probe) => {
                    resolutionProbes.push(probe);
                  },
                });

                const requestedSkills = extractRequestedSkills(args.skills, parsedSource);
                const requestedNamespace = extractRequestedNamespace(parsedSource, source);

                return {
                  source,
                  versionConstraint,
                  requestedSkills,
                  requestedNamespace,
                  resolutionProbes,
                };
              }),
            {
              successMessage: ({ source }) => `Source: ${sources.origin(source)} (${source.type})`,
            },
          );

          const {
            source,
            versionConstraint,
            requestedSkills,
            requestedNamespace,
            resolutionProbes,
          } = parsed;

          if (resolutionProbes.length > 0) {
            yield* output.message(
              `Resolution: ${resolutionProbes.map((probe) => formatRegistryProbe(probe)).join("; ")}`,
            );
          }

          return {
            source,
            versionConstraint,
            requestedSkills,
            requestedNamespace,
            all: args.all,
            scope: args.scope,
          } satisfies ParsedSkillInstallArgs;
        }),
      );

    const resolveSourceRequests = (parsed: ParsedSkillInstallArgs) =>
      Effect.succeed<ReadonlyArray<SkillSourceRequest>>([
        {
          source: parsed.source,
          requestedSkills: parsed.requestedSkills,
          requestedNamespace: parsed.requestedNamespace,
          versionConstraint: parsed.versionConstraint,
        },
      ]);

    const discoverRefs = (reqs: ReadonlyArray<SkillSourceRequest>) =>
      provide(
        Effect.gen(function* () {
          const req = reqs[0];
          if (req === undefined) {
            return yield* makeAppError({
              code: "DISCOVER_FAILED",
              what: "No source request to discover from",
            });
          }

          return yield* activity.withSpinner(
            "Discovering skills...",
            () =>
              sources
                .find(req.source, {
                  skillNames: req.requestedSkills,
                  type: "skill" as const,
                  namespace: req.requestedNamespace,
                  versionConstraint: req.versionConstraint,
                })
                .pipe(
                  Effect.map(Array.filter((ref): ref is SkillExtensionRef => ref.type === "skill")),
                  Effect.mapError((error) => {
                    const reason = summarizeDiscoverError(error);
                    return makeAppError({
                      code: "DISCOVER_FAILED",
                      what: "Failed to discover skills from source",
                      details: [`Source: ${sources.origin(req.source)}`, `Reason: ${reason}`],
                      howToFix: discoverHowToFix(req.source, error),
                      cause: error,
                    });
                  }),
                  Effect.flatMap((discoveredSkills) =>
                    !Array.isReadonlyArrayEmpty(discoveredSkills)
                      ? Effect.succeed(discoveredSkills)
                      : Effect.fail(
                          makeAppError({
                            code: "NO_SKILLS_FOUND",
                            what: "No skills found in source",
                            details: [`Source: ${sources.origin(req.source)}`],
                            howToFix: noSkillsFoundHowToFix(req.source),
                          }),
                        ),
                  ),
                ),
            {
              successMessage: (discoveredSkills) => `Found ${discoveredSkills.length} skill(s)`,
            },
          );
        }),
      );

    const finalizeIntent = (
      parsed: ParsedSkillInstallArgs,
      discoveredRefs: ReadonlyArray<SkillExtensionRef>,
    ) =>
      provide(
        Effect.gen(function* () {
          // Select skills
          const selectedSkills = yield* determineSkillsToInstall(
            discoveredRefs as Array.NonEmptyReadonlyArray<SkillExtensionRef>,
            {
              requestedSkills: parsed.requestedSkills,
              all: parsed.all,
            },
          );

          if (Array.isReadonlyArrayEmpty(selectedSkills)) {
            yield* output.warn("No skills selected.");
            yield* output.success("Nothing to install.");
            return { skillsToInstall: [] } satisfies InstallSkillCommandIntent;
          }

          return {
            skillsToInstall: selectedSkills.map((ref) => ({
              ref,
              versionConstraint:
                ref.refType === "registry" ? parsed.versionConstraint : Option.none<string>(),
            })),
          } satisfies InstallSkillCommandIntent;
        }),
      );

    const buildPlan = (intent: InstallSkillCommandIntent) =>
      Effect.succeed<Plan>({
        _tag: "Plan",
        name: "Install skill(s)",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1 as const,
            steps: intent.skillsToInstall.map((entry) =>
              buildInstallOperation(skillMgr, {
                ref: entry.ref,
                versionConstraint: entry.versionConstraint,
              }),
            ),
          },
        ],
      } satisfies Plan);

    return {
      parseArgs,
      resolveSourceRequests,
      discoverRefs,
      finalizeIntent,
      buildPlan,
    };
  }),
);
