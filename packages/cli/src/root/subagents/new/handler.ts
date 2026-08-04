import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  buildNewExtensionStep,
  computeSourceHash,
  decodeExtensionNameSync,
  formatFqn,
  normalizeHandle,
  type ExtensionName,
} from "@agentxm/client-core/unstable/extensions";
import {
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_URL,
  computeSubagentPaths,
  subagentScaffoldArtifact,
  subagentSourcePath,
  subagentContentPath,
  SubagentManager,
  type SubagentManifest,
  type WorkspaceSubagentRef,
} from "@agentxm/client-core/unstable/subagents";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import { emitPlanResolutionResult } from "../../../json-output.js";
import { joinDisplayPath } from "../../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../../shared/local-plan.js";
import { resolveOwnerForNewContent } from "../../shared/resolve-owner.js";
import { emitScaffoldSuccess } from "../../shared/scaffold-success.js";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NAME_LENGTH = 64;
const INITIAL_VERSION = decodeVersionSync("0.0.1");

export interface SubagentsNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<string>;
  readonly agents: Option.Option<readonly string[]>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const normalizeOwner = (s: string) => normalizeHandle(s.startsWith("@") ? s : `@${s}`);

const STARTER_BODY = "Describe what this subagent does and when to delegate work to it.\n";

const makeSubagentMd = (name: string) =>
  ["---", `name: ${name}`, "---", "", STARTER_BODY].join("\n");

export const handleSubagentsNew = Effect.fn("SubagentsNew.handle")(function* (
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
  const configuredSubagents = yield* ws.getConfiguredSubagentEntries();
  if (configuredSubagents[args.name] !== undefined && !args.force) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Subagent '${args.name}' already exists`,
      suggestions: [
        {
          description:
            "Choose a different name, remove the existing subagent first, or use --force",
        },
      ],
    });
  }

  // 4. Build the scaffold operation as a plan step
  const fqn = formatFqn({ owner, type: "subagent", name: args.name });
  const scaffoldPath = subagentSourcePath(owner, args.name);
  const base = ws.baseDir;
  const ref: WorkspaceSubagentRef = {
    type: "subagent",
    refType: "workspace",
    source: { type: "workspace", owner, extensionType: "subagent", name: args.name },
    scope: ws.scope,
    owner,
    name: args.name,
    version: INITIAL_VERSION,
    sourceHash: computeSourceHash("scaffold"),
    location: path.join(base, scaffoldPath),
    subagent: {
      name: args.name,
      description: Option.none(),
    },
  };

  const step = buildNewExtensionStep(manager, {
    ref,
    target: { type: "subagent", name: args.name },
    versionRange: Option.none(),
    label: fqn,
    message: `Created subagent ${fqn}`,
    markAuthored: ws.setSubagentEntry(args.name, {
      source: `workspace:${fqn}`,
      enabled: true,
    }),
    buildArtifact: () =>
      Effect.succeed(
        subagentScaffoldArtifact({
          owner,
          name: args.name,
          scope: ws.scope,
          version: "0.0.1",
        }),
      ),
    scaffold: Effect.gen(function* () {
      const extensionName = decodeExtensionNameSync(args.name);

      // Compute paths
      const { canonicalPath, subagentSrcPath } = computeSubagentPaths(
        path.join,
        base,
        { refType: "registry", owner },
        args.name,
      );

      // Create subagent directory (src/ implies canonicalPath is also created)
      yield* fs.makeDirectory(subagentSrcPath, { recursive: true }).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "validation",
            detail: `Failed to create subagent directory: ${subagentSrcPath}`,
            cause: e,
          }),
        ),
      );

      // Write manifest
      const manifest: SubagentManifest = {
        $schema: MANIFEST_SCHEMA_URL,
        owner,
        type: "subagent",
        name: extensionName,
        version: INITIAL_VERSION,
      };

      yield* fs
        .writeFileString(
          path.join(canonicalPath, MANIFEST_FILENAME),
          JSON.stringify(manifest, null, 2) + "\n",
        )
        .pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "validation",
              detail: `Subagent manifest could not be written`,
              cause: e,
            }),
          ),
        );

      // Write starter content file
      const subagentMdContent = makeSubagentMd(args.name);
      const contentPath = subagentContentPath(path.join, subagentSrcPath, args.name);

      yield* fs.writeFileString(contentPath, subagentMdContent).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "validation",
            detail: `Failed to write subagent content`,
            cause: e,
          }),
        ),
      );
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
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    displayApplied: false,
  });

  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, ".axm", "extensions", owner, "subagents", args.name, "src", `${args.name}.md`)}\` to fill in instructions`,
    },
  ];

  const emitted = yield* emitPlanResolutionResult(
    "subagents.new",
    resolution,
    resolution._tag === "ExecutedPlan"
      ? { summary: `-> ${scaffoldPath}   0.0.1 | 2 files`, suggestions }
      : undefined,
  );

  if (resolution._tag === "ExecutedPlan") {
    yield* emitScaffoldSuccess({
      message: `Created subagent ${fqn}`,
      summary: `-> ${scaffoldPath}   0.0.1 | 2 files`,
      suggestions,
      withoutSuggestions: emitted,
    });
  }
});
