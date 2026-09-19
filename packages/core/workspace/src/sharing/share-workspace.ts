/** Read-only repository sharing output for one authored AXM workspace. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { ExtensionTypeSchema, extensionTypes } from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { WorkspaceLocation } from "../desired-state/index.js";
import {
  discoverExtensionPackages,
  findGitRoot,
  getRemoteUrl,
  listRemoteRefs,
} from "../resolution/sources/index.js";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  renderConfirmationRecoveryCommand,
} from "../transitions/planning/index.js";

export class ShareFailed extends Schema.TaggedError<ShareFailed>()("ShareFailed", {
  category: Schema.Literal("validation"),
  detail: Schema.String,
}) {}

export const SharedExtensionSchema = Schema.Struct({
  type: ExtensionTypeSchema,
  name: Schema.String,
});

export const ShareWorkspaceDocumentSchema = Schema.Struct({
  command: Schema.Literal("share"),
  origin: Schema.String,
  locator: Schema.String,
  availability: Schema.Union([Schema.Literal("available"), Schema.Literal("unavailable")]),
  extensions: Schema.Array(SharedExtensionSchema),
  installCommand: Schema.String,
});

export type SharedExtension = typeof SharedExtensionSchema.Type;
export type ShareWorkspaceDocument = typeof ShareWorkspaceDocumentSchema.Type;

const selectorFlag: Readonly<Record<InstallableExtensionType, string>> = {
  skill: "--skill",
  "mcp-server": "--mcp",
  subagent: "--subagent",
  rule: "--rule",
  hook: "--hook",
  knowledge: "--knowledge",
  pack: "--pack",
};

const sourceLocator = (
  origin: string,
  repositoryRoot: string,
  workspaceRoot: string,
  path: Path.Path,
): string => {
  const relative = path.relative(repositoryRoot, workspaceRoot);
  if (relative.length === 0) return origin;
  const posixRelative = path.sep === "/" ? relative : relative.split(path.sep).join("/");
  return `${origin.replace(/\/+$/u, "")}//${posixRelative}`;
};

export const ShareWorkspace = {
  query: Effect.fn("ShareWorkspace.query")(function* () {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const repositoryRoot = yield* findGitRoot(location.baseDir).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new ShareFailed({
                category: "validation",
                detail: "Cannot share this workspace because it is not inside a Git repository.",
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );
    const origin = yield* getRemoteUrl(repositoryRoot, "origin").pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new ShareFailed({
                category: "validation",
                detail:
                  "Cannot share this workspace because its Git repository has no origin remote.",
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

    const discovered = yield* discoverExtensionPackages(location.baseDir, {
      names: [],
      owner: Option.none(),
      type: "*",
    });
    const extensions = discovered.map((candidate): SharedExtension => {
      const type = candidate.kind === "manifest" ? candidate.identity.type : "skill";
      const name = candidate.kind === "manifest" ? candidate.identity.name : candidate.name;
      return { type, name };
    });
    extensions.sort((left, right) => {
      const typeOrder = extensionTypes.indexOf(left.type) - extensionTypes.indexOf(right.type);
      return typeOrder === 0 ? left.name.localeCompare(right.name) : typeOrder;
    });
    if (extensions.length === 0) {
      return yield* new ShareFailed({
        category: "validation",
        detail: "This workspace has no distributable authored extensions to share.",
      });
    }

    const locator = sourceLocator(origin, repositoryRoot, location.baseDir, path);
    const installCommand = renderConfirmationRecoveryCommand(
      {
        command: ["install"],
        arguments: [
          ...extensions.map((extension) =>
            recoveryOption(selectorFlag[extension.type], publicRecoveryValue(extension.name)),
          ),
          recoveryPositional(credentialFreeLocatorRecoveryValue(locator)),
        ],
      },
      { approval: "none" },
    );
    if (installCommand === undefined) {
      return yield* new ShareFailed({
        category: "validation",
        detail:
          "Cannot print a share command because the origin URL contains protected credential material.",
      });
    }
    const availability = yield* listRemoteRefs(origin).pipe(
      Effect.as("available" as const),
      Effect.catch(() => Effect.succeed("unavailable" as const)),
    );
    return {
      command: "share",
      origin,
      locator,
      availability,
      extensions,
      installCommand,
    } satisfies ShareWorkspaceDocument;
  }),
};
