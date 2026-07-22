import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";

import { type AppError, makeAppError } from "@agentxm/client-core/unstable/app-error";
import { yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { requireInteractive } from "@agentxm/client-core/unstable/cli/prompt";
import {
  fqnInvalidErrorToAppError,
  parseFqn,
  toExtensionTypePlural,
} from "@agentxm/client-core/unstable/extensions";
import {
  clearExtensionMaintainer,
  type ExtensionMaintainer,
  type ExtensionMaintainerTarget,
  getExtensionMaintainer,
  type RegistryExtensionReference,
  setExtensionMaintainer,
} from "@agentxm/client-core/unstable/registry";

import { withAuthRuntime } from "../../runtime.js";
import { emitPlanResolutionResult } from "../../json-output.js";

type MaintainerSubjectKind = "user" | "team";

const MaintainerSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("user"),
    userId: Schema.String,
    assignedAt: Schema.NullOr(Schema.String),
    assignedBy: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("team"),
    teamId: Schema.String,
    assignedAt: Schema.NullOr(Schema.String),
    assignedBy: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("none"),
    assignedAt: Schema.NullOr(Schema.String),
    assignedBy: Schema.NullOr(Schema.String),
  }),
]);

const MaintainerOutputSchema = Schema.Struct({
  extension: Schema.String,
  maintainer: MaintainerSchema,
});

const parseExtensionRef = (input: string): Effect.Effect<RegistryExtensionReference, AppError> =>
  Effect.gen(function* () {
    const fqn = yield* Effect.fromResult(
      Result.mapError(parseFqn(input), fqnInvalidErrorToAppError),
    );
    return {
      owner: fqn.owner,
      type: toExtensionTypePlural(fqn.type),
      name: fqn.name,
    };
  });

const formatRef = (ref: RegistryExtensionReference): string =>
  `${ref.owner}/${ref.type}/${ref.name}`;

const parseSubjectKind = (input: string): Effect.Effect<MaintainerSubjectKind, AppError> => {
  switch (input) {
    case "user":
    case "team":
      return Effect.succeed(input);
    default:
      return Effect.fail(
        makeAppError({
          code: "validation",
          detail: `Invalid maintainer subject kind: ${input}`,
          suggestions: [{ description: "Use `user` or `team`." }],
        }),
      );
  }
};

const toMaintainerTarget = (
  subjectKind: MaintainerSubjectKind,
  subjectId: string,
): ExtensionMaintainerTarget => {
  switch (subjectKind) {
    case "user":
      return { kind: "user", userId: subjectId };
    case "team":
      return { kind: "team", teamId: subjectId };
  }
};

const formatMaintainer = (maintainer: ExtensionMaintainer): string => {
  switch (maintainer.kind) {
    case "user":
      return `user ${maintainer.userId}`;
    case "team":
      return `team ${maintainer.teamId}`;
    case "none":
      return "none";
  }
};

const emitMaintainerMutationResult = (args: {
  readonly name: string;
  readonly label: string;
  readonly message: string;
}) =>
  emitPlanResolutionResult("maintainer.mutate", {
    _tag: "ExecutedPlan",
    name: args.name,
    description: Option.none(),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            label: args.label,
            result: {
              result: "success",
              message: args.message,
            },
          },
        ],
      },
    ],
  });

const renderMaintainer = (
  renderer: typeof CliRenderer.Service,
  ref: RegistryExtensionReference,
  maintainer: ExtensionMaintainer,
) =>
  Effect.gen(function* () {
    const output = { extension: formatRef(ref), maintainer };
    if (yield* renderer.result(output, MaintainerOutputSchema)) {
      return;
    }

    yield* renderer.raw(
      `Extension   ${output.extension}\nMaintainer  ${formatMaintainer(maintainer)}\n`,
    );
  });

const handleMaintainerShow = (extRef: string) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const ref = yield* parseExtensionRef(extRef);
    const maintainer = yield* getExtensionMaintainer(ref);
    yield* renderMaintainer(renderer, ref, maintainer);
  });

const handleMaintainerSet = (input: {
  readonly extRef: string;
  readonly subjectKind: string;
  readonly subjectId: string;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const ref = yield* parseExtensionRef(input.extRef);
    const subjectKind = yield* parseSubjectKind(input.subjectKind);
    const maintainer = yield* setExtensionMaintainer(
      ref,
      toMaintainerTarget(subjectKind, input.subjectId),
    );
    const extension = formatRef(ref);
    const message = `Set maintainer for ${extension} to ${formatMaintainer(maintainer)}.`;
    if (
      yield* emitMaintainerMutationResult({
        name: "Set extension maintainer",
        label: "Set extension maintainer",
        message,
      })
    ) {
      return;
    }
    yield* renderMaintainer(renderer, ref, maintainer);
  });

const handleMaintainerClear = (input: { readonly extRef: string; readonly yes: boolean }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const ref = yield* parseExtensionRef(input.extRef);
    // Honor the (previously dead) --yes flag: confirm the destructive clear
    // interactively unless --yes was passed.
    if (!input.yes) {
      const confirmed = yield* requireInteractive(
        Prompt.confirm({ message: `Clear the maintainer for ${formatRef(ref)}?` }),
        { message: "Pass --yes to clear the maintainer non-interactively." },
      );
      if (!confirmed) return;
    }
    const maintainer = yield* clearExtensionMaintainer(ref);
    const extension = formatRef(ref);
    const message = `Cleared maintainer for ${extension}.`;
    if (
      yield* emitMaintainerMutationResult({
        name: "Clear extension maintainer",
        label: "Clear extension maintainer",
        message,
      })
    ) {
      return;
    }
    yield* renderMaintainer(renderer, ref, maintainer);
  });

const showConfig = {
  extRef: Argument.string("ext-ref").pipe(
    Argument.withDescription("Extension FQN, for example @acme/skills/code-review"),
  ),
} as const;

const setConfig = {
  extRef: Argument.string("ext-ref").pipe(
    Argument.withDescription("Extension FQN, for example @acme/skills/code-review"),
  ),
  subjectKind: Argument.string("subject").pipe(
    Argument.withDescription("Subject kind: user or team"),
  ),
  subjectId: Argument.string("id").pipe(
    Argument.withDescription("Registry user_... or team_... identifier"),
  ),
} as const;

const clearConfig = {
  extRef: Argument.string("ext-ref").pipe(
    Argument.withDescription("Extension FQN, for example @acme/skills/code-review"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Clear the maintainer without an interactive prompt")),
} as const;

const maintainerShowCommand = Command.make("show", showConfig, ({ extRef }) =>
  handleMaintainerShow(extRef).pipe(withAuthRuntime("maintainer show")),
).pipe(
  withArgvTracking(showConfig),
  Command.withDescription("Show the apex maintainer for an extension"),
  Command.withExamples([
    {
      command: "axm maintainer show @acme/skills/code-review",
      description: "Show the current maintainer",
    },
  ]),
);

const maintainerSetCommand = Command.make("set", setConfig, ({ extRef, subjectKind, subjectId }) =>
  handleMaintainerSet({ extRef, subjectKind, subjectId }).pipe(withAuthRuntime("maintainer set")),
).pipe(
  withArgvTracking(setConfig),
  Command.withDescription("Set or transfer the apex maintainer for an extension"),
  Command.withExamples([
    {
      command: "axm maintainer set @acme/skills/code-review user user_01h455vb4pexka56gq5w2r7cpc",
      description: "Transfer maintainer authority to a user",
    },
  ]),
);

const maintainerClearCommand = Command.make("clear", clearConfig, ({ extRef, yes }) =>
  handleMaintainerClear({ extRef, yes }).pipe(withAuthRuntime("maintainer clear")),
).pipe(
  withArgvTracking(clearConfig),
  Command.withDescription("Clear the apex maintainer and return to owner fallback"),
  Command.withExamples([
    {
      command: "axm maintainer clear @acme/skills/code-review --yes",
      description: "Clear maintainer authority",
    },
  ]),
);

export const maintainerCommand = Command.make("maintainer").pipe(
  Command.withDescription("Manage extension apex maintainers"),
  Command.withExamples([
    {
      command: "axm maintainer show @acme/skills/code-review",
      description: "Show the current maintainer",
    },
    {
      command: "axm maintainer set @acme/skills/code-review user user_01h455vb4pexka56gq5w2r7cpc",
      description: "Transfer maintainer authority to a user",
    },
    {
      command: "axm maintainer clear @acme/skills/code-review --yes",
      description: "Clear maintainer authority",
    },
  ]),
  Command.withSubcommands([maintainerShowCommand, maintainerSetCommand, maintainerClearCommand]),
);
