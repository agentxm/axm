import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { type AppError, makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  fqnInvalidErrorToAppError,
  parseFqn,
  toExtensionTypePlural,
} from "@agentxm/client-core/unstable/extensions";
import {
  deleteTeamExtensionGrant,
  deleteUserExtensionGrant,
  type ExtensionGrantEntry,
  type ExtensionGrantRole,
  listExtensionGrants,
  type RegistryExtensionReference,
  upsertTeamExtensionGrant,
  upsertUserExtensionGrant,
} from "@agentxm/client-core/unstable/registry";

import { withAuthRuntime } from "../../runtime.js";
import { emitPlanResolutionResult } from "../../json-output.js";

type GrantSubjectKind = "user" | "team";

interface GrantListRow {
  readonly subject: string;
  readonly role: string;
  readonly grantedBy: string;
  readonly createdAt: string;
}

const GrantSubjectSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("user"), userId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("team"), teamId: Schema.String }),
]);

const GrantEntrySchema = Schema.Struct({
  subject: GrantSubjectSchema,
  role: Schema.Literals(["read", "write"]),
  grantedBy: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
});

const GrantListOutputSchema = Schema.Struct({
  grants: Schema.Array(GrantEntrySchema),
});

const GrantListTable = {
  columns: {
    subject: { header: "Subject" },
    role: { header: "Role" },
    grantedBy: { header: "Granted by" },
    createdAt: { header: "Created" },
  },
} as const satisfies TableView<GrantListRow>;

const parseExtensionRef = (input: string): Effect.Effect<RegistryExtensionReference, AppError> =>
  Effect.gen(function* () {
    const fqn = yield* Result.mapError(parseFqn(input), fqnInvalidErrorToAppError);
    return {
      owner: fqn.owner,
      type: toExtensionTypePlural(fqn.type),
      name: fqn.name,
    };
  });

const formatRef = (ref: RegistryExtensionReference): string =>
  `${ref.owner}/${ref.type}/${ref.name}`;

const parseSubjectKind = (input: string): Effect.Effect<GrantSubjectKind, AppError> => {
  switch (input) {
    case "user":
    case "team":
      return Effect.succeed(input);
    default:
      return Effect.fail(
        makeAppError({
          code: "validation",
          detail: `Invalid grant subject kind: ${input}`,
          suggestions: [{ description: "Use `user` or `team`." }],
        }),
      );
  }
};

const parseGrantRole = (input: string): Effect.Effect<ExtensionGrantRole, AppError> => {
  switch (input) {
    case "read":
    case "write":
      return Effect.succeed(input);
    case "admin":
      return Effect.fail(
        makeAppError({
          code: "validation",
          detail: "Admin is not grantable as a grant role.",
          suggestions: [{ description: "Transfer maintainer authority instead." }],
        }),
      );
    default:
      return Effect.fail(
        makeAppError({
          code: "validation",
          detail: `Invalid grant role: ${input}`,
          suggestions: [{ description: "Use `read` or `write`." }],
        }),
      );
  }
};

const formatGrantSubject = (grant: ExtensionGrantEntry): string => {
  switch (grant.subject.kind) {
    case "user":
      return `user ${grant.subject.userId}`;
    case "team":
      return `team ${grant.subject.teamId}`;
  }
};

const toGrantListRow = (grant: ExtensionGrantEntry): GrantListRow => ({
  subject: formatGrantSubject(grant),
  role: grant.role,
  grantedBy: grant.grantedBy ?? "-",
  createdAt: grant.createdAt,
});

const emitGrantMutationResult = (args: {
  readonly name: string;
  readonly label: string;
  readonly message: string;
}) =>
  emitPlanResolutionResult("grant.mutate", {
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

const handleGrantList = (extRef: string) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const ref = yield* parseExtensionRef(extRef);
    const result = yield* listExtensionGrants(ref);

    if (yield* renderer.result(result, GrantListOutputSchema)) {
      return;
    }

    yield* renderer.table(result.grants.map(toGrantListRow), GrantListTable, "Extension grants");
  });

const handleGrantAdd = (input: {
  readonly extRef: string;
  readonly subjectKind: string;
  readonly subjectId: string;
  readonly role: string;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const ref = yield* parseExtensionRef(input.extRef);
    const subjectKind = yield* parseSubjectKind(input.subjectKind);
    const role = yield* parseGrantRole(input.role);

    if (subjectKind === "user") {
      yield* upsertUserExtensionGrant(ref, { userId: input.subjectId, role });
    } else {
      yield* upsertTeamExtensionGrant(ref, { teamId: input.subjectId, role });
    }

    const extension = formatRef(ref);
    const subject = `${subjectKind} ${input.subjectId}`;
    const message = `Granted ${role} to ${subject} on ${extension}.`;
    if (
      yield* emitGrantMutationResult({
        name: "Update extension grant",
        label: "Update extension grant",
        message,
      })
    ) {
      return;
    }

    yield* renderer.success(message);
  });

const handleGrantRemove = (input: {
  readonly extRef: string;
  readonly subjectKind: string;
  readonly subjectId: string;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const ref = yield* parseExtensionRef(input.extRef);
    const subjectKind = yield* parseSubjectKind(input.subjectKind);

    if (subjectKind === "user") {
      yield* deleteUserExtensionGrant(ref, { userId: input.subjectId });
    } else {
      yield* deleteTeamExtensionGrant(ref, { teamId: input.subjectId });
    }

    const extension = formatRef(ref);
    const subject = `${subjectKind} ${input.subjectId}`;
    const message = `Removed grant for ${subject} on ${extension}.`;
    if (
      yield* emitGrantMutationResult({
        name: "Remove extension grant",
        label: "Remove extension grant",
        message,
      })
    ) {
      return;
    }

    yield* renderer.success(message);
  });

const grantListConfig = {
  extRef: Argument.string("ext-ref").pipe(
    Argument.withDescription("Extension FQN, for example @acme/skills/code-review"),
  ),
} as const;

const grantAddConfig = {
  extRef: Argument.string("ext-ref").pipe(
    Argument.withDescription("Extension FQN, for example @acme/skills/code-review"),
  ),
  subjectKind: Argument.string("subject").pipe(
    Argument.withDescription("Subject kind: user or team"),
  ),
  subjectId: Argument.string("id").pipe(
    Argument.withDescription("Registry user_... or team_... identifier"),
  ),
  role: Flag.string("role").pipe(Flag.withDescription("Grant role: read or write")),
} as const;

const grantRemoveConfig = {
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

const grantListCommand = Command.make("ls", grantListConfig, ({ extRef }) =>
  handleGrantList(extRef).pipe(withAuthRuntime("grant ls")),
).pipe(
  withArgvTracking(grantListConfig),
  Command.withDescription("List direct user and team grants for an extension"),
  Command.withExamples([
    {
      command: "axm grant ls @acme/skills/code-review",
      description: "List grants for an extension",
    },
  ]),
);

const grantAddCommand = Command.make(
  "add",
  grantAddConfig,
  ({ extRef, subjectKind, subjectId, role }) =>
    handleGrantAdd({ extRef, subjectKind, subjectId, role }).pipe(withAuthRuntime("grant add")),
).pipe(
  withArgvTracking(grantAddConfig),
  Command.withDescription("Create or update a user or team grant for an extension"),
  Command.withExamples([
    {
      command:
        "axm grant add @acme/skills/code-review user user_01h455vb4pexka56gq5w2r7cpc --role read",
      description: "Grant a user read access",
    },
  ]),
);

const grantRemoveCommand = Command.make(
  "rm",
  grantRemoveConfig,
  ({ extRef, subjectKind, subjectId }) =>
    handleGrantRemove({ extRef, subjectKind, subjectId }).pipe(withAuthRuntime("grant rm")),
).pipe(
  withArgvTracking(grantRemoveConfig),
  Command.withDescription("Remove a user or team grant from an extension"),
  Command.withExamples([
    {
      command: "axm grant rm @acme/skills/code-review team team_01h455vb4pexka56gq5w2r7cpc",
      description: "Remove a team grant",
    },
  ]),
);

export const grantCommand = Command.make("grant").pipe(
  Command.withDescription("Manage extension read/write grants"),
  Command.withExamples([
    {
      command: "axm grant ls @acme/skills/code-review",
      description: "List grants for an extension",
    },
    {
      command:
        "axm grant add @acme/skills/code-review user user_01h455vb4pexka56gq5w2r7cpc --role read",
      description: "Grant a user read access",
    },
    {
      command: "axm grant rm @acme/skills/code-review team team_01h455vb4pexka56gq5w2r7cpc",
      description: "Remove a team grant",
    },
  ]),
  Command.withSubcommands([grantListCommand, grantAddCommand, grantRemoveCommand]),
);
