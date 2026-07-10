import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  extensionTypeToPlural,
  fqnInvalidErrorToAppError,
  parseFqn,
  type ExtensionType,
} from "@agentxm/client-core/unstable/extensions";

import { scopeFlag } from "../../cli-flags.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../runtime.js";
import { skipExistingFlag } from "../shared/publish-flags.js";
import { handleRootPublish } from "./command.js";

type PerTypePublishType = Exclude<ExtensionType, "rule">;

const normalizeSelector = (type: PerTypePublishType, selector: string) =>
  Effect.gen(function* () {
    if (!selector.startsWith("@")) return `${extensionTypeToPlural[type]}/${selector}`;
    const parsed = yield* Effect.fromResult(
      Result.mapError(parseFqn(selector), fqnInvalidErrorToAppError),
    );
    if (parsed.type !== type) {
      return yield* makeAppError({
        code: "validation",
        detail: `Expected a ${extensionTypeToPlural[type]} selector, got ${selector}`,
      });
    }
    return selector;
  });

export const makePerTypePublishCommand = (type: PerTypePublishType) => {
  const plural = extensionTypeToPlural[type];
  const config = {
    extensions: Argument.string("extensions").pipe(
      Argument.withDescription("Bare names, globs, or fully-qualified extension names"),
      Argument.atLeast(0),
    ),
    authored: Flag.boolean("authored").pipe(
      Flag.withDescription("Publish extensions authored in this workspace"),
    ),
    all: Flag.boolean("all").pipe(Flag.withDescription(`Publish all managed ${plural} packages`)),
    owner: Flag.string("owner").pipe(Flag.withDescription("Filter by owner"), Flag.atLeast(0)),
    exclude: Flag.string("exclude").pipe(
      Flag.withDescription("Exclude a matching name, glob, or FQN"),
      Flag.atLeast(0),
    ),
    scope: scopeFlag,
    registry: Flag.string("registry").pipe(
      Flag.withDescription("Target a specific named registry"),
      Flag.optional,
    ),
    registryUrl: Flag.string("registry-url").pipe(
      Flag.withDescription("Override the target registry URL for automation"),
      Flag.optional,
    ),
    onExisting: Flag.choice("on-existing", ["error", "skip", "verify"] as const).pipe(
      Flag.withDescription("Policy when a version already exists"),
      Flag.withDefault("error"),
    ),
    skipExisting: skipExistingFlag,
    visibility: Flag.choice("visibility", ["public", "internal", "private"] as const).pipe(
      Flag.withDescription("Initial visibility for one explicit publish"),
      Flag.optional,
    ),
    includeDependencies: Flag.boolean("include-dependencies").pipe(
      Flag.withDescription("For packs, include workspace-sourced dependencies"),
    ),
    includeDependency: Flag.string("include-dependency").pipe(
      Flag.withDescription("For packs, explicitly include a non-workspace dependency"),
      Flag.atLeast(0),
    ),
    yes: yesFlag.pipe(Flag.withDescription("Publish without confirmation")),
    force: forceFlag.pipe(
      Flag.withDescription("Allow an older unpublished version; never overwrite a version"),
    ),
    preview: previewFlag.pipe(Flag.withDescription("Preflight without uploading")),
  } as const;

  return Command.make("publish", config, (parsed) =>
    Effect.gen(function* () {
      if (type !== "pack" && (parsed.includeDependencies || parsed.includeDependency.length > 0)) {
        return yield* makeAppError({
          code: "usage",
          detail: "Dependency publication flags are only valid for packs",
        });
      }
      const selectors = yield* Effect.forEach(parsed.extensions, (selector) =>
        normalizeSelector(type, selector),
      );
      const excludes = yield* Effect.forEach(parsed.exclude, (selector) =>
        normalizeSelector(type, selector),
      );
      yield* handleRootPublish({
        selectors,
        authored: parsed.authored,
        all: parsed.all,
        owners: [...parsed.owner],
        types: selectors.length === 0 ? [type] : [],
        excludes,
        registry: parsed.registry,
        registryUrl: parsed.registryUrl,
        onExisting: parsed.onExisting,
        skipExisting: parsed.skipExisting,
        yes: parsed.yes,
        force: parsed.force,
        preview: parsed.preview,
        scope: parsed.scope,
        visibility: parsed.visibility,
        includeDependencies: parsed.includeDependencies,
        includeDependency: [...parsed.includeDependency],
      });
    }).pipe(
      withWorkspace(parsed.scope),
      Effect.provide(AuthLayer),
      withRuntime(`${plural} publish`),
    ),
  ).pipe(
    withArgvTracking(config),
    Command.withDescription(`Publish ${plural} to a registry`),
    Command.withExamples([
      {
        command: `axm ${plural} publish`,
        description: `Publish every workspace-sourced ${plural} package`,
      },
      {
        command: `axm ${plural} publish example-* --on-existing verify`,
        description: `Publish matching ${plural} packages`,
      },
    ]),
  );
};

export const skillsPublishCommand = makePerTypePublishCommand("skill");
export const commandsPublishCommand = makePerTypePublishCommand("command");
export const mcpsPublishCommand = makePerTypePublishCommand("mcp-server");
export const subagentsPublishCommand = makePerTypePublishCommand("subagent");
export const filesPublishCommand = makePerTypePublishCommand("files");
export const hooksPublishCommand = makePerTypePublishCommand("hook");
export const packsPublishCommand = makePerTypePublishCommand("pack");
