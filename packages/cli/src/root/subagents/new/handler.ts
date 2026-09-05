import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { makeAppError } from "../../../app-error/index.js";
import {
  buildNewExtensionStep,
  createCanonicalDirectory,
  recoverCanonicalDirectory,
} from "@agentxm/extension-workspace";
import { preflightCreateOnly } from "@agentxm/extension-authoring";
import { computeSourceHash, WorkspaceMutations } from "@agentxm/workspace-state";
import { type WorkspaceSubagentRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import {
  decodeExtensionNameSync,
  formatFqn,
  normalizeHandle,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import {
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_URL,
  type SubagentManifest,
} from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import { subagentContentPath, SubagentManager } from "@agentxm/extension-workspace";
import type { JobStepArtifact, Plan } from "@agentxm/workspace-operations";
import { operationPresentation } from "@agentxm/workspace-operations";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { joinDisplayPath } from "../../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../../shared/local-plan.js";
import { resolveOwnerForNewContent } from "../../shared/resolve-owner.js";
import { requireAuthoredOwner } from "../../shared/authored-owner.js";
import {
  workspaceAuthoredRoot,
  workspaceSettingsPath,
} from "../../shared/workspace-display-paths.js";
import { failureToStepFailure, toAppError } from "../../../app-error/conversions.js";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NAME_LENGTH = 64;
const INITIAL_VERSION = decodeVersionSync("0.0.1");

export interface SubagentsNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<string>;
  readonly preview: boolean;
}

const normalizeOwner = (s: string) => normalizeHandle(s.startsWith("@") ? s : `@${s}`);

const STARTER_BODY = "Describe what this subagent does and when to delegate work to it.\n";

const makeSubagentMd = (name: string) =>
  ["---", `name: ${name}`, "---", "", STARTER_BODY].join("\n");

export const handleSubagentsNew = (args: SubagentsNewHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "subagents.new",
      mode: args.preview ? "preview" : "apply",
      planName: "New subagent",
    },
    handleSubagentsNewBody(args),
  );

const handleSubagentsNewBody = Effect.fn("SubagentsNew.handle")(function* (
  args: SubagentsNewHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manager = yield* SubagentManager;

  // 1. Resolve owner
  const owner = Option.isSome(args.owner)
    ? normalizeOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("subagent creation");
  yield* requireAuthoredOwner(owner);

  // 2. Validate name
  if (
    args.name.length === 0 ||
    args.name.length > MAX_NAME_LENGTH ||
    !NAME_PATTERN.test(args.name)
  ) {
    return yield* makeAppError({
      code: "validation",
      detail: `Invalid subagent name: "${args.name}"`,
      suggestions: [
        {
          description: "Choose a name matching /^[a-z0-9][a-z0-9-]*$/ (max 64 chars)",
        },
      ],
    });
  }

  // 3. Check existence
  const configuredSubagents = yield* ws
    .getConfiguredSubagentEntries()
    .pipe(Effect.mapError(toAppError));
  const fqn = formatFqn({ owner, type: "subagent", name: args.name });
  const base = ws.baseDir;
  const canonicalPath = path.join(workspaceAuthoredRoot(path, ws, "subagent", owner), args.name);
  const authoredPath = path.relative(base, canonicalPath);
  yield* preflightCreateOnly({
    subject: "Subagent",
    name: args.name,
    configured: Object.hasOwn(configuredSubagents, args.name),
    destinations: [],
  });
  const ref: WorkspaceSubagentRef = {
    type: "subagent",
    refType: "workspace",
    source: { type: "workspace", owner, extensionType: "subagent", name: args.name },
    scope: ws.scope,
    owner,
    name: args.name,
    version: INITIAL_VERSION,
    sourceHash: computeSourceHash("scaffold"),
    location: canonicalPath,
    subagent: {
      name: args.name,
      description: Option.none(),
    },
  };
  const artifact = {
    path: authoredPath,
    scope: ws.scope,
    version: "0.0.1",
    change: "created" as const,
    fileCount: 2,
    targets: [
      { path: path.join(authoredPath, MANIFEST_FILENAME), change: "created" as const },
      {
        path: path.join(authoredPath, "src", `${args.name}.md`),
        change: "created" as const,
      },
      { path: workspaceSettingsPath(ws.scope), change: "created" as const },
    ],
  } satisfies JobStepArtifact;

  const step = buildNewExtensionStep(manager, {
    toStepFailure: failureToStepFailure,
    ref,
    target: { type: "subagent", name: args.name },
    versionRange: Option.none(),
    label: fqn,
    message: `Created subagent ${fqn}`,
    preflight: Effect.gen(function* () {
      const current = yield* ws.getConfiguredSubagentEntries().pipe(Effect.mapError(toAppError));
      yield* recoverCanonicalDirectory({ baseDir: base, canonicalPath }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
      yield* preflightCreateOnly({
        subject: "Subagent",
        name: args.name,
        configured: Object.hasOwn(current, args.name),
        destinations: [canonicalPath],
      }).pipe(Effect.provideService(FileSystem.FileSystem, fs));
    }),
    markAuthored: ws
      .setSubagentEntry(args.name, {
        source: "workspace",
        enabled: true,
      })
      .pipe(Effect.mapError(toAppError)),
    plannedArtifact: artifact,
    buildArtifact: () => Effect.succeed(artifact),
    scaffold: createCanonicalDirectory({
      baseDir: base,
      canonicalPath,
      subject: "Subagent",
      requiredFiles: [MANIFEST_FILENAME, `src/${args.name}.md`],
      populate: (stagingPath) =>
        Effect.gen(function* () {
          const extensionName = decodeExtensionNameSync(args.name);
          const subagentSrcPath = path.join(stagingPath, "src");
          yield* fs.makeDirectory(subagentSrcPath, { recursive: true }).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "validation",
                detail: `Failed to create subagent directory: ${subagentSrcPath}`,
                cause: e,
              }),
            ),
          );
          const manifest: SubagentManifest = {
            $schema: MANIFEST_SCHEMA_URL,
            owner,
            type: "subagent",
            name: extensionName,
            version: INITIAL_VERSION,
          };
          yield* fs
            .writeFileString(
              path.join(stagingPath, MANIFEST_FILENAME),
              JSON.stringify(manifest, null, 2) + "\n",
            )
            .pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "validation",
                  detail: "Subagent manifest could not be written",
                  cause: e,
                }),
              ),
            );
          const contentPath = subagentContentPath(path.join, subagentSrcPath, args.name);
          yield* fs.writeFileString(contentPath, makeSubagentMd(args.name)).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "validation",
                detail: "Failed to write subagent content",
                cause: e,
              }),
            ),
          );
        }),
    }).pipe(
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  });

  const plan: Plan = {
    _tag: "Plan",
    name: "New subagent",
    description: Option.some(`Create ${fqn}`),
    presentation: operationPresentation(
      { imperative: "create", past: "Created", gerund: "Creating" },
      "subagent",
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, { preview: args.preview });

  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, authoredPath, "src", `${args.name}.md`)}\` to fill in instructions`,
    },
  ];

  yield* emitOperationResolution("subagents.new", resolution, { suggestions });
});
