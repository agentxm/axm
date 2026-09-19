import { humanVerificationFlags, withHumanVerificationOptions } from "../../cli-flags/index.js";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  createToken,
  currentToken,
  describeTokenPermissions,
  readTokenPermissions,
  listTokens,
  revokeToken,
  selectedRegistry,
  TOKEN_PERMISSION_LEVELS,
  TokenPermissionsSchema,
  type CreatedToken,
  type CreateTokenRequest,
  type TokenPermissionLevel,
} from "@agentxm/registry-access/authentication";
import { HumanVerificationOptions, isNonInteractive, jsonFlag } from "../../cli-flags/index.js";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import {
  Screen,
  count,
  fieldsDoc,
  inventoryDoc,
  type ViewColumn,
  type ViewField,
} from "../../screen/index.js";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { coerceAuthFailure } from "../../feature-errors.js";
import { withRuntime } from "../../runtime.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { makeAppError } from "../../app-error/index.js";
import {
  directWriteCapabilities,
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

export const TokenListItemSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  type: Schema.String,
  permissions: Schema.NullOr(TokenPermissionsSchema),
  createdAt: DateTimeUtcSchema,
  expiresAt: DateTimeUtcSchema,
  lastUsedAt: Schema.NullOr(DateTimeUtcSchema),
});
export const TokenListDocumentFields = {
  items: Schema.Array(TokenListItemSchema),
  count: Schema.Number,
  hasMore: Schema.Boolean,
  cursor: Schema.NullOr(Schema.String),
} satisfies Schema.Struct.Fields;
export const TokenListDocumentSchema = Schema.Struct(TokenListDocumentFields);
export type TokenListDocument = typeof TokenListDocumentSchema.Type;

export const RevokeTokenResultSchema = Schema.Struct({
  status: Schema.Literal("revoked"),
  tokenId: Schema.String,
});
const RevokeTokenDocumentFields = {
  result: RevokeTokenResultSchema,
} satisfies Schema.Struct.Fields;
export const RevokeTokenDocumentSchema = Schema.Struct(RevokeTokenDocumentFields);
export type RevokeTokenDocument = typeof RevokeTokenDocumentSchema.Type;

const RevokeTokenSuggestions = [
  { description: "List remaining tokens", cmd: "axm token list" },
] satisfies ReadonlyArray<SuggestedAction>;

interface CreatedTokenDetailItem {
  readonly id: string;
  readonly name: string;
  readonly token: string;
  readonly canDo: string;
  readonly expiresAt: string;
}

const createTokenSuggestions = (tokenId: string): ReadonlyArray<SuggestedAction> => [
  { description: "List tokens", cmd: "axm token list" },
  { description: "Revoke this token", cmd: `axm token revoke ${tokenId}` },
];

const CreatedTokenFields = [
  { label: "ID", value: (row: CreatedTokenDetailItem) => row.id },
  { label: "Name", value: (row: CreatedTokenDetailItem) => row.name },
  { label: "Token", value: (row: CreatedTokenDetailItem) => row.token },
  { label: "Can do", value: (row: CreatedTokenDetailItem) => row.canDo },
  { label: "Expires", value: (row: CreatedTokenDetailItem) => row.expiresAt },
] satisfies ReadonlyArray<ViewField<CreatedTokenDetailItem>>;

interface TokenTableItem {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly canDo: string;
  readonly expiresAt: string;
  readonly lastUsedAt: string;
}

const TokenListColumns = [
  { header: "ID", priority: "required", value: (row: TokenTableItem) => row.id },
  { header: "Name", value: (row: TokenTableItem) => row.name },
  { header: "Type", value: (row: TokenTableItem) => row.type },
  { header: "Can do", value: (row: TokenTableItem) => row.canDo },
  { header: "Expires", value: (row: TokenTableItem) => row.expiresAt },
  { header: "Last used", priority: "optional", value: (row: TokenTableItem) => row.lastUsedAt },
] satisfies ReadonlyArray<ViewColumn<TokenTableItem>>;

export interface CreateTokenHandlerArgs {
  readonly name: string;
  readonly expires: string;
  readonly owners: readonly string[];
  readonly extensions: readonly string[];
  readonly permission: TokenPermissionLevel;
  readonly output?: "token" | "human";
}

export interface TokenHandlerArgs {
  readonly output?: "token" | "human";
}

const outputFlag = Flag.Literals("output", ["token", "human"]).pipe(
  Flag.withDescription(
    'Credential destination: "token" writes only the token to stdout; "human" shows the interactive one-time view',
  ),
  Flag.optional,
);

const resolveCredentialOutput = (requested: "token" | "human" | undefined) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const facts = yield* screen.facts;
    const json = Option.getOrElse(yield* jsonFlag, () => false);
    const nonInteractive = yield* isNonInteractive;

    if (json) {
      return yield* makeAppError({
        code: "usage",
        detail:
          "Token credentials cannot be returned as JSON. Use --output token to write only the token to stdout.",
      });
    }
    if (requested === "token") return requested;
    if (nonInteractive || !facts.stdoutIsTTY) {
      return yield* makeAppError({
        code: "usage",
        detail:
          requested === "human"
            ? "--output human requires an interactive terminal. Use --output token to write only the token to stdout."
            : "Non-interactive token access requires an explicit output mode. Use --output token.",
      });
    }
    return "human" as const;
  });

/** The invocation's human-verification inputs, as the capability reads them. */
const verificationOptions = (credentialOutput: "token" | "human") =>
  Effect.gen(function* () {
    const { stepUpRequest, waitForHuman } = yield* HumanVerificationOptions;
    // Raw output never opens a browser: stdout belongs to a consumer, so
    // approval proceeds as an unattended handoff on stderr.
    const unattended = (yield* isNonInteractive) || credentialOutput === "token";
    return {
      ...(Option.isNone(stepUpRequest) ? {} : { resumeReference: stepUpRequest.value }),
      ...(Option.isNone(waitForHuman) ? {} : { waitForHumanSeconds: waitForHuman.value }),
      unattended,
    };
  });

export const handleToken = Effect.fn("AuthToken.handle")(
  function* (args: TokenHandlerArgs) {
    yield* resolveCredentialOutput(args.output);
    const registry = yield* selectedRegistry;
    const screen = yield* Screen;

    const token = yield* currentToken(registry.url);
    yield* screen.credential(token + "\n");
  },
  Effect.catchTag("CredentialDeliveryFailed", (error) =>
    Effect.fail(
      makeAppError({
        code: "unavailable",
        detail:
          "The token could not be fully written to stdout; any bytes already written are incomplete.",
        suggestions: [
          { description: "Make sure the command reading stdout stays open, then run this again." },
        ],
        cause: error.cause,
      }),
    ),
  ),
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

type CleanupOutcome = "revoked" | "failed" | "timed-out";

/** Revocation after a failed delivery must not hold the process open indefinitely. */
const DELIVERY_CLEANUP_BUDGET = Duration.seconds(10);

const reportCleanup = (
  screen: typeof Screen.Service,
  tokenId: string,
  registryUrl: string,
  outcome: CleanupOutcome,
) =>
  screen
    .note([
      {
        _tag: "paragraph",
        tone: outcome === "revoked" ? "ok" : "warn",
        text:
          outcome === "revoked"
            ? `Revoked token ${tokenId} because it was not delivered to stdout.`
            : `Token ${tokenId} was not delivered to stdout and may still be active: automatic revocation ${outcome === "failed" ? "failed" : "timed out"}. Run: AXM_REGISTRY_URL=${registryUrl} axm token revoke ${tokenId}`,
      },
    ])
    .pipe(Effect.catchCause(() => Effect.void));

/**
 * Compensate for a token the Registry issued but stdout never acknowledged:
 * one bounded revocation of exactly that ID with the session that created it,
 * reported whatever its outcome.
 */
const revokeUndeliveredToken = (
  screen: typeof Screen.Service,
  tokenId: string,
  registryUrl: string,
) =>
  Effect.interruptible(revokeToken(tokenId, registryUrl)).pipe(
    Effect.timeoutOption(DELIVERY_CLEANUP_BUDGET),
    Effect.exit,
    Effect.flatMap((exit) =>
      reportCleanup(
        screen,
        tokenId,
        registryUrl,
        Exit.isFailure(exit) ? "failed" : Option.isNone(exit.value) ? "timed-out" : "revoked",
      ),
    ),
  );

/**
 * Issue a token and write only its secret to stdout. Approval and the create
 * request stay interruptible; once the Registry names the new token, it is
 * revoked unless stdout acknowledges the whole credential.
 */
const createAndDeliverToken = <E, R>(
  screen: typeof Screen.Service,
  create: Effect.Effect<CreatedToken, E, R>,
  registryUrl: string,
) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const created = yield* restore(create);
      const token = created.token;
      yield* restore(
        screen
          .note([
            {
              _tag: "paragraph",
              text: `Created token ${token.id} "${token.name}" (${describeTokenPermissions(readTokenPermissions(token.permissions))}); expires ${DateTime.formatIso(token.expiresAt)}.`,
            },
          ])
          .pipe(Effect.andThen(screen.credential(token.token + "\n"))),
      ).pipe(
        Effect.onExit((exit) =>
          Exit.isSuccess(exit)
            ? Effect.void
            : revokeUndeliveredToken(screen, token.id, registryUrl),
        ),
      );
      return created;
    }),
  );

export const handleCreateToken = Effect.fn("AuthTokenCreate.handle")(
  function* (args: CreateTokenHandlerArgs) {
    const screen = yield* Screen;
    const credentialOutput = yield* resolveCredentialOutput(args.output);
    const registry = yield* selectedRegistry;
    const request: CreateTokenRequest = {
      name: args.name,
      expires: args.expires,
      owners: args.owners,
      extensions: args.extensions,
      permission: args.permission,
      verification: yield* verificationOptions(credentialOutput),
    };
    const create = createToken(request, registry.url);
    // The operation settles only after raw delivery, so no observer hears
    // "completed" for a token stdout has not acknowledged.
    const createResult = yield* withLiveOperation(
      {
        command: "auth.token.create",
        name: `Create registry token "${args.name}"`,
        mode: "apply",
      },
      credentialOutput === "token" ? createAndDeliverToken(screen, create, registry.url) : create,
    );
    if (credentialOutput === "token") return;

    const created = createResult.token;
    const suggestions = createTokenSuggestions(created.id);
    const detail = {
      id: created.id,
      name: created.name,
      token: created.token,
      canDo: describeTokenPermissions(readTokenPermissions(created.permissions)),
      expiresAt: DateTime.formatIso(created.expiresAt),
    };
    yield* screen.result([
      { _tag: "headline", tone: "ok", text: "Created token" },
      ...fieldsDoc(detail, CreatedTokenFields),
      { _tag: "next", actions: suggestions },
    ]);
  },
  Effect.catchTag("CredentialDeliveryFailed", (error) =>
    Effect.fail(
      makeAppError({
        code: "unavailable",
        detail:
          "The created token could not be fully written to stdout; any bytes already written are incomplete. See stderr for the token ID and whether it was revoked.",
        suggestions: [
          { description: "Review your tokens before creating another", cmd: "axm token list" },
        ],
        cause: error.cause,
      }),
    ),
  ),
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

export const handleListTokens = Effect.fn("AuthTokenList.handle")(
  function* () {
    const registry = yield* selectedRegistry;
    const screen = yield* Screen;

    const result = yield* withLiveOperation(
      { command: "auth.token.list", name: "List registry tokens", mode: "preview" },
      listTokens(registry.url),
    );

    if (
      yield* screen.document(
        {
          items: result.tokens.map((item) => ({
            id: item.id,
            name: item.name,
            type: item.type,
            permissions: readTokenPermissions(item.permissions),
            createdAt: item.createdAt,
            expiresAt: item.expiresAt,
            lastUsedAt: item.lastUsedAt,
          })),
          count: result.tokens.length,
          hasMore: result.hasMore,
          cursor: result.cursor,
        },
        TokenListDocumentSchema,
      )
    ) {
      return;
    }

    if (result.tokens.length === 0) {
      yield* screen.result(
        inventoryDoc({
          rows: [],
          columns: TokenListColumns,
          empty: "No tokens found",
        }),
      );
      return;
    }

    const rows = result.tokens.map((item) => ({
      id: item.id,
      name: item.name ?? "",
      type: item.type,
      canDo: describeTokenPermissions(readTokenPermissions(item.permissions)),
      expiresAt: DateTime.formatIso(item.expiresAt),
      lastUsedAt: item.lastUsedAt === null ? "never" : DateTime.formatIso(item.lastUsedAt),
    }));
    yield* screen.result(
      inventoryDoc({
        rows,
        columns: TokenListColumns,
        summary: count(rows.length, "token"),
        empty: "No tokens found",
      }),
    );
  },
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

export const handleRevokeToken = Effect.fn("AuthTokenRevoke.handle")(
  function* (tokenId: string) {
    const registry = yield* selectedRegistry;
    const screen = yield* Screen;
    yield* withLiveOperation(
      { command: "auth.token.revoke", name: `Revoke registry token ${tokenId}`, mode: "apply" },
      revokeToken(tokenId, registry.url),
    );

    if (
      yield* screen.document(
        { result: { status: "revoked", tokenId } },
        RevokeTokenDocumentSchema,
        { suggestions: RevokeTokenSuggestions },
      )
    ) {
      return;
    }

    // Revocation evicts the cached credential in the same command, so the
    // bound a person needs is the next request, not a propagation window.
    yield* screen.result([
      {
        _tag: "headline",
        tone: "ok",
        text: `Revoked token ${tokenId}. It is refused on its next request.`,
      },
      { _tag: "next", actions: RevokeTokenSuggestions },
    ]);
  },
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

const tokenConfig = { output: outputFlag } as const;

const createTokenConfig = {
  ...humanVerificationFlags,
  output: outputFlag,
  name: Flag.String("name").pipe(Flag.withDescription("Human-readable token name")),
  expires: Flag.String("expires").pipe(
    Flag.withDescription(
      "Token lifetime: 7d, 30d, 1y, or an ISO timestamp. At most 90d for a publish or admin token, 1y for a read token.",
    ),
    Flag.withDefault("30d"),
  ),
  owner: Flag.String("owner").pipe(
    Flag.withDescription('Owner selector; repeatable. Use "all" for full surface.'),
    Flag.atLeast(0),
  ),
  extension: Flag.String("extension").pipe(
    Flag.withDescription("Extension selector in @handle/<type>/<name> form; repeatable"),
    Flag.atLeast(0),
  ),
  permission: Flag.Literals("permission", TOKEN_PERMISSION_LEVELS).pipe(
    Flag.withDescription(
      "What the token may do: read, publish, or admin. A token can do less than you, never more.",
    ),
  ),
} as const;

const createTokenCommand = Command.make(
  "create",
  createTokenConfig,
  ({ name, expires, owner, extension, permission, output }) =>
    handleCreateToken({
      name,
      expires,
      owners: owner,
      extensions: extension,
      permission,
      ...Option.match(output, {
        onNone: () => ({}),
        onSome: (value) => ({ output: value }),
      }),
    }).pipe(withRuntime("auth token create")),
).pipe(
  withHumanVerificationOptions,
  withArgvTracking(createTokenConfig),
  withCommandCapabilities(directWriteCapabilities("credentials")),
  Command.withDescription("Create a granular access token"),
  Command.withExamples([
    {
      command: "axm token create --name ci --owner @foo --permission publish",
      description: "Create a publish token scoped to @foo and show it once",
    },
    {
      command:
        "axm token create --name ci --extension @foo/skills/review --permission publish --wait-for-human 300 --output token",
      description: "Write only the new token to stdout for a pipe, waiting up to 300s for approval",
    },
  ]),
);

const listTokenConfig = {} as const;

const listTokenCommand = Command.make("list", listTokenConfig, () =>
  handleListTokens().pipe(withRuntime("auth token list")),
).pipe(
  withArgvTracking(listTokenConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List granular access tokens"),
  Command.withExamples([
    { command: "axm token list", description: "List your granular access tokens" },
  ]),
);

const revokeTokenConfig = {
  id: Argument.String("id").pipe(Argument.withDescription("Token id to revoke")),
} as const;

const revokeTokenCommand = Command.make("revoke", revokeTokenConfig, ({ id }) =>
  handleRevokeToken(id).pipe(withRuntime("auth token revoke")),
).pipe(
  withArgvTracking(revokeTokenConfig),
  withCommandCapabilities(directWriteCapabilities("credentials")),
  Command.withDescription("Revoke a granular access token"),
  Command.withExamples([
    { command: "axm token revoke token_123", description: "Revoke a granular access token" },
  ]),
);

export const tokenCommand = Command.make("token", tokenConfig, ({ output }) =>
  handleToken(
    Option.match(output, {
      onNone: () => ({}),
      onSome: (value) => ({ output: value }),
    }),
  ).pipe(withRuntime("auth token")),
).pipe(
  withArgvTracking(tokenConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withSubcommands([createTokenCommand, listTokenCommand, revokeTokenCommand]),
  Command.withDescription("Output current auth token to stdout"),
  Command.withExamples([
    { command: "axm token", description: "Show your auth token in a terminal" },
    {
      command: "axm token --output token",
      description: "Write only your auth token to stdout for another tool",
    },
  ]),
);
