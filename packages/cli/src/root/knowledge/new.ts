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
  decodeExtensionNameSync,
  formatFqn,
  preflightCreateOnly,
  REGISTRY_EXTENSIONS_DIR,
} from "@agentxm/client-core/unstable/extensions";
import {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_MANIFEST_SCHEMA_URL,
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManager,
  type KnowledgeManifest,
} from "@agentxm/client-core/unstable/knowledge";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";

import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { normalizeScaffoldOwner } from "../shared/scaffold-name.js";
import { emitScaffoldSuccess } from "../shared/scaffold-success.js";

export const handleKnowledgeNew = Effect.fn("KnowledgeNew.handle")(function* (args: {
  readonly name: string;
  readonly owner: Option.Option<string>;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ws = yield* WorkspaceMutations;
  const manager = yield* KnowledgeManager;
  const owner = Option.isSome(args.owner)
    ? normalizeScaffoldOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("knowledge bundle creation");
  const name = decodeExtensionNameSync(args.name);
  const version = decodeVersionSync("0.1.0");
  const fqn = formatFqn({ owner, type: "knowledge", name });
  const targetDir = path.join(
    ws.baseDir,
    REGISTRY_EXTENSIONS_DIR,
    owner,
    KNOWLEDGE_EXTENSION_DIR,
    name,
  );
  const configuredKnowledge = yield* ws.getConfiguredKnowledgeEntries();
  yield* preflightCreateOnly({
    subject: "Knowledge bundle",
    name,
    configured: Object.hasOwn(configuredKnowledge, name),
    destinations: [targetDir],
  });

  const manifest: KnowledgeManifest = {
    $schema: KNOWLEDGE_MANIFEST_SCHEMA_URL,
    owner,
    name,
    version,
    type: "knowledge",
    format: { name: "okf", version: "0.2" },
    bundleRoot: KNOWLEDGE_SOURCE_DIR,
  };
  const manifestPath = path.join(targetDir, KNOWLEDGE_MANIFEST_FILENAME);
  const indexPath = path.join(targetDir, KNOWLEDGE_SOURCE_DIR, "index.md");
  const artifact = {
    path: path.relative(ws.baseDir, targetDir),
    scope: ws.scope,
    version,
    change: "created" as const,
    fileCount: 2,
    targets: [
      { path: path.relative(ws.baseDir, manifestPath), change: "created" as const },
      { path: path.relative(ws.baseDir, indexPath), change: "created" as const },
      { path: ".axm (config/lockfile)", change: "created" as const },
    ],
  };
  const scaffold = Effect.gen(function* () {
    yield* fs.makeDirectory(path.dirname(indexPath), { recursive: true }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create knowledge bundle directory: ${targetDir}`,
          cause,
        }),
      ),
    );
    yield* fs.writeFileString(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    yield* fs.writeFileString(
      indexPath,
      `---\nokf_version: "0.2"\n---\n# ${name}\n\nDescribe this knowledge bundle and link its concepts here.\n`,
    );
  }).pipe(
    Effect.mapError((cause) =>
      cause._tag === "AppError"
        ? cause
        : makeAppError({ code: "internal", detail: `Failed to scaffold ${fqn}`, cause }),
    ),
  );
  const plan: Plan = {
    _tag: "Plan",
    name: "New knowledge",
    description: Option.some(`Create ${fqn}`),
    jobs: [
      {
        concurrency: 1,
        steps: [
          buildNewExtensionStep(manager, {
            target: { type: "knowledge", name },
            ref: {
              type: "knowledge",
              refType: "workspace",
              source: {
                type: "workspace",
                owner,
                extensionType: "knowledge",
                name,
              },
              scope: ws.scope,
              owner,
              name,
              version,
              sourceHash: computeSourceHash("scaffold"),
              location: targetDir,
              knowledge: { name },
            },
            versionRange: Option.none(),
            label: fqn,
            message: `Created knowledge bundle ${fqn}`,
            plannedArtifact: artifact,
            preflight: Effect.gen(function* () {
              const current = yield* ws.getConfiguredKnowledgeEntries();
              yield* preflightCreateOnly({
                subject: "Knowledge bundle",
                name,
                configured: Object.hasOwn(current, name),
                destinations: [targetDir],
              }).pipe(Effect.provideService(FileSystem.FileSystem, fs));
            }),
            scaffold,
            markAuthored: ws.setKnowledgeEntry(name, {
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
    displayApplied: false,
  });
  const summary = `-> ${joinDisplayPath(path, path.relative(ws.baseDir, targetDir))}   ${version} | 2 files`;
  const suggestions = [
    {
      description: `Add typed Markdown concepts below \`${joinDisplayPath(path, path.relative(ws.baseDir, targetDir), KNOWLEDGE_SOURCE_DIR)}\``,
    },
  ];
  const emitted = yield* emitPlanResolutionResult(
    "knowledge.new",
    resolution,
    resolution._tag === "ExecutedPlan" ? { summary, suggestions } : undefined,
  );
  if (resolution._tag === "ExecutedPlan") {
    yield* emitScaffoldSuccess({
      message: `Created knowledge bundle ${fqn}`,
      summary,
      suggestions,
      withoutSuggestions: emitted,
    });
  }
});

const newConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the knowledge bundle (without owner)"),
  ),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g., @acme)"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create the bundle without confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be created without writing files"),
  ),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, yes, preview }) =>
  handleKnowledgeNew({ name, owner, yes, preview }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withAuthRuntime("knowledge new"),
  ),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription(
    "Create an Open Knowledge Format bundle in the project-workspace authoring root",
  ),
  Command.withExamples([
    {
      command: "axm knowledge new platform",
      description: "Create a new OKF knowledge bundle",
    },
    {
      command: "axm knowledge new platform --owner @acme",
      description: "Create a bundle under a specific owner",
    },
  ]),
);
