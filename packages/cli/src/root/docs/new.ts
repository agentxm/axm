import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  decodeExtensionNameSync,
  normalizeHandle,
  REGISTRY_EXTENSIONS_DIR,
} from "@agentxm/client-core/unstable/extensions";
import { DOCS_EXTENSION_DIR, DOCS_MANIFEST_FILENAME } from "@agentxm/client-core/unstable/docs";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";

export const handleDocsNew = Effect.fn("DocsNew.handle")(function* (args: {
  readonly name: string;
  readonly owner: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const owner = Option.isSome(args.owner)
    ? normalizeHandle(args.owner.value.startsWith("@") ? args.owner.value : `@${args.owner.value}`)
    : yield* resolveOwnerForNewContent("docs package creation");
  const name = decodeExtensionNameSync(args.name);
  const targetDir = path.join(
    path.resolve("."),
    REGISTRY_EXTENSIONS_DIR,
    owner,
    DOCS_EXTENSION_DIR,
    name,
  );

  const plan: Plan = {
    _tag: "Plan",
    name: "New docs",
    description: Option.some(`Create ${owner}/docs/${name}`),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            readiness: "ready",
            label: `${owner}/docs/${name}`,
            run: Effect.gen(function* () {
              const exists = yield* fs.exists(targetDir).pipe(Effect.orElseSucceed(() => false));
              if (exists && !args.force) {
                return yield* makeAppError({
                  code: "conflict",
                  detail: `docs package directory already exists: ${targetDir}`,
                });
              }
              yield* fs.makeDirectory(path.join(targetDir, "src"), { recursive: true }).pipe(
                Effect.mapError((error) =>
                  makeAppError({
                    code: "internal",
                    detail: `Failed to create docs package directory: ${targetDir}`,
                    cause: error,
                  }),
                ),
              );
              yield* fs
                .writeFileString(
                  path.join(targetDir, DOCS_MANIFEST_FILENAME),
                  `${JSON.stringify(
                    {
                      $schema: "https://axm.sh/schemas/docs.schema.json",
                      owner,
                      name,
                      version: "0.1.0",
                      type: "docs",
                      contents: [
                        {
                          source: { kind: "static", path: "README.md" },
                          target: `docs/${name}.md`,
                          mode: "sync-once",
                        },
                      ],
                    },
                    null,
                    2,
                  )}\n`,
                )
                .pipe(
                  Effect.mapError((error) =>
                    makeAppError({
                      code: "internal",
                      detail: `Failed to write ${DOCS_MANIFEST_FILENAME}`,
                      cause: error,
                    }),
                  ),
                );
              yield* fs
                .writeFileString(path.join(targetDir, "src", "README.md"), `# ${name}\n`)
                .pipe(
                  Effect.mapError((error) =>
                    makeAppError({
                      code: "internal",
                      detail: "Failed to write docs payload",
                      cause: error,
                    }),
                  ),
                );
              return { result: "success", message: `Created ${owner}/docs/${name}` };
            }),
          },
        ],
      },
    ],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, { preview: args.preview });
  yield* emitPlanResolutionResult("docs.new", resolution);
  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success(`Created ${owner}/docs/${name}`);
  }
});

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the docs package")),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g. @acme)"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Overwrite if the directory exists")),
  preview: previewFlag.pipe(Flag.withDescription("Show files without creating them")),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, yes, force, preview }) =>
  handleDocsNew({ name, owner, yes, force, preview }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withAuthRuntime("docs new"),
  ),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Scaffold a new docs package"),
  Command.withExamples([
    {
      command: "axm docs new workspace-baseline --owner @acme",
      description: "Scaffold a docs package",
    },
  ]),
);
