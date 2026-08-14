import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  extensionTypeToPlural,
  fqnInvalidErrorToAppError,
  parseFqn,
} from "@agentxm/client-core/unstable/extensions";
import type { PublishableType } from "./command.js";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { backfillFlag, onExistingFlag } from "../shared/publish-flags.js";
import { handleRootPublish } from "./command.js";

type PerTypePublishType = PublishableType;

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
  const commonConfig = {
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
    registry: Flag.string("registry").pipe(
      Flag.withDescription("Target a specific named registry"),
      Flag.optional,
    ),
    registryUrl: Flag.string("registry-url").pipe(
      Flag.withDescription("Override the target registry URL for automation"),
      Flag.optional,
    ),
    onExisting: onExistingFlag,
    backfill: backfillFlag,
    visibility: Flag.choice("visibility", ["public", "private"] as const).pipe(
      Flag.withDescription("Initial visibility for every new extension in the selection"),
      Flag.optional,
    ),
    yes: yesFlag.pipe(Flag.withDescription("Publish without confirmation")),
    preview: previewFlag.pipe(Flag.withDescription("Preflight without uploading")),
  } as const;

  const examples = [
    {
      command: `axm ${plural} publish`,
      description: `Publish every workspace-sourced ${plural} package`,
    },
    {
      command: `axm ${plural} publish example-* --on-existing verify`,
      description: `Publish matching ${plural} packages`,
    },
  ];

  if (type === "pack") {
    const config = {
      ...commonConfig,
      includeDependencies: Flag.boolean("include-dependencies").pipe(
        Flag.withDescription("Include workspace-sourced dependencies of selected packs"),
      ),
      includeDependency: Flag.string("include-dependency").pipe(
        Flag.withDescription("Explicitly include a non-workspace pack dependency"),
        Flag.atLeast(0),
      ),
    } as const;
    return Command.make("publish", config, (parsed) =>
      Effect.gen(function* () {
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
          backfill: parsed.backfill,
          yes: parsed.yes,
          preview: parsed.preview,
          scope: "project",
          visibility: parsed.visibility,
          includeDependencies: parsed.includeDependencies,
          includeDependency: [...parsed.includeDependency],
          recoveryCommand: [plural, "publish"],
          recoverySelectors: [...parsed.extensions],
          recoveryExcludes: [...parsed.exclude],
        });
      }).pipe(withWorkspace("project"), withRuntime(`${plural} publish`)),
    ).pipe(
      withArgvTracking(config),
      Command.withDescription(`Publish project-workspace ${plural} to a registry`),
      Command.withExamples(examples),
    );
  }

  const config = commonConfig;
  return Command.make("publish", config, (parsed) =>
    Effect.gen(function* () {
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
        backfill: parsed.backfill,
        yes: parsed.yes,
        preview: parsed.preview,
        scope: "project",
        visibility: parsed.visibility,
        includeDependencies: false,
        includeDependency: [],
        recoveryCommand: [plural, "publish"],
        recoverySelectors: [...parsed.extensions],
        recoveryExcludes: [...parsed.exclude],
      });
    }).pipe(withWorkspace("project"), withRuntime(`${plural} publish`)),
  ).pipe(
    withArgvTracking(config),
    Command.withDescription(`Publish project-workspace ${plural} to a registry`),
    Command.withExamples(examples),
  );
};

export const skillsPublishCommand = makePerTypePublishCommand("skill");
export const mcpsPublishCommand = makePerTypePublishCommand("mcp-server");
export const subagentsPublishCommand = makePerTypePublishCommand("subagent");
export const hooksPublishCommand = makePerTypePublishCommand("hook");
export const knowledgePublishCommand = makePerTypePublishCommand("knowledge");
export const packsPublishCommand = makePerTypePublishCommand("pack");
export const rulesPublishCommand = makePerTypePublishCommand("rule");
