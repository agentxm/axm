/**
 * Creating a new authored extension.
 *
 * One use case for every extension type: the owner the package is created
 * under, the name it may carry, the canonical location it occupies, the
 * create-only refusal that protects existing content, the desired-state
 * entry that declares it, and the projection that makes it observable are all
 * decided here. What differs per type — the manifest and starter body — is a
 * scaffold; what differs per command — flags, wording, exit codes — stays in
 * the application.
 *
 * `prepare` decides everything and writes nothing: it settles ownership,
 * naming, and collisions, then freezes an execution candidate. `previewOrApply`
 * resolves that same candidate, so preview and apply describe one decision
 * rather than two.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  ExtensionManagers,
  buildNewExtensionStep,
  createCanonicalDirectory,
  groupInstallTargetsByDirectory,
  recoverCanonicalDirectory,
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  type ExtensionManager,
  type InstallableSkillTarget,
  type ManagerRequirements,
  type MaterializationFacts,
  type NewExtensionOperationArgs,
  type RecipeRequirements,
} from "@agentxm/extension-materialization";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  toExtensionTypePlural,
  formatFqn,
  decodeExtensionNameSync,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type {
  HookEvent,
  HookRuntime,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import {
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type ExecutionCandidate,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { CodingAgentRepository } from "@agentxm/workspace-projection";
import type { CredentialStore } from "@agentxm/registry-auth";
import type { RegistryUrl } from "@agentxm/registry-client";
import type { FqnInvalidError } from "@agentxm/extension-model/unstable/extensions";
import type { CandidateFingerprintFailed } from "@agentxm/workspace-operations";
import {
  WorkspaceMutations,
  computeExtensionPathsForLayout,
  computePackPathsForLayout,
  computeSourceHash,
  type ConfiguredAgentOutcomesProvider,
  type WorkspaceMutationsService,
} from "@agentxm/workspace-state";

import { preflightCreateOnly } from "../create-preflight.js";
import { authoringStepFailure, type AuthoringStepFailure } from "../step-failure.js";
import { resolveAuthoringOwner, settingsRelativePath } from "./authoring-owner.js";
import {
  AuthoringScopeUnsupported,
  ScaffoldNameInvalid,
  type AuthoringOwnerMismatch,
  type AuthoringOwnerRequired,
} from "./errors.js";
import { hookScaffold } from "./scaffolds/hook.js";
import { knowledgeScaffold } from "./scaffolds/knowledge.js";
import { packScaffold } from "./scaffolds/pack.js";
import { ruleScaffold } from "./scaffolds/rule.js";
import { skillScaffold } from "./scaffolds/skill.js";
import { subagentScaffold } from "./scaffolds/subagent.js";
import {
  SCAFFOLD_NAME_MAX_LENGTH,
  SCAFFOLD_NAME_PATTERN,
  isValidScaffoldName,
} from "./scaffold-name.js";
import type { AuthoredScaffold } from "./scaffolds/scaffold.js";

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------

interface CreateRequestBase {
  /** Name without owner, as the person typed it. */
  readonly name: string;
  /** An explicitly requested owner, if the person named one. */
  readonly owner: Option.Option<string>;
}

export interface CreateSkillRequest extends CreateRequestBase {
  readonly type: "skill";
}
export interface CreateSubagentRequest extends CreateRequestBase {
  readonly type: "subagent";
}
export interface CreateRuleRequest extends CreateRequestBase {
  readonly type: "rule";
  readonly title: Option.Option<string>;
}
export interface CreateHookRequest extends CreateRequestBase {
  readonly type: "hook";
  readonly runtime: HookRuntime;
  readonly event: HookEvent;
  readonly matcher: Option.Option<string>;
}
export interface CreateKnowledgeRequest extends CreateRequestBase {
  readonly type: "knowledge";
  readonly description: Option.Option<string>;
}
export interface CreatePackRequest extends CreateRequestBase {
  readonly type: "pack";
}

/** What an author asked to create. */
export type CreateExtensionRequest =
  | CreateSkillRequest
  | CreateSubagentRequest
  | CreateRuleRequest
  | CreateHookRequest
  | CreateKnowledgeRequest
  | CreatePackRequest;

/** The extension types `CreateExtension` scaffolds. */
export type CreatableExtensionType = CreateExtensionRequest["type"];

// -----------------------------------------------------------------------------
// Candidate
// -----------------------------------------------------------------------------

/** What every step in this creation may require when it runs. */
export type CreateExtensionRequirements =
  ManagerRequirements | RecipeRequirements | WorkspaceMutations | CodingAgentRepository;

/**
 * A settled creation: every decision is made and nothing is written. The
 * execution candidate carries the frozen plan; the identity fields answer
 * what the application renders around it.
 */
export interface CreateExtensionCandidate {
  readonly type: CreatableExtensionType;
  /** Owner-qualified identity of the package being created. */
  readonly fqn: string;
  readonly owner: Handle;
  readonly name: string;
  /** Workspace-relative directory the package occupies. */
  readonly authoredPath: string;
  /** Workspace-relative file the author edits next. */
  readonly entryPath: string;
  /** Workspace-relative settings file the declaration is written to. */
  readonly settingsPath: string;
  readonly execution: ExecutionCandidate<CreateExtensionRequirements>;
}

/** Every failure settling a creation can surface before anything is written. */
export type CreateExtensionFailure =
  | AuthoringStepFailure
  | AuthoringOwnerRequired
  | AuthoringOwnerMismatch
  | ScaffoldNameInvalid
  | AuthoringScopeUnsupported
  | CandidateFingerprintFailed
  | FqnInvalidError;

/** Everything settling a creation reads before it freezes a candidate. */
export type PrepareCreateExtensionRequirements =
  | FileSystem.FileSystem
  | Path.Path
  | CredentialStore
  | RegistryUrl
  | WorkspaceMutations
  | CodingAgentRepository
  | ConfiguredAgentOutcomesProvider
  | ExtensionManagers;

// -----------------------------------------------------------------------------
// Per-type facts
// -----------------------------------------------------------------------------

/** How each type reads its declarations and writes the one it creates. */
const declaration = (
  ws: WorkspaceMutationsService,
  type: CreatableExtensionType,
  name: string,
): {
  readonly isConfigured: Effect.Effect<boolean, AuthoringStepFailure>;
  readonly declare: Effect.Effect<void, AuthoringStepFailure>;
} => {
  const entry = { source: "workspace", enabled: true } as const;
  switch (type) {
    case "skill":
      return {
        isConfigured: ws
          .getConfiguredSkillEntries()
          .pipe(Effect.map((entries) => Object.hasOwn(entries, name))),
        declare: ws.setSkillEntry(name, entry),
      };
    case "subagent":
      return {
        isConfigured: ws
          .getConfiguredSubagentEntries()
          .pipe(Effect.map((entries) => Object.hasOwn(entries, name))),
        declare: ws.setSubagentEntry(name, entry),
      };
    case "rule":
      return {
        isConfigured: ws
          .getConfiguredRuleEntries()
          .pipe(Effect.map((entries) => Object.hasOwn(entries, name))),
        declare: ws.setRuleEntry(name, entry),
      };
    case "hook":
      return {
        isConfigured: ws
          .getConfiguredHookEntries()
          .pipe(Effect.map((entries) => Object.hasOwn(entries, name))),
        declare: ws.setHookEntry(name, entry),
      };
    case "knowledge":
      return {
        isConfigured: ws
          .getConfiguredKnowledgeEntries()
          .pipe(Effect.map((entries) => Object.hasOwn(entries, name))),
        declare: ws.setKnowledgeEntry(name, entry),
      };
    case "pack":
      return {
        isConfigured: ws
          .getConfiguredPackEntries()
          .pipe(Effect.map((entries) => Object.hasOwn(entries, name))),
        declare: ws.setPackEntry(name, entry),
      };
  }
};

const scaffoldFor = (request: CreateExtensionRequest, owner: Handle): AuthoredScaffold => {
  switch (request.type) {
    case "skill":
      return skillScaffold({ name: request.name, owner });
    case "subagent":
      return subagentScaffold({ name: request.name, owner });
    case "rule":
      return ruleScaffold({ name: request.name, owner, title: request.title });
    case "hook":
      return hookScaffold({
        name: request.name,
        owner,
        runtime: request.runtime,
        event: request.event,
        matcher: request.matcher,
      });
    case "knowledge":
      return knowledgeScaffold({ name: request.name, owner, description: request.description });
    case "pack":
      return packScaffold({ name: request.name, owner });
  }
};

/** The subject and command route a refusal names, per type. */
const route = (
  type: CreatableExtensionType,
): { readonly subject: string; readonly command: string } => {
  switch (type) {
    case "skill":
      return { subject: "skill", command: "skills new" };
    case "subagent":
      return { subject: "subagent", command: "subagents new" };
    case "rule":
      return { subject: "rule", command: "rules new" };
    case "hook":
      return { subject: "hook", command: "hooks new" };
    case "knowledge":
      return { subject: "knowledge bundle", command: "knowledge new" };
    case "pack":
      return { subject: "pack", command: "packs new" };
  }
};

/**
 * The plan a creation of this type resolves. It names the operation in
 * previews, in machine output, and in an interruption report, so the feature
 * that builds the plan owns it rather than each command restating it.
 */
export const createExtensionPlanName = (type: CreatableExtensionType): string =>
  `New ${route(type).subject}`;

/** The canonical directory an authored package of this type occupies. */
const canonicalLocation = (
  path: Path.Path,
  ws: WorkspaceMutationsService,
  type: CreatableExtensionType,
  owner: Handle,
  name: string,
): string =>
  type === "pack"
    ? computePackPathsForLayout(path.join, ws.layout, "workspace", owner, name).canonicalPath
    : computeExtensionPathsForLayout(
        path.join,
        ws.layout,
        { refType: "workspace", owner },
        toExtensionTypePlural(type),
        name,
      ).canonicalPath;

/**
 * Where a skill becomes observable: the universal location and every
 * configured agent that can represent one. Preview and apply read the same
 * function, so a preview lists exactly the locations an apply writes.
 */
const skillTargetLocations = Effect.fn("CreateExtension.skillTargetLocations")(function* () {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const agents = yield* (yield* CodingAgentRepository).getMaterializationAgents();
  const resolved = yield* Effect.forEach(
    agents,
    (agent) =>
      agent
        .resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir })
        .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
    { concurrency: "unbounded" },
  );
  const installable: Array<InstallableSkillTarget> = [];
  for (const { agentId, outcome } of resolved) {
    if (outcome._tag === "supported") {
      installable.push({ agentId, targetDir: path.normalize(outcome.dir) });
    }
  }
  return { installable, locations: yield* groupInstallTargetsByDirectory(installable, ws.baseDir) };
});

/**
 * Build the authored-creation step with the requirements this use case keeps
 * in `R`. The recipe pins one requirement set across the manager and the
 * closures, so naming it here is what lets the workspace facade and the agent
 * repository stay requirements instead of captured values.
 */
const authoredStep = <TRef extends ExtensionRef, TFacts extends MaterializationFacts>(
  manager: ExtensionManager<TRef, TFacts, ManagerRequirements>,
  args: NewExtensionOperationArgs<TRef, TFacts, AuthoringStepFailure, CreateExtensionRequirements>,
): PlannedJobStep<CreateExtensionRequirements | RecipeRequirements> =>
  buildNewExtensionStep<TRef, TFacts, AuthoringStepFailure, CreateExtensionRequirements>(
    manager,
    args,
  );

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/**
 * Settle a creation without writing anything.
 *
 * The create-only refusal runs here so a preview refuses an occupied name,
 * and again inside the transaction so a candidate that went stale between
 * preview and apply writes nothing.
 */
export const prepareCreateExtension: (
  request: CreateExtensionRequest,
) => Effect.Effect<
  CreateExtensionCandidate,
  CreateExtensionFailure,
  PrepareCreateExtensionRequirements
> = Effect.fn("CreateExtension.prepare")(function* (request) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const managers = yield* ExtensionManagers;
  const { subject, command } = route(request.type);

  const { owner, establish } = yield* resolveAuthoringOwner(
    { subject, command, name: request.name },
    request.owner,
  );

  if (!isValidScaffoldName(request.name)) {
    return yield* new ScaffoldNameInvalid({
      subject,
      name: request.name,
      pattern: SCAFFOLD_NAME_PATTERN.source,
      maxLength: SCAFFOLD_NAME_MAX_LENGTH,
    });
  }

  // Authored packages live in a project workspace; the user scope holds
  // acquired content only.
  if (ws.layout.scope !== "project") {
    return yield* new AuthoringScopeUnsupported({ subject, scope: ws.layout.scope });
  }

  const name = request.name;
  const scaffold = scaffoldFor(request, owner);
  const location = canonicalLocation(path, ws, request.type, owner, name);
  const authoredPath = path.relative(ws.baseDir, location);
  const settingsPath = settingsRelativePath(path, ws);
  const extensionName = decodeExtensionNameSync(name);
  const fqn = formatFqn({ owner, type: request.type, name: extensionName });
  const { isConfigured, declare } = declaration(ws, request.type, name);

  const createOnly = Effect.gen(function* () {
    yield* preflightCreateOnly({
      subject: scaffold.subject,
      name,
      configured: yield* isConfigured,
      destinations: [location],
    });
  });

  yield* createOnly;

  const contentTargets: ReadonlyArray<JobStepArtifactTarget> = scaffold.contentFiles.map(
    (file) => ({
      path: path.join(authoredPath, ...file.split("/")),
      change: "created" as const,
    }),
  );
  const settingsTarget: JobStepArtifactTarget = { path: settingsPath, change: "created" };
  const projected =
    request.type === "skill" ? yield* skillTargetLocations() : { installable: [], locations: [] };
  const projectionTargets: ReadonlyArray<JobStepArtifactTarget> = projected.locations.map(
    (target) => {
      const agentIds = artifactTargetAgentIds(target.agentIds);
      return {
        path: path.relative(ws.baseDir, path.join(target.targetDir, name)),
        change: "created" as const,
        ...(agentIds.length > 0 ? { agentIds } : {}),
      };
    },
  );
  const plannedArtifact: JobStepArtifact = {
    path: authoredPath,
    scope: ws.scope,
    version: scaffold.version,
    change: "created",
    fileCount: scaffold.contentFiles.length,
    targets: [...contentTargets, settingsTarget, ...projectionTargets],
  };

  const common = {
    toStepFailure: authoringStepFailure,
    versionRange: Option.none<string>(),
    label: fqn,
    message: `Created ${subject} ${fqn}`,
    plannedArtifact,
    preflight: Effect.gen(function* () {
      yield* recoverCanonicalDirectory({ baseDir: ws.baseDir, canonicalPath: location });
      yield* createOnly;
    }),
    scaffold: createCanonicalDirectory({
      baseDir: ws.baseDir,
      canonicalPath: location,
      subject: scaffold.subject,
      requiredFiles: scaffold.contentFiles,
      populate: scaffold.populate,
    }),
    markAuthored: establish.pipe(Effect.andThen(declare)),
  } as const;

  const sourceRef = {
    refType: "workspace",
    source: { type: "workspace", owner, extensionType: request.type, name: extensionName },
    scope: ws.scope,
    owner,
    name: extensionName,
    version: scaffold.version,
    sourceHash: computeSourceHash("scaffold"),
    location,
  } as const;

  const step = (() => {
    switch (request.type) {
      case "skill":
        return authoredStep(managers.skill, {
          ...common,
          ref: {
            ...sourceRef,
            type: "skill",
            source: { ...sourceRef.source, extensionType: "skill" as const },
            skill: { name: extensionName, description: Option.none(), metadata: Option.none() },
          },
          target: { type: "skill", name },
          buildArtifact: ({ installedBefore }) =>
            Effect.gen(function* () {
              const change: "created" | "updated" = installedBefore ? "updated" : "created";
              const { installable, locations } = yield* skillTargetLocations();
              const agents = artifactAgentIdsFromTargets(installable);
              return {
                path: authoredPath,
                scope: ws.scope,
                ...(agents.length > 0 ? { agents } : {}),
                version: scaffold.version,
                change,
                targets: [
                  { path: authoredPath, change },
                  { path: settingsPath, change },
                  ...locations.map((target) => {
                    const agentIds = artifactTargetAgentIds(target.agentIds);
                    return {
                      path: path.relative(ws.baseDir, path.join(target.targetDir, name)),
                      change,
                      ...(agentIds.length > 0 ? { agentIds } : {}),
                    };
                  }),
                ],
              } satisfies JobStepArtifact;
            }),
        });
      case "subagent":
        return authoredStep(managers.subagent, {
          ...common,
          ref: {
            ...sourceRef,
            type: "subagent",
            source: { ...sourceRef.source, extensionType: "subagent" as const },
            subagent: { name: extensionName, description: Option.none() },
          },
          target: { type: "subagent", name },
          buildArtifact: () => Effect.succeed(plannedArtifact),
        });
      case "rule":
        return authoredStep(managers.rule, {
          ...common,
          ref: {
            ...sourceRef,
            type: "rule",
            source: { ...sourceRef.source, extensionType: "rule" as const },
            rule: { name: extensionName },
          },
          target: { type: "rule", name },
          buildArtifact: () => Effect.succeed(plannedArtifact),
        });
      case "hook":
        return authoredStep(managers.hook, {
          ...common,
          ref: {
            ...sourceRef,
            type: "hook",
            source: { ...sourceRef.source, extensionType: "hook" as const },
            hook: { name: extensionName },
          },
          target: { type: "hook", name },
          buildArtifact: () =>
            Effect.gen(function* () {
              // A hook becomes observable through the shared agent hook
              // configurations, so its realized targets are the aggregate
              // projection's, not the package's own files.
              const observation = yield* managers.hook.aggregateProjectionObservation;
              const targets = observation.targets.map((target) => ({
                ...target,
                change: "created" as const,
              }));
              return {
                path: authoredPath,
                scope: ws.scope,
                version: scaffold.version,
                change: "created",
                ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
              } satisfies JobStepArtifact;
            }),
        });
      case "knowledge":
        return authoredStep(managers.knowledge, {
          ...common,
          ref: {
            ...sourceRef,
            type: "knowledge",
            source: { ...sourceRef.source, extensionType: "knowledge" as const },
            knowledge: { name: extensionName },
          },
          target: { type: "knowledge", name },
          buildArtifact: () => Effect.succeed(plannedArtifact),
        });
      case "pack":
        return authoredStep(managers.pack, {
          ...common,
          ref: {
            ...sourceRef,
            type: "pack",
            source: { ...sourceRef.source, extensionType: "pack" as const },
            pack: { name: extensionName, dependencies: {} },
          },
          target: { type: "pack", owner, name },
          buildArtifact: () => Effect.succeed(plannedArtifact),
        });
    }
  })();

  const plan: Plan<CreateExtensionRequirements> = {
    _tag: "Plan",
    name: createExtensionPlanName(request.type),
    description: Option.some(`Create ${fqn}`),
    presentation: operationPresentation(
      { imperative: "create", past: "Created", gerund: "Creating" },
      request.type,
    ),
    jobs: [{ concurrency: 1, steps: [step] }],
  };

  const execution = yield* prepareExecutionCandidate(plan);
  return {
    type: request.type,
    fqn,
    owner,
    name,
    authoredPath,
    entryPath: path.join(authoredPath, ...scaffold.entryFile.split("/")),
    settingsPath,
    execution,
  } satisfies CreateExtensionCandidate;
});

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** Preview or apply a settled creation, resolving to one operation outcome. */
export const previewOrApplyCreateExtension = (
  candidate: CreateExtensionCandidate,
  execution: PlanExecution,
) => resolveExecutionCandidate(candidate.execution, execution);

/** The creation use case: settle a request, then preview or apply it. */
export const CreateExtension = {
  prepare: prepareCreateExtension,
  previewOrApply: previewOrApplyCreateExtension,
} as const;
