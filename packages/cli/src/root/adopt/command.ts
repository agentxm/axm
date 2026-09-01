import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { buildAuthoredExtensionStep } from "@agentxm/extension-management/unstable/extensions";
import {
  extensionTypeToPlural,
  formatFqn,
  parseFqn,
} from "@agentxm/extension-model/unstable/extensions";
import {
  fqnInvalidErrorToAppError,
  toAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";
import type { JobStepArtifact, Plan } from "@agentxm/workspace-operations";
import { previewOrApplyPlan, operationPresentation } from "@agentxm/workspace-operations";
import {
  protectCreatedAncestors,
  WorkspaceMutations,
  resolveWorkspaceExtensionRef,
} from "@agentxm/workspace-state";

import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { requireAuthoredOwner } from "../shared/authored-owner.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import {
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
  const markAuthored = (() => {
    const entry = { source: "workspace" as const, enabled: true };
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
  })();
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
    enabled: true,
    allowConfiguredSourceTransition: true,
    markAuthored,
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
        ...common,
        target: { type: "skill", name: parsed.name },
      });
    case "mcp-server":
      return buildAuthoredExtensionStep(yield* McpServerManager, {
        ...common,
        target: { type: "mcp-server", name: parsed.name },
      });
    case "subagent":
      return buildAuthoredExtensionStep(yield* SubagentManager, {
        ...common,
        target: { type: "subagent", name: parsed.name },
      });
    case "rule":
      return buildAuthoredExtensionStep(yield* RuleManager, {
        ...common,
        target: { type: "rule", name: parsed.name },
      });
    case "hook":
      return buildAuthoredExtensionStep(yield* HookManager, {
        ...common,
        target: { type: "hook", name: parsed.name },
      });
    case "knowledge":
      return buildAuthoredExtensionStep(yield* KnowledgeManager, {
        ...common,
        target: { type: "knowledge", name: parsed.name },
      });
    case "pack":
      return buildAuthoredExtensionStep(yield* PackManager, {
        ...common,
        target: { type: "pack", name: parsed.name, owner: parsed.owner },
      });
  }
});

export const handleAdopt = (args: {
  readonly fqn: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) =>
  withOperationLifecycle(
    {
      command: "adopt",
      mode: args.preview ? "preview" : "apply",
      planName: "Adopt workspace extension",
    },
    handleAdoptBody(args),
  );

const handleAdoptBody = Effect.fn("Adopt.handle")(function* (args: {
  readonly fqn: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
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
  const execution = yield* makePublicPositionalPlanExecution(args, ["adopt"], [args.fqn]);
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("adopt", resolution);
});

const config = {
  fqn: Argument.string("extension").pipe(
    Argument.withDescription("Canonical extension FQN (@owner/<plural-type>/name)"),
  ),
  yes: yesFlag,
  preview: previewFlag,
} as const;

export const adoptCommand = Command.make("adopt", config, ({ fqn, yes, preview }) =>
  handleAdopt({ fqn, yes, preview }).pipe(withWorkspace("project"), withRuntime("adopt")),
).pipe(
  withArgvTracking(config),
  Command.withDescription("Adopt a canonical package into project-workspace authorship"),
  Command.withExamples([
    {
      command: "axm adopt @acme/skills/code-review",
      description: "Adopt an unmanaged or retained package for authoring",
    },
  ]),
);
