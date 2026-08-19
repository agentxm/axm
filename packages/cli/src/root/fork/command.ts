import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import { installMcpServer, McpServerManager } from "@agentxm/client-core/unstable/mcps";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";
import {
  REGISTRY_EXTENSIONS_DIR,
  buildAuthoredExtensionStep,
  computePackageContentHash,
  copyExtensionDirectory,
  extensionTypeFromPlural,
  extensionTypeToPlural,
  formatFqn,
  forkExtensionPackage,
  fqnInvalidErrorToAppError,
  parseFqn,
  parseRegistrySourcePatternParts,
  preflightCreateOnly,
  type ExtensionFqnParts,
} from "@agentxm/client-core/unstable/extensions";
import type { JobStepArtifact, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import {
  SourceHostProviders,
  findExtensionPackagesFromSource,
  inspectExtensionPackage,
  resolveSource,
  type ExtensionPackageFilter,
  type ResolvedExtensionPackage,
} from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";

const exactFilter = (fqn: ExtensionFqnParts): ExtensionPackageFilter => ({
  names: [fqn.name],
  owner: Option.some(fqn.owner),
  type: fqn.type,
});

const filterForSource = (
  sourceInput: string,
  from: Option.Option<string>,
): Effect.Effect<ExtensionPackageFilter, ReturnType<typeof fqnInvalidErrorToAppError>> => {
  if (Option.isSome(from)) {
    return Effect.fromResult(Result.mapError(parseFqn(from.value), fqnInvalidErrorToAppError)).pipe(
      Effect.map(exactFilter),
    );
  }
  const registry = parseRegistrySourcePatternParts(sourceInput);
  if (registry?.type !== undefined && registry.name !== undefined) {
    return Effect.succeed({
      names: [registry.name],
      owner: Option.some(registry.owner),
      type: extensionTypeFromPlural[registry.type],
    });
  }
  return Effect.succeed({ names: [], owner: Option.none(), type: "*" });
};

const selectPackage = (
  packages: ReadonlyArray<ResolvedExtensionPackage>,
): Effect.Effect<ResolvedExtensionPackage, ReturnType<typeof makeAppError>> => {
  const candidate = packages[0];
  if (candidate === undefined) {
    return makeAppError({
      code: "not_found",
      detail:
        "No managed AXM extension package was found; use skills import or subagents import for supported unmanaged/native content",
    });
  }
  if (packages.length > 1) {
    return makeAppError({
      code: "validation",
      detail: "The source contains multiple AXM packages; select one with --from <FQN>",
    });
  }
  return Effect.succeed(candidate);
};

export const handleFork = Effect.fn("Fork.handle")(function* (args: {
  readonly source: string;
  readonly target: string;
  readonly from: Option.Option<string>;
  readonly enable: boolean;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const target = yield* Effect.fromResult(
    Result.mapError(parseFqn(args.target), fqnInvalidErrorToAppError),
  );
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const providers = yield* SourceHostProviders;
  const httpClient = yield* HttpClient.HttpClient;
  const source = yield* resolveSource(args.source);
  const filter = yield* filterForSource(args.source, args.from);
  const packages =
    source.type === "workspace"
      ? [
          {
            ...(yield* inspectExtensionPackage(
              path.join(
                ws.baseDir,
                REGISTRY_EXTENSIONS_DIR,
                source.owner,
                extensionTypeToPlural[source.extensionType],
                source.name,
              ),
            )),
            origin: providers.origin(source),
          },
        ].filter((candidate) =>
          filter.type !== "*" && filter.type !== candidate.identity.type
            ? false
            : filter.names.length > 0 && !filter.names.includes(candidate.identity.name)
              ? false
              : Option.isNone(filter.owner) || filter.owner.value === candidate.identity.owner,
        )
      : yield* findExtensionPackagesFromSource(source, filter);
  const selected = yield* selectPackage(packages);

  const targetDir = path.join(
    ws.baseDir,
    REGISTRY_EXTENSIONS_DIR,
    target.owner,
    extensionTypeToPlural[target.type],
    target.name,
  );
  yield* preflightCreateOnly({
    subject: "Fork target",
    name: target.name,
    configured: false,
    destinations: [targetDir],
  });

  const stagingRoot = yield* fs.makeTempDirectoryScoped({ prefix: "axm-fork-" }).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: "Fork staging directory could not be created",
        cause,
      }),
    ),
  );
  const stagedPackage = path.join(stagingRoot, "package");
  yield* forkExtensionPackage({
    sourceDir: selected.directory,
    targetDir: stagedPackage,
    sourceIdentity: selected.identity,
    target,
  });
  const stagedHash = yield* computePackageContentHash(stagedPackage);
  const fqn = formatFqn(target);
  const sourceLocator = `workspace:${fqn}`;

  let enabled: boolean;
  let markAuthored: Effect.Effect<void, ReturnType<typeof makeAppError>>;
  let finalizeAuthored: Effect.Effect<void, ReturnType<typeof makeAppError>>;
  switch (target.type) {
    case "skill": {
      const current = yield* ws.getConfiguredSkillEntries();
      enabled = args.enable || (current[target.name]?.enabled ?? false);
      markAuthored = ws.setSkillEntry(target.name, { source: sourceLocator, enabled: true });
      finalizeAuthored = ws.setSkillEntry(target.name, { source: sourceLocator, enabled });
      break;
    }
    case "mcp-server": {
      const current = yield* ws.getConfiguredMcpServerEntries();
      const existing = current[target.name];
      enabled = args.enable || (existing?.enabled ?? false);
      markAuthored = ws.setMcpServerEntry(target.name, {
        source: sourceLocator,
        enabled: true,
        env: existing?.env ?? {},
      });
      finalizeAuthored = ws.setMcpServerEntry(target.name, {
        source: sourceLocator,
        enabled,
        env: existing?.env ?? {},
      });
      break;
    }
    case "subagent": {
      const current = yield* ws.getConfiguredSubagentEntries();
      enabled = args.enable || (current[target.name]?.enabled ?? false);
      markAuthored = ws.setSubagentEntry(target.name, { source: sourceLocator, enabled: true });
      finalizeAuthored = ws.setSubagentEntry(target.name, { source: sourceLocator, enabled });
      break;
    }
    case "rule": {
      const current = yield* ws.getConfiguredRuleEntries();
      enabled = args.enable || (current[target.name]?.enabled ?? false);
      markAuthored = ws.setRuleEntry(target.name, { source: sourceLocator, enabled: true });
      finalizeAuthored = ws.setRuleEntry(target.name, { source: sourceLocator, enabled });
      break;
    }
    case "hook": {
      const current = yield* ws.getConfiguredHookEntries();
      enabled = args.enable || (current[target.name]?.enabled ?? false);
      markAuthored = ws.setHookEntry(target.name, { source: sourceLocator, enabled: true });
      finalizeAuthored = ws.setHookEntry(target.name, { source: sourceLocator, enabled });
      break;
    }
    case "knowledge": {
      const current = yield* ws.getConfiguredKnowledgeEntries();
      enabled = args.enable || (current[target.name]?.enabled ?? false);
      markAuthored = ws.setKnowledgeEntry(target.name, { source: sourceLocator, enabled: true });
      finalizeAuthored = ws.setKnowledgeEntry(target.name, { source: sourceLocator, enabled });
      break;
    }
    case "pack": {
      const current = yield* ws.getConfiguredPackEntries();
      enabled = args.enable || (current[target.name]?.enabled ?? false);
      markAuthored = ws.setPackEntry(target.name, { source: sourceLocator, enabled: true });
      finalizeAuthored = ws.setPackEntry(target.name, { source: sourceLocator, enabled });
      break;
    }
  }

  const artifact: JobStepArtifact = {
    path: path.relative(ws.baseDir, targetDir),
    scope: ws.scope,
    version: "0.1.0",
    change: "created",
    targets: [
      { path: path.relative(ws.baseDir, targetDir), change: "created" },
      { path: ".axm (config/lockfile)", change: "created" },
    ],
  };
  const common = {
    location: targetDir,
    versionRange: Option.none<string>(),
    label: `Fork ${selected.identity.owner}/${extensionTypeToPlural[selected.identity.type]}/${selected.identity.name} -> ${fqn}`,
    message: `Forked ${fqn}`,
    enabled,
    allowConfiguredSourceTransition: true,
    markAuthored,
    finalizeAuthored,
    plannedArtifact: artifact,
    buildArtifact: () => Effect.succeed(artifact),
    preflight: preflightCreateOnly({
      subject: "Fork target",
      name: target.name,
      configured: false,
      destinations: [targetDir],
    }).pipe(Effect.provideService(FileSystem.FileSystem, fs)),
    scaffold: Effect.gen(function* () {
      const currentHash = yield* computePackageContentHash(stagedPackage);
      if (currentHash !== stagedHash) {
        return yield* makeAppError({
          code: "conflict",
          detail: "Prepared fork content changed before it could be applied",
        });
      }
      yield* copyExtensionDirectory(stagedPackage, targetDir).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Prepared fork could not be written to ${targetDir}`,
            cause,
          }),
        ),
      );
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };

  let step: PlannedJobStep;
  switch (target.type) {
    case "skill":
      step = buildAuthoredExtensionStep(yield* SkillManager, {
        ...common,
        target: { type: "skill", name: target.name },
      });
      break;
    case "mcp-server": {
      const renderer = yield* CliRenderer;
      const agentRepo = yield* CodingAgentRepository;
      step = buildAuthoredExtensionStep(yield* McpServerManager, {
        ...common,
        target: { type: "mcp-server", name: target.name },
        materializeInstall: (ref) =>
          installMcpServer({
            name: "install-mcp-server",
            args: {
              ref,
              force: false,
              allowWorkspaceSourceTransition: true,
              versionRange: Option.none(),
              skipSettings: Option.none(),
              skipStateWrites: true,
              env: Option.none(),
            },
          }).pipe(
            Effect.asVoid,
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
            Effect.provideService(WorkspaceMutations, ws),
            Effect.provideService(CliRenderer, renderer),
            Effect.provideService(CodingAgentRepository, agentRepo),
            Effect.provideService(HttpClient.HttpClient, httpClient),
          ),
      });
      break;
    }
    case "subagent":
      step = buildAuthoredExtensionStep(yield* SubagentManager, {
        ...common,
        target: { type: "subagent", name: target.name },
      });
      break;
    case "rule":
      step = buildAuthoredExtensionStep(yield* RuleManager, {
        ...common,
        target: { type: "rule", name: target.name },
      });
      break;
    case "hook":
      step = buildAuthoredExtensionStep(yield* HookManager, {
        ...common,
        target: { type: "hook", name: target.name },
      });
      break;
    case "knowledge":
      step = buildAuthoredExtensionStep(yield* KnowledgeManager, {
        ...common,
        target: { type: "knowledge", name: target.name },
      });
      break;
    case "pack":
      step = buildAuthoredExtensionStep(yield* PackManager, {
        ...common,
        target: { type: "pack", owner: target.owner, name: target.name },
      });
      break;
  }

  const plan: Plan = {
    _tag: "Plan",
    name: "Fork AXM extension package",
    description: Option.some(
      `Create ${fqn} from ${selected.origin}; the source remains unchanged and the fork starts ${enabled ? "enabled" : "disabled"}`,
    ),
    jobs: [{ concurrency: 1, steps: [step] }],
  };
  const execution = yield* makePlanExecution(
    args,
    makeConfirmationRecovery(
      ["fork"],
      [
        ...Option.match(args.from, {
          onNone: () => [],
          onSome: (value) => [recoveryOption("--from", publicRecoveryValue(value))],
        }),
        recoverySwitch("--enable", args.enable),
        recoveryPositional(credentialFreeLocatorRecoveryValue(args.source)),
        recoveryPositional(publicRecoveryValue(args.target)),
      ],
    ),
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitPlanResolutionResult("fork", resolution);
});

const config = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Registry, workspace, local, or Git AXM package source"),
  ),
  target: Argument.string("extension").pipe(Argument.withDescription("New target FQN")),
  from: Flag.string("from").pipe(
    Flag.withDescription("Source package FQN when the source contains multiple packages"),
    Flag.optional,
  ),
  enable: Flag.boolean("enable").pipe(
    Flag.withDescription("Enable and materialize a newly forked extension"),
    Flag.withDefault(false),
  ),
  yes: yesFlag,
  preview: previewFlag,
} as const;

export const forkCommand = Command.make("fork", config, (parsed) =>
  handleFork(parsed).pipe(Effect.scoped, withWorkspace("project"), withRuntime("fork")),
).pipe(
  withArgvTracking(config),
  Command.withDescription("Fork a managed AXM package into project-workspace authorship"),
  Command.withExamples([
    {
      command: "axm fork @acme/skills/review @me/skills/review-custom",
      description: "Fork a Registry skill as a disabled workspace-authored package",
    },
    {
      command:
        "axm fork ./extensions @me/hooks/check-policy --from @acme/hooks/check-policy --enable",
      description: "Fork one package from a local collection and enable it",
    },
  ]),
);
