import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import {
  buildNewExtensionStep,
  createCanonicalDirectory,
  recoverCanonicalDirectory,
  preflightCreateOnly,
} from "@agentxm/extension-management/unstable/extensions";
import { computeSourceHash, WorkspaceMutations } from "@agentxm/workspace-state";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import {
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_MANIFEST_SCHEMA_URL,
  KNOWLEDGE_SOURCE_DIR,
  type KnowledgeManifest,
} from "@agentxm/extension-model/unstable/knowledge";
import { KnowledgeManager } from "@agentxm/extension-management/unstable/knowledge";
import type { Plan } from "@agentxm/workspace-operations";
import { operationPresentation } from "@agentxm/workspace-operations";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { requireAuthoredOwner } from "../shared/authored-owner.js";
import { normalizeScaffoldOwner } from "../shared/scaffold-name.js";
import { workspaceAuthoredRoot, workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

export const handleKnowledgeNew = (args: {
  readonly name: string;
  readonly owner: Option.Option<string>;
  readonly description: Option.Option<string>;
  readonly yes: boolean;
  readonly preview: boolean;
}) =>
  withOperationLifecycle(
    {
      command: "knowledge.new",
      mode: args.preview ? "preview" : "apply",
      planName: "New knowledge",
    },
    handleKnowledgeNewBody(args),
  );

const handleKnowledgeNewBody = Effect.fn("KnowledgeNew.handle")(function* (args: {
  readonly name: string;
  readonly owner: Option.Option<string>;
  readonly description: Option.Option<string>;
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
  yield* requireAuthoredOwner(owner);
  const name = decodeExtensionNameSync(args.name);
  const version = decodeVersionSync("0.1.0");
  const fqn = formatFqn({ owner, type: "knowledge", name });
  const targetDir = path.join(workspaceAuthoredRoot(path, ws, "knowledge", owner), name);
  const configuredKnowledge = yield* ws
    .getConfiguredKnowledgeEntries()
    .pipe(Effect.mapError(toAppError));
  yield* preflightCreateOnly({
    subject: "Knowledge bundle",
    name,
    configured: Object.hasOwn(configuredKnowledge, name),
    destinations: [],
  });

  const manifest: KnowledgeManifest = {
    $schema: KNOWLEDGE_MANIFEST_SCHEMA_URL,
    owner,
    name,
    version,
    type: "knowledge",
    format: { name: "okf", version: "0.2" },
    bundleRoot: KNOWLEDGE_SOURCE_DIR,
    ...(Option.isSome(args.description) ? { description: args.description.value } : {}),
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
      { path: workspaceSettingsPath(ws.scope), change: "created" as const },
    ],
  };
  const scaffold = createCanonicalDirectory({
    baseDir: ws.baseDir,
    canonicalPath: targetDir,
    subject: "Knowledge bundle",
    requiredFiles: [KNOWLEDGE_MANIFEST_FILENAME, `${KNOWLEDGE_SOURCE_DIR}/index.md`],
    populate: (stagingPath) => {
      const stagedManifestPath = path.join(stagingPath, KNOWLEDGE_MANIFEST_FILENAME);
      const stagedIndexPath = path.join(stagingPath, KNOWLEDGE_SOURCE_DIR, "index.md");
      return Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(stagedIndexPath), { recursive: true }).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "internal",
              detail: `Failed to create knowledge bundle directory: ${stagingPath}`,
              cause,
            }),
          ),
        );
        yield* fs.writeFileString(stagedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        yield* fs.writeFileString(
          stagedIndexPath,
          `---\nokf_version: "0.2"\n---\n# ${name}\n\n<!-- Discovery map: describe this bundle's scope, then group and annotate links to its concepts. -->\n`,
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
    name: "New knowledge",
    presentation: operationPresentation(
      { imperative: "create", past: "Created", gerund: "Creating" },
      "knowledge",
    ),
    description: Option.some(
      Option.isSome(args.description)
        ? `Create ${fqn}: ${args.description.value}`
        : `Create ${fqn}`,
    ),
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
              const current = yield* ws
                .getConfiguredKnowledgeEntries()
                .pipe(Effect.mapError(toAppError));
              yield* recoverCanonicalDirectory({
                baseDir: ws.baseDir,
                canonicalPath: targetDir,
              }).pipe(
                Effect.provideService(FileSystem.FileSystem, fs),
                Effect.provideService(Path.Path, path),
              );
              yield* preflightCreateOnly({
                subject: "Knowledge bundle",
                name,
                configured: Object.hasOwn(current, name),
                destinations: [targetDir],
              }).pipe(Effect.provideService(FileSystem.FileSystem, fs));
            }),
            scaffold,
            markAuthored: ws
              .setKnowledgeEntry(name, {
                source: "workspace",
                enabled: true,
              })
              .pipe(Effect.mapError(toAppError)),
            buildArtifact: () => Effect.succeed(artifact),
          }),
        ],
      },
    ],
  };
  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    yes: args.yes,
  });
  const suggestions = [
    ...(Option.isNone(args.description)
      ? [
          {
            description: `Add a concise bundle description to \`${joinDisplayPath(path, path.relative(ws.baseDir, manifestPath))}\``,
          },
        ]
      : []),
    {
      description: `Add typed Markdown concepts below \`${joinDisplayPath(path, path.relative(ws.baseDir, targetDir), KNOWLEDGE_SOURCE_DIR)}\``,
    },
    {
      description: `Replace the root index placeholder with grouped, annotated concept links`,
    },
  ];
  yield* emitOperationResolution("knowledge.new", resolution, { suggestions });
});

const newConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the knowledge bundle (without owner)"),
  ),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g., @acme)"),
    Flag.optional,
  ),
  description: Flag.string("description").pipe(
    Flag.withDescription("Concise bundle-level discovery summary"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create the bundle without confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be created without writing files"),
  ),
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, owner, description, yes, preview }) =>
    handleKnowledgeNew({ name, owner, description, yes, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime("knowledge new"),
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
