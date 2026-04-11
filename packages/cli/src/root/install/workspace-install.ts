import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import { makeAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import type { CommandExtensionRef } from "@axm.sh/core/unstable/commands";
import type { ExtensionPackRef } from "@axm.sh/core/unstable/packs";
import type { McpServerExtensionRef } from "@axm.sh/core/unstable/mcp-servers";
import type { SkillExtensionRef } from "@axm.sh/core/unstable/skills";
import type { SubagentExtensionRef } from "@axm.sh/core/unstable/subagents";
import {
  type Plan,
  type PlanSection,
  type PlannedJobStep,
  Workspace,
} from "@axm.sh/core/unstable/workspace";
import { resolveSource, SourceHostProviders } from "@axm.sh/core/unstable/source-resolution";
import {
  parseRegistrySourcePatternParts,
  type Handle,
  type InstallableExtensionType,
} from "@axm.sh/core/unstable/extensions";
import type { VersionConstraint } from "@axm.sh/core/unstable/version-constraints";

import { InstallCommandCommandWorkflowActions } from "../commands/install/command-actions.js";
import type { InstallCommandCommandIntent } from "../commands/install/intent.js";
import { InstallMcpServerCommandWorkflowActions } from "../mcp-servers/install/command-actions.js";
import type { InstallMcpServerCommandIntent } from "../mcp-servers/install/intent.js";
import { InstallPackCommandWorkflowActions } from "../packs/install/command-actions.js";
import type { InstallPackCommandIntent } from "../packs/install/intent.js";
import { InstallSkillCommandWorkflowActions } from "../skills/install/command-actions.js";
import type { InstallSkillCommandIntent } from "../skills/install/intent.js";
import { InstallSubagentCommandWorkflowActions } from "../subagents/install/command-actions.js";
import type { InstallSubagentCommandIntent } from "../subagents/install/intent.js";
import {
  parseRegistryInstallTarget,
  type RegistryInstallTarget,
} from "../shared/registry-install-target.js";

export type WorkspaceInstallableType = InstallableExtensionType;

type StepOrigin = "direct" | "dependency";

interface StepFragment {
  readonly key: string;
  readonly origin: StepOrigin;
  readonly step: PlannedJobStep;
}

interface CollectedWorkspaceInstallPlans {
  readonly plans: ReadonlyArray<Plan>;
  readonly fragments: ReadonlyArray<StepFragment>;
}

type WorkspaceInstallCollectorContext =
  | Scope.Scope
  | FileSystem.FileSystem
  | Path.Path
  | Workspace
  | SourceHostProviders
  | InstallSkillCommandWorkflowActions
  | InstallCommandCommandWorkflowActions
  | InstallSubagentCommandWorkflowActions
  | InstallMcpServerCommandWorkflowActions
  | InstallPackCommandWorkflowActions;

interface WorkspaceInstallCollector {
  readonly type: WorkspaceInstallableType;
  readonly collect: () => Effect.Effect<
    CollectedWorkspaceInstallPlans,
    AppError,
    WorkspaceInstallCollectorContext
  >;
}

export type WorkspaceInstallPlanResult =
  | {
      readonly _tag: "NoConfiguredExtensions";
      readonly message: string;
    }
  | {
      readonly _tag: "WorkspaceInstallPlan";
      readonly plan: Plan;
    };

const configuredTypeLabel = (type: WorkspaceInstallableType): string => {
  switch (type) {
    case "skill":
      return "skills";
    case "command":
      return "commands";
    case "subagent":
      return "subagents";
    case "mcp-server":
      return "MCP servers";
    case "pack":
      return "extension packs";
  }
};

const noConfiguredMessage = (type: Option.Option<WorkspaceInstallableType>): string =>
  Option.match(type, {
    onNone: () => "No configured extensions. Nothing to install.",
    onSome: (value) => `No configured ${configuredTypeLabel(value)}. Nothing to install.`,
  });

const flattenPlanSteps = (plan: Plan): ReadonlyArray<PlannedJobStep> =>
  plan.jobs.flatMap((job) => job.steps);

const mergePlanSections = (plans: ReadonlyArray<Plan>): ReadonlyArray<PlanSection> | undefined => {
  const byTitle = new Map<string, Set<string>>();

  for (const plan of plans) {
    for (const section of plan.sections ?? []) {
      const existing = byTitle.get(section.title);
      if (existing === undefined) {
        byTitle.set(section.title, new Set(section.items));
        continue;
      }
      for (const item of section.items) {
        existing.add(item);
      }
    }
  }

  if (byTitle.size === 0) {
    return undefined;
  }

  return [...byTitle.entries()].map(([title, items]) => ({
    title,
    items: [...items],
  }));
};

const toCollectedWorkspaceInstallPlans = ({
  plans,
  originForStep = () => "direct" as const,
}: {
  readonly plans: ReadonlyArray<Plan>;
  readonly originForStep?: (index: number) => StepOrigin;
}): CollectedWorkspaceInstallPlans => ({
  plans,
  fragments: plans.flatMap((plan) =>
    flattenPlanSteps(plan).map((step, index) => ({
      key: step.key ?? step.label,
      origin: originForStep(index),
      step,
    })),
  ),
});

const matchesRequestedType = (
  requestedType: Option.Option<WorkspaceInstallableType>,
  candidate: WorkspaceInstallableType,
): boolean =>
  Option.match(requestedType, {
    onNone: () => true,
    onSome: (value) => value === candidate,
  });

const mergeFragments = (
  collections: ReadonlyArray<CollectedWorkspaceInstallPlans>,
): ReadonlyArray<StepFragment> => {
  const byKey = new Map<string, StepFragment>();

  for (const fragment of collections.flatMap((collection) => collection.fragments)) {
    const existing = byKey.get(fragment.key);
    if (existing === undefined) {
      byKey.set(fragment.key, fragment);
      continue;
    }

    if (existing.origin === "dependency" && fragment.origin === "direct") {
      byKey.set(fragment.key, fragment);
    }
  }

  return [...byKey.values()];
};

const resolveSkillIntent = (name: string, source: string) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "SKILL_SOURCE_INVALID",
          what: `Invalid skill source for ${name}: ${error.message}`,
          details: [`Source: ${source}`],
          cause: error,
        }),
      ),
    );
    const parsedPattern = parseRegistrySourcePatternParts(source);
    const requestedOwner =
      parsedPattern?.type === "skills"
        ? Option.some(parsedPattern.owner)
        : resolvedSource.type === "registry"
          ? resolvedSource.owner
          : Option.none<Handle>();
    const versionConstraint =
      resolvedSource.type === "registry" && parsedPattern?.type === "skills"
        ? Option.fromUndefinedOr(parsedPattern.versionConstraint)
        : Option.none<VersionConstraint>();

    const refs = yield* providers
      .find(resolvedSource, {
        skillNames: [name],
        type: "skill",
        owner: requestedOwner,
        versionConstraint,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is SkillExtensionRef => entry.type === "skill"),
        ),
        Effect.mapError((error) =>
          makeAppError({
            code: "SKILL_SOURCE_RESOLUTION_FAILED",
            what: `Failed to resolve configured skill "${name}"`,
            details: [`Source: ${source}`],
            howToFix: "Verify the configured source is reachable and still contains the skill.",
            cause: error,
          }),
        ),
      );

    const ref = refs.find((entry) => entry.skill.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "SKILL_SOURCE_MISSING",
        what: `Configured skill "${name}" could not be found in its source`,
        details: [`Source: ${source}`],
        howToFix: "Verify the configured source still contains the skill or update settings.json.",
      });
    }

    return {
      skillsToInstall: [
        {
          ref,
          versionConstraint: ref.refType === "registry" ? versionConstraint : Option.none(),
        },
      ],
    } satisfies InstallSkillCommandIntent;
  });

const resolveSubagentIntent = (name: string, source: string) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "SUBAGENT_SOURCE_INVALID",
          what: `Invalid subagent source for ${name}: ${error.message}`,
          details: [`Source: ${source}`],
          cause: error,
        }),
      ),
    );
    const parsedPattern = parseRegistrySourcePatternParts(source);
    const requestedOwner =
      parsedPattern?.type === "subagents"
        ? Option.some(parsedPattern.owner)
        : resolvedSource.type === "registry"
          ? resolvedSource.owner
          : Option.none<Handle>();
    const versionConstraint =
      resolvedSource.type === "registry" && parsedPattern?.type === "subagents"
        ? Option.fromUndefinedOr(parsedPattern.versionConstraint)
        : Option.none<VersionConstraint>();

    const refs = yield* providers
      .find(resolvedSource, {
        skillNames: [name],
        type: "subagent",
        owner: requestedOwner,
        versionConstraint,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is SubagentExtensionRef => entry.type === "subagent"),
        ),
        Effect.mapError((error) =>
          makeAppError({
            code: "SUBAGENT_SOURCE_RESOLUTION_FAILED",
            what: `Failed to resolve configured subagent "${name}"`,
            details: [`Source: ${source}`],
            howToFix: "Verify the configured source is reachable and still contains the subagent.",
            cause: error,
          }),
        ),
      );

    const ref = refs.find((entry) => entry.subagent.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "SUBAGENT_SOURCE_MISSING",
        what: `Configured subagent "${name}" could not be found in its source`,
        details: [`Source: ${source}`],
        howToFix:
          "Verify the configured source still contains the subagent or update settings.json.",
      });
    }

    return {
      subagentsToInstall: [
        {
          ref,
          versionConstraint: ref.refType === "registry" ? versionConstraint : Option.none(),
        },
      ],
    } satisfies InstallSubagentCommandIntent;
  });

const parseRegistryTarget = <TExpected extends WorkspaceInstallableType>(
  source: string,
  expectedType: TExpected,
  allowBareVersionConstraint = false,
): Option.Option<RegistryInstallTarget> => {
  const parsed = parseRegistryInstallTarget(source, {
    expectedType,
    allowBareName: true,
    allowBareVersionConstraint,
  });

  if (Result.isFailure(parsed)) {
    return Option.none();
  }

  return Option.some(parsed.success);
};

const resolveRegistryOwnerAndInput = (source: string, type: "command" | "mcp-server" | "pack") =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const parsedOption = parseRegistryTarget(source, type, type === "pack");
    if (Option.isNone(parsedOption)) {
      return yield* makeAppError({
        code: "WORKSPACE_INSTALL_SOURCE_INVALID",
        what: `Configured ${type} source is invalid`,
        details: [`Source: ${source}`],
        howToFix: "Reinstall the extension or update settings.json with a valid registry source.",
      });
    }

    const parsed = parsedOption.value;
    if (parsed.kind === "registry") {
      return {
        owner: parsed.owner,
        name: parsed.name,
        versionConstraint: Option.fromUndefinedOr(parsed.versionConstraint),
        resolvedInput: source,
      };
    }

    const owner = yield* ws.getConfiguredProfile();
    const resolvedInput = Option.match(Option.fromUndefinedOr(parsed.versionConstraint), {
      onNone: () => `${owner}/${type === "mcp-server" ? "mcp-servers" : `${type}s`}/${parsed.name}`,
      onSome: (constraint) =>
        `${owner}/${type === "mcp-server" ? "mcp-servers" : `${type}s`}/${parsed.name}@${constraint}`,
    });

    return {
      owner,
      name: parsed.name,
      versionConstraint: Option.fromUndefinedOr(parsed.versionConstraint),
      resolvedInput,
    };
  });

const resolveCommandIntent = (name: string, source: string) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const resolved = yield* resolveRegistryOwnerAndInput(source, "command");
    const resolvedSource = yield* resolveSource(resolved.resolvedInput).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "COMMAND_SOURCE_INVALID",
          what: `Invalid command source for ${name}: ${error.message}`,
          details: [`Source: ${source}`],
          cause: error,
        }),
      ),
    );

    const refs = yield* providers
      .find(resolvedSource, {
        skillNames: [name],
        type: "command",
        owner: Option.some(resolved.owner),
        versionConstraint: resolved.versionConstraint,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is CommandExtensionRef => entry.type === "command"),
        ),
        Effect.mapError((error) =>
          makeAppError({
            code: "COMMAND_SOURCE_RESOLUTION_FAILED",
            what: `Failed to resolve configured command "${name}"`,
            details: [`Source: ${source}`],
            howToFix:
              "Verify the configured registry source is reachable and still contains the command.",
            cause: error,
          }),
        ),
      );

    const ref = refs.find((entry) => entry.command.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "COMMAND_SOURCE_MISSING",
        what: `Configured command "${name}" could not be found in its source`,
        details: [`Source: ${source}`],
        howToFix:
          "Verify the configured source still contains the command or update settings.json.",
      });
    }

    return {
      ref,
      versionConstraint: resolved.versionConstraint,
      force: false,
    } satisfies InstallCommandCommandIntent;
  });

const resolveMcpServerIntent = (name: string, source: string) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const resolved = yield* resolveRegistryOwnerAndInput(source, "mcp-server");
    const resolvedSource = yield* resolveSource(resolved.resolvedInput).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "MCP_SERVER_SOURCE_INVALID",
          what: `Invalid MCP server source for ${name}: ${error.message}`,
          details: [`Source: ${source}`],
          cause: error,
        }),
      ),
    );

    const refs = yield* providers
      .find(resolvedSource, {
        skillNames: [name],
        type: "mcp-server",
        owner: Option.some(resolved.owner),
        versionConstraint: resolved.versionConstraint,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is McpServerExtensionRef => entry.type === "mcp-server"),
        ),
        Effect.mapError((error) =>
          makeAppError({
            code: "MCP_SERVER_SOURCE_RESOLUTION_FAILED",
            what: `Failed to resolve configured MCP server "${name}"`,
            details: [`Source: ${source}`],
            howToFix:
              "Verify the configured registry source is reachable and still contains the MCP server.",
            cause: error,
          }),
        ),
      );

    const ref = refs.find((entry) => entry.server.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "MCP_SERVER_SOURCE_MISSING",
        what: `Configured MCP server "${name}" could not be found in its source`,
        details: [`Source: ${source}`],
        howToFix:
          "Verify the configured source still contains the MCP server or update settings.json.",
      });
    }

    return {
      ref,
      versionConstraint: Option.map(resolved.versionConstraint, (constraint) => constraint),
      force: false,
    } satisfies InstallMcpServerCommandIntent;
  });

const resolvePackRef = (name: string, source: string) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const resolved = yield* resolveRegistryOwnerAndInput(source, "pack");
    const resolvedSource = yield* resolveSource(resolved.resolvedInput).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "PACK_SOURCE_INVALID",
          what: `Invalid extension pack source for ${name}: ${error.message}`,
          details: [`Source: ${source}`],
          cause: error,
        }),
      ),
    );

    const findWith = (candidate: typeof resolvedSource) =>
      providers.find(candidate, {
        skillNames: [name],
        type: "pack",
        owner: Option.some(resolved.owner),
        versionConstraint: resolved.versionConstraint,
      });

    const refs = yield* findWith(resolvedSource).pipe(
      Effect.map((entries) =>
        entries.filter((entry): entry is ExtensionPackRef => entry.type === "pack"),
      ),
      Effect.catch((error) =>
        resolvedSource.type === "registry"
          ? Effect.gen(function* () {
              const registryHosts = yield* Effect.gen(function* () {
                const ws = yield* Workspace;
                return yield* ws.getRegistrySourceHosts();
              });
              const fallbackSources = registryHosts
                .filter((host) => host.location.protocol === "file:")
                .map((host) => ({
                  type: "registry" as const,
                  location: host.location,
                  owner: Option.some(resolved.owner),
                }));

              for (const fallback of fallbackSources) {
                if (fallback.location.href === resolvedSource.location.href) {
                  continue;
                }

                const fallbackResult = yield* findWith(fallback).pipe(Effect.result);
                if (fallbackResult._tag === "Success" && fallbackResult.success.length > 0) {
                  return fallbackResult.success.filter(
                    (entry): entry is ExtensionPackRef => entry.type === "pack",
                  );
                }
              }

              return yield* error;
            })
          : Effect.fail(error),
      ),
      Effect.mapError((error) =>
        makeAppError({
          code: "PACK_SOURCE_RESOLUTION_FAILED",
          what: `Failed to resolve configured extension pack "${name}"`,
          details: [`Source: ${source}`],
          howToFix:
            "Verify the configured registry source is reachable and still contains the extension pack.",
          cause: error,
        }),
      ),
    );

    const ref = refs.find((entry) => entry.pack.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "PACK_SOURCE_MISSING",
        what: `Configured extension pack "${name}" could not be found in its source`,
        details: [`Source: ${source}`],
        howToFix:
          "Verify the configured source still contains the extension pack or update settings.json.",
      });
    }

    return {
      packToInstall: ref,
      versionConstraint: resolved.versionConstraint,
    } satisfies InstallPackCommandIntent;
  });

const collectSkillPlans = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const actions = yield* InstallSkillCommandWorkflowActions;
    const configured = yield* ws.getConfiguredSkills();
    const entries = Object.entries(configured).filter(([, entry]) => entry.enabled);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveSkillIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectCommandPlans = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const actions = yield* InstallCommandCommandWorkflowActions;
    const configured = yield* ws.getConfiguredCommands();
    const entries = Object.entries(configured).filter(([, entry]) => entry.enabled);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveCommandIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectSubagentPlans = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const actions = yield* InstallSubagentCommandWorkflowActions;
    const configured = yield* ws.getConfiguredSubagents();
    const entries = Object.entries(configured).filter(([, entry]) => entry.enabled);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveSubagentIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectMcpServerPlans = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const actions = yield* InstallMcpServerCommandWorkflowActions;
    const configured = yield* ws.getConfiguredMcpServers();
    const entries = Object.entries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveMcpServerIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectPackPlans = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const actions = yield* InstallPackCommandWorkflowActions;
    const configured = yield* ws.getConfiguredPacks();
    const entries = Object.entries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolvePackRef(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({
      plans,
      originForStep: (index) => (index === 0 ? "direct" : "dependency"),
    });
  });

const workspaceInstallCollectors: ReadonlyArray<WorkspaceInstallCollector> = [
  { type: "skill" as const, collect: collectSkillPlans },
  { type: "command" as const, collect: collectCommandPlans },
  { type: "subagent" as const, collect: collectSubagentPlans },
  { type: "mcp-server" as const, collect: collectMcpServerPlans },
  { type: "pack" as const, collect: collectPackPlans },
];

const makePlan = (
  name: string,
  description: Option.Option<string>,
  steps: ReadonlyArray<PlannedJobStep>,
  sections: ReadonlyArray<PlanSection> | undefined,
): Plan => ({
  _tag: "Plan",
  name,
  description,
  jobs: [{ concurrency: 1 as const, steps }],
  ...(sections === undefined ? {} : { sections }),
});

export const buildWorkspaceInstallPlan = (args: {
  readonly type: Option.Option<WorkspaceInstallableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const selectedCollectors = workspaceInstallCollectors.filter(({ type }) =>
      matchesRequestedType(args.type, type),
    );
    const collections = yield* Effect.forEach(selectedCollectors, ({ collect }) => collect(), {
      concurrency: "unbounded",
    });
    const fragments = mergeFragments(collections);

    if (fragments.length === 0) {
      return {
        _tag: "NoConfiguredExtensions",
        message: noConfiguredMessage(args.type),
      } satisfies WorkspaceInstallPlanResult;
    }

    const plans = collections.flatMap((collection) => collection.plans);
    const sections = mergePlanSections(plans);

    return {
      _tag: "WorkspaceInstallPlan",
      plan: makePlan(
        args.planName,
        args.planDescription,
        fragments.map((fragment) => fragment.step),
        sections,
      ),
    } satisfies WorkspaceInstallPlanResult;
  });
