import { humanVerificationFlags, withHumanVerificationOptions } from "../../cli-flags/index.js";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
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
import {
  directWriteCapabilities,
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

export const TokenDataSchema = Schema.Struct({
  token: Schema.String,
});
const TokenDocumentFields = {
  data: TokenDataSchema,
} satisfies Schema.Struct.Fields;
export const TokenDocumentSchema = Schema.Struct(TokenDocumentFields);
export type TokenDocument = typeof TokenDocumentSchema.Type;

export const CreatedTokenDataSchema = Schema.Struct({
  id: Schema.String,
  token: Schema.String,
  name: Schema.String,
  permissions: Schema.NullOr(TokenPermissionsSchema),
  createdAt: DateTimeUtcSchema,
  expiresAt: DateTimeUtcSchema,
});
export const CreatedTokenResultSchema = Schema.Struct({
  status: Schema.Literal("created"),
  tokenId: Schema.String,
  name: Schema.String,
  expiresAt: DateTimeUtcSchema,
  stepUpCompleted: Schema.Boolean,
});
const CreatedTokenDocumentFields = {
  result: CreatedTokenResultSchema,
  data: CreatedTokenDataSchema,
} satisfies Schema.Struct.Fields;
export const CreatedTokenDocumentSchema = Schema.Struct(CreatedTokenDocumentFields);
export type CreatedTokenDocument = typeof CreatedTokenDocumentSchema.Type;

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
}

/** The invocation's human-verification inputs, as the capability reads them. */
const verificationOptions = Effect.gen(function* () {
  const { stepUpRequest, waitForHuman } = yield* HumanVerificationOptions;
  const unattended = (yield* isNonInteractive) || Option.getOrElse(yield* jsonFlag, () => false);
  return {
    ...(Option.isNone(stepUpRequest) ? {} : { resumeReference: stepUpRequest.value }),
    ...(Option.isNone(waitForHuman) ? {} : { waitForHumanSeconds: waitForHuman.value }),
    unattended,
  };
});

export const handleToken = Effect.fn("AuthToken.handle")(
  function* () {
    const registry = yield* selectedRegistry;
    const screen = yield* Screen;
    const json = Option.getOrElse(yield* jsonFlag, () => false);

    const token = yield* currentToken(registry.url);

    // Raw token to stdout, unless --json was explicitly requested
    if (json && (yield* screen.document({ data: { token } }, TokenDocumentSchema))) return;

    yield* screen.result([{ _tag: "raw", content: token + "\n" }]);
  },
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

export const handleCreateToken = Effect.fn("AuthTokenCreate.handle")(
  function* (args: CreateTokenHandlerArgs) {
    const registry = yield* selectedRegistry;
    const screen = yield* Screen;
    const request: CreateTokenRequest = {
      name: args.name,
      expires: args.expires,
      owners: args.owners,
      extensions: args.extensions,
      permission: args.permission,
      verification: yield* verificationOptions,
    };
    const createResult = yield* withLiveOperation(
      {
        command: "auth.token.create",
        name: `Create registry token "${args.name}"`,
        mode: "apply",
      },
      createToken(request, registry.url),
    );
    const created = createResult.token;
    const suggestions = createTokenSuggestions(created.id);

    if (
      yield* screen.document(
        {
          result: {
            status: "created",
            tokenId: created.id,
            name: created.name,
            expiresAt: created.expiresAt,
            stepUpCompleted: createResult.stepUpCompleted,
          },
          data: {
            id: created.id,
            token: created.token,
            name: created.name,
            permissions: readTokenPermissions(created.permissions),
            createdAt: created.createdAt,
            expiresAt: created.expiresAt,
          },
        },
        CreatedTokenDocumentSchema,
        { suggestions },
      )
    ) {
      return;
    }

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

const tokenConfig = {} as const;

const createTokenConfig = {
  ...humanVerificationFlags,
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
  ({ name, expires, owner, extension, permission }) =>
    handleCreateToken({
      name,
      expires,
      owners: owner,
      extensions: extension,
      permission,
    }).pipe(withRuntime("auth token create")),
).pipe(
  withHumanVerificationOptions,
  withArgvTracking(createTokenConfig),
  withCommandCapabilities(directWriteCapabilities("credentials")),
  Command.withDescription("Create a granular access token"),
  Command.withExamples([
    {
      command: "axm token create --name ci --owner @foo --permission publish",
      description: "Create a publish token scoped to @foo",
    },
    {
      command: "axm token create --name read-only --permission read --expires 30d",
      description: "Create a read-only token",
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

export const tokenCommand = Command.make("token", tokenConfig, () =>
  handleToken().pipe(withRuntime("auth token")),
).pipe(
  withArgvTracking(tokenConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withSubcommands([createTokenCommand, listTokenCommand, revokeTokenCommand]),
  Command.withDescription("Output current auth token to stdout"),
  Command.withExamples([
    {
      command: "axm token",
      description: "Print your auth token (e.g., for piping to another tool)",
    },
    { command: "axm token --json", description: "Get the token as structured JSON" },
  ]),
);
