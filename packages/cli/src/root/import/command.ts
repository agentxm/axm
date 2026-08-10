import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  REGISTRY_EXTENSIONS_DIR,
  buildAuthoredExtensionStep,
  computePackageContentHash,
  copyExtensionDirectory,
  extensionTypeToPlural,
  formatFqn,
  fqnInvalidErrorToAppError,
  importNativeExtensionPackage,
  parseFqn,
  preflightCreateOnly,
} from "@agentxm/client-core/unstable/extensions";
import type { JobStepArtifact, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import {
  acquireExternalSource,
  resolveSource,
} from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export const handleImport = Effect.fn("Import.handle")(function* (args: {
  readonly source: string;
  readonly target: string;
  readonly enable: boolean;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const target = yield* Effect.fromResult(
    Result.mapError(parseFqn(args.target), fqnInvalidErrorToAppError),
  );
  if (target.type === "mcp-server") {
    return yield* makeAppError({
      code: "usage",
      detail: "Use axm mcps import --as <target-fqn> for native MCP package conversion",
    });
  }
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = yield* resolveSource(args.source);
  const acquired = yield* acquireExternalSource(source);
  const targetDir = path.join(
    ws.baseDir,
    REGISTRY_EXTENSIONS_DIR,
    target.owner,
    extensionTypeToPlural[target.type],
    target.name,
  );
  yield* preflightCreateOnly({
    subject: "Import target",
    name: target.name,
    configured: false,
    destinations: [targetDir],
  });

  const stagingRoot = yield* fs.makeTempDirectoryScoped({ prefix: "axm-import-" }).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: "Import staging directory could not be created",
        cause,
      }),
    ),
  );
  const stagedPackage = path.join(stagingRoot, "package");
  yield* importNativeExtensionPackage({
    sourcePath: acquired.directory,
    targetDir: stagedPackage,
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
    case "knowledge": {
      const current = yield* ws.getConfiguredKnowledgeEntries();
      enabled = args.enable || (current[target.name]?.enabled ?? false);
      markAuthored = ws.setKnowledgeEntry(target.name, { source: sourceLocator, enabled: true });
      finalizeAuthored = ws.setKnowledgeEntry(target.name, { source: sourceLocator, enabled });
      break;
    }
    case "hook":
    case "pack":
      return yield* makeAppError({
        code: "usage",
        detail: `Native ${target.type} import has no lossless supported representation`,
      });
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
    label: `Import ${acquired.origin} -> ${fqn}`,
    message: `Imported ${fqn}`,
    enabled,
    allowConfiguredSourceTransition: true,
    markAuthored,
    finalizeAuthored,
    plannedArtifact: artifact,
    buildArtifact: () => Effect.succeed(artifact),
    preflight: preflightCreateOnly({
      subject: "Import target",
      name: target.name,
      configured: false,
      destinations: [targetDir],
    }).pipe(Effect.provideService(FileSystem.FileSystem, fs)),
    scaffold: Effect.gen(function* () {
      const currentHash = yield* computePackageContentHash(stagedPackage);
      if (currentHash !== stagedHash) {
        return yield* makeAppError({
          code: "conflict",
          detail: "Prepared import content changed before it could be applied",
        });
      }
      yield* copyExtensionDirectory(stagedPackage, targetDir).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Prepared import could not be written to ${targetDir}`,
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
    case "knowledge":
      step = buildAuthoredExtensionStep(yield* KnowledgeManager, {
        ...common,
        target: { type: "knowledge", name: target.name },
      });
      break;
  }

  const plan: Plan = {
    _tag: "Plan",
    name: "Import native extension",
    description: Option.some(
      `Losslessly convert ${acquired.origin} into ${fqn}; the native source remains unchanged and the import starts ${enabled ? "enabled" : "disabled"}`,
    ),
    jobs: [{ concurrency: 1, steps: [step] }],
  };
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("import", resolution);
});

const config = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Local or Git native extension source"),
  ),
  target: Argument.string("target").pipe(Argument.withDescription("New managed target FQN")),
  enable: Flag.boolean("enable").pipe(
    Flag.withDescription("Enable and materialize a newly imported extension"),
  ),
  yes: yesFlag,
  preview: previewFlag,
} as const;

export const importCommand = Command.make("import", config, (parsed) =>
  handleImport(parsed).pipe(Effect.scoped, withWorkspace("project"), withRuntime("import")),
).pipe(
  withArgvTracking(config),
  Command.withDescription("Convert unmanaged/native content into a project-workspace AXM package"),
  Command.withExamples([
    {
      command: "axm import .claude/agents/reviewer.md @me/subagents/reviewer",
      description: "Import a native subagent without modifying the original file",
    },
    {
      command: "axm import ./review-skill @me/skills/review --enable",
      description: "Import and enable a native skill",
    },
  ]),
);
