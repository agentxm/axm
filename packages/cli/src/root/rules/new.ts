import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  buildNewExtensionStep,
  computeSourceHash,
  createCanonicalDirectory,
  recoverCanonicalDirectory,
  decodeExtensionNameSync,
  formatFqn,
  preflightCreateOnly,
  REGISTRY_EXTENSIONS_DIR,
} from "@agentxm/client-core/unstable/extensions";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import {
  RULE_BODY_FILENAME,
  RULE_EXTENSION_DIR,
  RULE_MANIFEST_FILENAME,
  RULE_MANIFEST_SCHEMA_URL,
  RuleManager,
  type RuleManifest,
} from "@agentxm/client-core/unstable/rules";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";

import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import {
  isValidScaffoldName,
  normalizeScaffoldOwner,
  scaffoldNameValidationSuggestion,
} from "../shared/scaffold-name.js";
import { emitScaffoldSuccess } from "../shared/scaffold-success.js";

/** Rule bodies live under `src/` alongside every other package-body type. */
const RULE_SOURCE_DIR = "src";

export const handleRulesNew = Effect.fn("RulesNew.handle")(function* (args: {
  readonly name: string;
  readonly owner: Option.Option<string>;
  readonly title: Option.Option<string>;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ws = yield* WorkspaceMutations;
  const manager = yield* RuleManager;
  const owner = Option.isSome(args.owner)
    ? normalizeScaffoldOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("rule creation");

  if (!isValidScaffoldName(args.name)) {
    return yield* makeAppError({
      code: "validation",
      detail: `Invalid rule name: "${args.name}"`,
      suggestions: [{ description: scaffoldNameValidationSuggestion }],
    });
  }

  const name = decodeExtensionNameSync(args.name);
  const version = decodeVersionSync("0.1.0");
  const fqn = formatFqn({ owner, type: "rule", name });
  const targetDir = path.join(ws.baseDir, REGISTRY_EXTENSIONS_DIR, owner, RULE_EXTENSION_DIR, name);
  const configuredRules = yield* ws.getConfiguredRuleEntries();
  yield* preflightCreateOnly({
    subject: "Rule",
    name,
    configured: Object.hasOwn(configuredRules, name),
    destinations: [],
  });

  const title = Option.getOrElse(args.title, () => name);
  const manifest: RuleManifest = {
    $schema: RULE_MANIFEST_SCHEMA_URL,
    owner,
    name,
    version,
    type: "rule",
    title,
  };
  const manifestPath = path.join(targetDir, RULE_MANIFEST_FILENAME);
  const bodyPath = path.join(targetDir, RULE_SOURCE_DIR, RULE_BODY_FILENAME);
  const artifact = {
    path: path.relative(ws.baseDir, targetDir),
    scope: ws.scope,
    version,
    change: "created" as const,
    fileCount: 2,
    targets: [
      { path: path.relative(ws.baseDir, manifestPath), change: "created" as const },
      { path: path.relative(ws.baseDir, bodyPath), change: "created" as const },
      { path: ".axm (config/lockfile)", change: "created" as const },
    ],
  };
  const scaffold = createCanonicalDirectory({
    baseDir: ws.baseDir,
    canonicalPath: targetDir,
    subject: "Rule",
    requiredFiles: [RULE_MANIFEST_FILENAME, `${RULE_SOURCE_DIR}/${RULE_BODY_FILENAME}`],
    populate: (stagingPath) => {
      const stagedManifestPath = path.join(stagingPath, RULE_MANIFEST_FILENAME);
      const stagedBodyPath = path.join(stagingPath, RULE_SOURCE_DIR, RULE_BODY_FILENAME);
      return Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(stagedBodyPath), { recursive: true }).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "internal",
              detail: `Failed to create rule directory: ${stagingPath}`,
              cause,
            }),
          ),
        );
        yield* fs.writeFileString(stagedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        yield* fs.writeFileString(
          stagedBodyPath,
          `# ${title}\n\nDescribe the behavior this rule asks agents to follow.\n`,
        );
      }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "AppError"
            ? cause
            : makeAppError({ code: "internal", detail: `Failed to scaffold ${fqn}`, cause }),
        ),
      );
    },
  }).pipe(
    Effect.asVoid,
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
  );

  const plan: Plan = {
    _tag: "Plan",
    name: "New rule",
    description: Option.some(`Create ${fqn}`),
    jobs: [
      {
        concurrency: 1,
        steps: [
          buildNewExtensionStep(manager, {
            target: { type: "rule", name },
            ref: {
              type: "rule",
              refType: "workspace",
              source: { type: "workspace", owner, extensionType: "rule", name },
              scope: ws.scope,
              owner,
              name,
              version,
              sourceHash: computeSourceHash("scaffold"),
              location: targetDir,
              rule: { name },
            },
            versionRange: Option.none(),
            label: fqn,
            message: `Created rule ${fqn}`,
            plannedArtifact: artifact,
            preflight: Effect.gen(function* () {
              const current = yield* ws.getConfiguredRuleEntries();
              yield* recoverCanonicalDirectory({
                baseDir: ws.baseDir,
                canonicalPath: targetDir,
              }).pipe(
                Effect.provideService(FileSystem.FileSystem, fs),
                Effect.provideService(Path.Path, path),
              );
              yield* preflightCreateOnly({
                subject: "Rule",
                name,
                configured: Object.hasOwn(current, name),
                destinations: [targetDir],
              }).pipe(Effect.provideService(FileSystem.FileSystem, fs));
            }),
            scaffold,
            markAuthored: ws.setRuleEntry(name, {
              source: `workspace:${fqn}`,
              enabled: true,
            }),
            buildArtifact: () => Effect.succeed(artifact),
          }),
        ],
      },
    ],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    yes: args.yes,
    displayApplied: false,
  });
  const summary = `-> ${joinDisplayPath(path, path.relative(ws.baseDir, targetDir))}   ${version} | 2 files`;
  const suggestions = [
    {
      description: `Write the rule body in \`${joinDisplayPath(path, path.relative(ws.baseDir, targetDir), RULE_SOURCE_DIR, RULE_BODY_FILENAME)}\``,
    },
  ];
  const emitted = yield* emitPlanResolutionResult(
    "rules.new",
    resolution,
    resolution._tag === "ExecutedPlan" ? { summary, suggestions } : undefined,
  );
  if (resolution._tag === "ExecutedPlan") {
    yield* emitScaffoldSuccess({
      message: `Created rule ${fqn}`,
      summary,
      suggestions,
      withoutSuggestions: emitted,
    });
  }
});

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the rule (without owner)")),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g., @acme)"),
    Flag.optional,
  ),
  title: Flag.string("title").pipe(
    Flag.withDescription("Display title for the rule"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create the rule without confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be created without writing files"),
  ),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, title, yes, preview }) =>
  handleRulesNew({ name, owner, title, yes, preview }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withRuntime("rules new"),
  ),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new rule in the project-workspace authoring root"),
  Command.withExamples([
    { command: "axm rules new commit-style", description: "Scaffold a new rule" },
    {
      command: "axm rules new commit-style --owner @acme",
      description: "Create a rule under a specific owner",
    },
  ]),
);
