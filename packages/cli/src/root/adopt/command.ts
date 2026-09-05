import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command } from "effect/unstable/cli";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { makeAppError } from "../../app-error/index.js";
import { isNonInteractiveOptional } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { installMcpServer } from "@agentxm/extension-lifecycle";
import { buildAuthoredExtensionStep } from "@agentxm/extension-workspace";
import {
  extensionTypeToPlural,
  formatFqn,
  parseFqn,
} from "@agentxm/extension-model/unstable/extensions";
import {
  failureToStepFailure,
  fqnInvalidErrorToAppError,
  toAppError,
} from "../../app-error/conversions.js";
import type { JobStepArtifact, Plan } from "@agentxm/workspace-operations";
import { previewOrApplyPlan, operationPresentation } from "@agentxm/workspace-operations";
import {
  protectCreatedAncestors,
  WorkspaceMutations,
  resolveWorkspaceExtensionRef,
} from "@agentxm/workspace-state";

import { emitOperationResolution } from "../../operation-output.js";
import { provideLifecycleFailureAdapter } from "../../feature-errors.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { requireAuthoredOwner } from "../shared/authored-owner.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import {
  CodingAgentRepository,
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
  RuleManager,
  SkillManager,
  SubagentManager,
} from "@agentxm/extension-workspace";

const adoptStep = Effect.fn("Adopt.step")(function* (fqnInput: string) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const parsed = yield* Effect.fromResult(
    Result.mapError(parseFqn(fqnInput), fqnInvalidErrorToAppError),
  );
  if (ws.layout.scope !== "project") {
    return yield* makeAppError({
      code: "usage",
      detail: "Adopt is project-workspace only",
    });
  }
  yield* requireAuthoredOwner(parsed.owner);
  const fqn = formatFqn(parsed);
  const sourceDir = path.join(
    ws.layout.acquiredRoot,
    "agentxm",
    parsed.owner,
    extensionTypeToPlural[parsed.type],
    parsed.name,
  );
  const targetDir = path.join(ws.layout.authoredRoot(parsed.type), parsed.name);
  const enabled = yield* Effect.gen(function* () {
    switch (parsed.type) {
      case "skill":
        return (yield* ws.getConfiguredSkillEntries())[parsed.name]?.enabled ?? true;
      case "mcp-server":
        return (yield* ws.getConfiguredMcpServerEntries())[parsed.name]?.enabled ?? true;
      case "subagent":
        return (yield* ws.getConfiguredSubagentEntries())[parsed.name]?.enabled ?? true;
      case "rule":
        return (yield* ws.getConfiguredRuleEntries())[parsed.name]?.enabled ?? true;
      case "hook":
        return (yield* ws.getConfiguredHookEntries())[parsed.name]?.enabled ?? true;
      case "knowledge":
        return (yield* ws.getConfiguredKnowledgeEntries())[parsed.name]?.enabled ?? true;
      case "pack":
        return (yield* ws.getConfiguredPackEntries())[parsed.name]?.enabled ?? true;
    }
  }).pipe(Effect.mapError(toAppError));
  const setAuthoredActivation = (active: boolean) => {
    const entry = { source: "workspace" as const, enabled: active };
    switch (parsed.type) {
      case "skill":
        return ws.setSkillEntry(parsed.name, entry).pipe(Effect.mapError(toAppError));
      case "mcp-server":
        return ws
          .setMcpServerEntry(parsed.name, { ...entry, env: {} })
          .pipe(Effect.mapError(toAppError));
      case "subagent":
        return ws.setSubagentEntry(parsed.name, entry).pipe(Effect.mapError(toAppError));
      case "rule":
        return ws.setRuleEntry(parsed.name, entry).pipe(Effect.mapError(toAppError));
      case "hook":
        return ws.setHookEntry(parsed.name, entry).pipe(Effect.mapError(toAppError));
      case "knowledge":
        return ws.setKnowledgeEntry(parsed.name, entry).pipe(Effect.mapError(toAppError));
      case "pack":
        return ws.setPackEntry(parsed.name, entry).pipe(Effect.mapError(toAppError));
    }
  };
  const retireExternalResolution = Effect.gen(function* () {
    switch (parsed.type) {
      case "skill":
        return yield* ws.removeSkillLock(parsed.name);
      case "mcp-server":
        // Resolve the old connection before its workspace declaration replaces
        // it, preserving any resolution still shared by another connection.
        return yield* ws.removeMcpServer(parsed.name);
      case "subagent":
        return yield* ws.removeSubagentLock(parsed.name);
      case "rule":
        return yield* ws.removeRuleLock(parsed.name);
      case "hook":
        return yield* ws.removeHookLock(parsed.name);
      case "knowledge":
        return yield* ws.removeKnowledgeLock(parsed.name);
      case "pack":
        return yield* ws.removePackLock(parsed.name);
    }
  }).pipe(Effect.mapError(toAppError));
  const preflight = Effect.gen(function* () {
    const targetExists = yield* fs
      .exists(targetDir)
      .pipe(
        Effect.mapError((cause) =>
          makeAppError({ code: "internal", detail: `Could not inspect ${targetDir}`, cause }),
        ),
      );
    if (targetExists) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Authored target already exists at ${targetDir}`,
      });
    }
    yield* resolveWorkspaceExtensionRef({
      settingsName: parsed.name,
      source: "workspace",
      expectedType: parsed.type,
      layout: ws.layout,
      scope: ws.scope,
      staticPackage: { owner: parsed.owner, name: parsed.name, root: sourceDir },
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
  }).pipe(Effect.asVoid);
  const artifact: JobStepArtifact = {
    path: path.relative(ws.baseDir, targetDir),
    scope: ws.scope,
    change: "created",
    targets: [
      { path: path.relative(ws.baseDir, sourceDir), change: "removed" },
      { path: path.relative(ws.baseDir, targetDir), change: "created" },
      { path: workspaceSettingsPath(ws.scope), change: "updated" },
    ],
  };
  const common = {
    location: targetDir,
    transactionTargets: [sourceDir],
    versionRange: Option.none<string>(),
    label: `Adopt ${fqn}`,
    message: `Adopted ${fqn}`,
    enabled,
    allowConfiguredSourceTransition: true,
    markAuthored: Effect.andThen(retireExternalResolution, setAuthoredActivation(true)),
    finalizeAuthored: setAuthoredActivation(enabled),
    plannedArtifact: artifact,
    buildArtifact: () => Effect.succeed(artifact),
    preflight,
    scaffold: Effect.gen(function* () {
      yield* protectCreatedAncestors(fs, path, path.dirname(targetDir));
      yield* fs.makeDirectory(path.dirname(targetDir), { recursive: true });
      yield* fs.rename(sourceDir, targetDir);
    }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Could not move ${fqn} into authored package storage`,
          cause,
        }),
      ),
    ),
  };
  switch (parsed.type) {
    case "skill":
      return buildAuthoredExtensionStep(yield* SkillManager, {
        toStepFailure: failureToStepFailure,
        ...common,
        target: { type: "skill", name: parsed.name },
      });
    case "mcp-server": {
      const agentRepo = yield* CodingAgentRepository;
      const httpClient = yield* HttpClient.HttpClient;
      const nonInteractive = yield* isNonInteractiveOptional;
      return buildAuthoredExtensionStep(yield* McpServerManager, {
        toStepFailure: failureToStepFailure,
        ...common,
        target: { type: "mcp-server", name: parsed.name },
        materializeInstall: (ref) =>
          installMcpServer({
            name: "install-mcp-server",
            args: {
              ref,
              nonInteractive,
              force: false,
              allowWorkspaceSourceTransition: true,
              versionRange: Option.none(),
              skipSettings: Option.none(),
              skipStateWrites: true,
              env: Option.none(),
            },
          }).pipe(
            Effect.asVoid,
            Effect.mapError(toAppError),
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
            Effect.provideService(WorkspaceMutations, ws),
            Effect.provideService(CodingAgentRepository, agentRepo),
            Effect.provideService(HttpClient.HttpClient, httpClient),
            provideLifecycleFailureAdapter,
          ),
      });
    }
    case "subagent":
      return buildAuthoredExtensionStep(yield* SubagentManager, {
        toStepFailure: failureToStepFailure,
        ...common,
        target: { type: "subagent", name: parsed.name },
      });
    case "rule":
      return buildAuthoredExtensionStep(yield* RuleManager, {
        toStepFailure: failureToStepFailure,
        ...common,
        target: { type: "rule", name: parsed.name },
      });
    case "hook":
      return buildAuthoredExtensionStep(yield* HookManager, {
        toStepFailure: failureToStepFailure,
        ...common,
        target: { type: "hook", name: parsed.name },
      });
    case "knowledge":
      return buildAuthoredExtensionStep(yield* KnowledgeManager, {
        toStepFailure: failureToStepFailure,
        ...common,
        target: { type: "knowledge", name: parsed.name },
      });
    case "pack":
      return buildAuthoredExtensionStep(yield* PackManager, {
        toStepFailure: failureToStepFailure,
        ...common,
        target: { type: "pack", name: parsed.name, owner: parsed.owner },
      });
  }
});

export interface AdoptHandlerArgs {
  readonly fqn: string;
  readonly preview: boolean;
}

export const handleAdopt = (args: AdoptHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "adopt",
      mode: args.preview ? "preview" : "apply",
      planName: "Adopt workspace extension",
    },
    handleAdoptBody(args),
  );

const handleAdoptBody = Effect.fn("Adopt.handle")(function* (args: AdoptHandlerArgs) {
  const step = yield* adoptStep(args.fqn);
  const plan: Plan = {
    _tag: "Plan",
    name: "Adopt workspace extension",
    description: Option.some(
      "Adopt the canonical package as authoritative workspace source content",
    ),
    presentation: operationPresentation({
      imperative: "adopt",
      past: "Adopted",
      gerund: "Adopting",
    }),
    jobs: [{ concurrency: 1, steps: [step] }],
  };
  const execution = yield* makePublicPositionalPlanExecution(
    { preview: args.preview },
    ["adopt"],
    [args.fqn],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("adopt", resolution);
});

const config = {
  fqn: Argument.string("extension").pipe(
    Argument.withDescription("Canonical extension FQN (@owner/<plural-type>/name)"),
  ),
  preview: previewCapabilityFlag(),
} as const;

export const adoptCommand = Command.make("adopt", config, ({ fqn, preview }) =>
  handleAdopt({ fqn, preview }).pipe(withWorkspace("project"), withRuntime("adopt")),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Adopt a canonical package into project-workspace authorship"),
  Command.withExamples([
    {
      command: "axm adopt @acme/skills/code-review",
      description: "Adopt an unmanaged or retained package for authoring",
    },
  ]),
);
