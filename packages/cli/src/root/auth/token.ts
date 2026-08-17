import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { AuthClient, RegistryUrl, resolveRequiredToken } from "@agentxm/client-core/unstable/auth";
import {
  errAuthRequired,
  makeAppError,
  type AppError,
} from "@agentxm/client-core/unstable/app-error";
import { jsonFlag } from "@agentxm/client-core/unstable/cli-flags";
import { DateTimeUtcSchema } from "@agentxm/client-core/unstable/date-time";
import {
  CliRenderer,
  type DetailView,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import {
  OperationPlanFields,
  makeSingleStepOperationPlan,
  type SuggestedAction,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";
import { withRuntime } from "../../runtime.js";
import { runWithStepUp } from "../step-up.js";

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
  scopes: Schema.Array(Schema.String),
  createdAt: DateTimeUtcSchema,
  expiresAt: DateTimeUtcSchema,
});
export const CreatedTokenResultSchema = Schema.Struct({
  ...OperationPlanFields,
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
  scopes: Schema.Array(Schema.String),
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
  ...OperationPlanFields,
  status: Schema.Literal("revoked"),
  tokenId: Schema.String,
  stepUpCompleted: Schema.Boolean,
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
  readonly expiresAt: string;
}

const createTokenSuggestions = (tokenId: string): ReadonlyArray<SuggestedAction> => [
  { description: "List tokens", cmd: "axm token list" },
  { description: "Revoke this token", cmd: `axm token revoke ${tokenId}` },
];

const CreatedTokenDetail = {
  fields: {
    id: { label: "ID" },
    name: { label: "Name" },
    token: { label: "Token" },
    expiresAt: { label: "Expires" },
  },
} as const satisfies DetailView<CreatedTokenDetailItem>;

interface TokenTableItem {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly expiresAt: string;
  readonly lastUsedAt: string;
}

const TokenListTable = {
  columns: {
    id: { header: "ID" },
    name: { header: "Name" },
    type: { header: "Type" },
    expiresAt: { header: "Expires" },
    lastUsedAt: { header: "Last used" },
  },
} as const satisfies TableView<TokenTableItem>;

export interface CreateTokenHandlerArgs {
  readonly name: string;
  readonly expires: string;
  readonly owners: readonly string[];
  readonly extensions: readonly string[];
  readonly permission: Option.Option<"read" | "publish" | "admin">;
  readonly orgPermission: Option.Option<"read" | "write" | "admin">;
  readonly cidr: readonly string[];
  readonly bypassMfa: boolean;
}

const MAX_EXPIRES_IN_SECONDS = 31_536_000;
const MIN_EXPIRES_IN_SECONDS = 3_600;

export const parseExpiresInSeconds = (raw: string): Effect.Effect<number, AppError> => {
  const trimmed = raw.trim();
  const relative = /^(\d+)([hdy])$/.exec(trimmed);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const multiplier = unit === "h" ? 3_600 : unit === "d" ? 86_400 : 31_536_000;
    return Effect.succeed(amount * multiplier);
  }

  return Option.match(DateTime.make(trimmed), {
    onNone: () =>
      Effect.fail(
        makeAppError({
          code: "validation",
          detail: "Invalid --expires value. Use 7d, 30d, 1y, or an ISO timestamp.",
        }),
      ),
    onSome: (expiry) =>
      Effect.map(DateTime.now, (now) =>
        Math.floor(Duration.toSeconds(DateTime.distance(now, expiry))),
      ),
  });
};

const validateExpiresInSeconds = (expiresIn: number) =>
  expiresIn < MIN_EXPIRES_IN_SECONDS || expiresIn > MAX_EXPIRES_IN_SECONDS
    ? Effect.fail(
        makeAppError({
          code: "validation",
          detail: "Token expiry must be between 1 hour and 365 days.",
        }),
      )
    : Effect.succeed(expiresIn);

const compactPermissions = (args: CreateTokenHandlerArgs) => ({
  ...(args.owners.length > 0 ? { owners: args.owners } : {}),
  ...(args.extensions.length > 0 ? { extensions: args.extensions } : {}),
  ...(Option.isSome(args.permission) ? { permission: args.permission.value } : {}),
  ...(Option.isSome(args.orgPermission) ? { org_permission: args.orgPermission.value } : {}),
  ...(args.cidr.length > 0 ? { cidr: args.cidr } : {}),
  ...(args.bypassMfa ? { bypass_mfa: true } : {}),
});

export const handleToken = Effect.fn("AuthToken.handle")(function* () {
  const registryUrl = yield* RegistryUrl;
  const renderer = yield* CliRenderer;
  const json = Option.getOrElse(yield* jsonFlag, () => false);

  // Step 1: Resolve token
  const token = yield* resolveRequiredToken(registryUrl, {
    missingTokenError: errAuthRequired("No token available"),
  });

  // Step 2: Output raw token to stdout, unless --json was explicitly requested
  if (json && (yield* renderer.result({ data: { token: token.token } }, TokenDocumentSchema)))
    return;

  yield* renderer.raw(token.token + "\n");
}, Effect.asVoid);

export const handleCreateToken = Effect.fn("AuthTokenCreate.handle")(function* (
  args: CreateTokenHandlerArgs,
) {
  const registryUrl = yield* RegistryUrl;
  const authClient = yield* AuthClient;
  const renderer = yield* CliRenderer;
  const token = yield* resolveRequiredToken(registryUrl, {
    missingTokenError: errAuthRequired("Not authenticated"),
  });

  const expiresIn = yield* parseExpiresInSeconds(args.expires).pipe(
    Effect.flatMap(validateExpiresInSeconds),
  );

  const createResult = yield* runWithStepUp(
    (stepUpRequestId) =>
      authClient.createToken(
        token.token,
        {
          name: args.name,
          expiresIn,
          permissions: compactPermissions(args),
        },
        stepUpRequestId === undefined ? undefined : { stepUpRequestId },
      ),
    {
      initial: `Creating registry token "${args.name}"`,
      success: `Created registry token "${args.name}"`,
      failure: `Failed to create registry token "${args.name}"`,
      cancelled: `Cancelled registry token "${args.name}" creation`,
      waiting: `Waiting for verification to create registry token "${args.name}"`,
      authorized: `Authorized registry token "${args.name}" creation`,
    },
  );
  const created = createResult.value;
  const suggestions = createTokenSuggestions(created.id);

  if (
    yield* renderer.result(
      {
        result: {
          ...makeSingleStepOperationPlan({
            planName: "Create AXM access token",
            planDescription: "Create a registry access token",
            message: `Created token ${created.id}`,
            stepLabel: "Registry access token",
            stepStatus: "applied",
            stepMessage: `Created token ${created.id}`,
            artifact: {
              path: created.id,
              scope: "user",
              change: "created",
            },
          }),
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
          scopes: created.scopes,
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

  yield* renderer.detail(
    {
      id: created.id,
      name: created.name,
      token: created.token,
      expiresAt: DateTime.formatIso(created.expiresAt),
    },
    CreatedTokenDetail,
    "Created token",
  );
  yield* renderer.suggestions(suggestions);
}, Effect.asVoid);

export const handleListTokens = Effect.fn("AuthTokenList.handle")(function* () {
  const registryUrl = yield* RegistryUrl;
  const authClient = yield* AuthClient;
  const renderer = yield* CliRenderer;
  const token = yield* resolveRequiredToken(registryUrl, {
    missingTokenError: errAuthRequired("Not authenticated"),
  });

  const result = yield* renderer.withSpinner(
    "Loading registry tokens",
    () => authClient.listTokens(token.token),
    { successMessage: "Loaded registry tokens" },
  );

  if (
    yield* renderer.result(
      {
        items: result.tokens.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          scopes: item.scopes,
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
    yield* renderer.list("token", {
      items: [],
      count: 0,
      emptyMessage: "No tokens found",
    });
    return;
  }

  yield* renderer.table(
    result.tokens.map((item) => ({
      id: item.id,
      name: item.name ?? "",
      type: item.type,
      expiresAt: DateTime.formatIso(item.expiresAt),
      lastUsedAt: item.lastUsedAt === null ? "never" : DateTime.formatIso(item.lastUsedAt),
    })),
    TokenListTable,
    "Tokens",
  );
}, Effect.asVoid);

export const handleRevokeToken = Effect.fn("AuthTokenRevoke.handle")(function* (tokenId: string) {
  const registryUrl = yield* RegistryUrl;
  const authClient = yield* AuthClient;
  const renderer = yield* CliRenderer;
  const token = yield* resolveRequiredToken(registryUrl, {
    missingTokenError: errAuthRequired("Not authenticated"),
  });

  const revokeResult = yield* runWithStepUp(
    (stepUpRequestId) =>
      authClient.deleteToken(
        token.token,
        tokenId,
        stepUpRequestId === undefined ? undefined : { stepUpRequestId },
      ),
    {
      initial: `Revoking registry token ${tokenId}`,
      success: `Revoked registry token ${tokenId}`,
      failure: `Failed to revoke registry token ${tokenId}`,
      cancelled: `Cancelled registry token ${tokenId} revocation`,
      waiting: `Waiting for verification to revoke token ${tokenId}`,
      authorized: `Authorized token ${tokenId} revocation`,
    },
  );

  if (
    yield* renderer.result(
      {
        result: {
          ...makeSingleStepOperationPlan({
            planName: "Revoke AXM access token",
            planDescription: "Revoke a registry access token",
            message: `Revoked token ${tokenId}`,
            stepLabel: "Registry access token",
            stepStatus: "applied",
            stepMessage: `Revoked token ${tokenId}`,
            artifact: {
              path: tokenId,
              scope: "user",
              change: "removed",
            },
          }),
          status: "revoked",
          tokenId,
          stepUpCompleted: revokeResult.stepUpCompleted,
        },
      },
      RevokeTokenDocumentSchema,
      { suggestions: RevokeTokenSuggestions },
    )
  ) {
    return;
  }

  yield* renderer.success(`Revoked token ${tokenId}.`, {
    suggestions: RevokeTokenSuggestions,
  });
}, Effect.asVoid);

const tokenConfig = {} as const;

const permissionValues = ["read", "publish", "admin"] as const;
const orgPermissionValues = ["read", "write", "admin"] as const;

const createTokenConfig = {
  name: Flag.string("name").pipe(Flag.withDescription("Human-readable token name")),
  expires: Flag.string("expires").pipe(
    Flag.withDescription("Token lifetime: 7d, 30d, 1y, or an ISO timestamp"),
    Flag.withDefault("30d"),
  ),
  owner: Flag.string("owner").pipe(
    Flag.withDescription('Owner selector; repeatable. Use "all" for full surface.'),
    Flag.atLeast(0),
  ),
  extension: Flag.string("extension").pipe(
    Flag.withDescription("Extension selector in @handle/<type>/<name> form; repeatable"),
    Flag.atLeast(0),
  ),
  permission: Flag.choice("permission", permissionValues).pipe(
    Flag.withDescription("Extension permission level"),
    Flag.optional,
  ),
  orgPermission: Flag.choice("org-permission", orgPermissionValues).pipe(
    Flag.withDescription("Organization permission level"),
    Flag.optional,
  ),
  cidr: Flag.string("cidr").pipe(
    Flag.withDescription("CIDR allowlist entry; repeatable"),
    Flag.atLeast(0),
  ),
  bypassMfa: Flag.boolean("bypass-mfa").pipe(
    Flag.withDescription("Allow this automation token to bypass step-up MFA"),
    Flag.withDefault(false),
  ),
} as const;

const createTokenCommand = Command.make(
  "create",
  createTokenConfig,
  ({ name, expires, owner, extension, permission, orgPermission, cidr, bypassMfa }) =>
    handleCreateToken({
      name,
      expires,
      owners: owner,
      extensions: extension,
      permission,
      orgPermission,
      cidr,
      bypassMfa,
    }).pipe(withRuntime("auth token create")),
).pipe(
  withArgvTracking(createTokenConfig),
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
  Command.withDescription("List granular access tokens"),
  Command.withExamples([
    { command: "axm token list", description: "List your granular access tokens" },
  ]),
);

const revokeTokenConfig = {
  id: Argument.string("id").pipe(Argument.withDescription("Token id to revoke")),
} as const;

const revokeTokenCommand = Command.make("revoke", revokeTokenConfig, ({ id }) =>
  handleRevokeToken(id).pipe(withRuntime("auth token revoke")),
).pipe(
  withArgvTracking(revokeTokenConfig),
  Command.withDescription("Revoke a granular access token"),
  Command.withExamples([
    { command: "axm token revoke token_123", description: "Revoke a granular access token" },
  ]),
);

export const tokenCommand = Command.make("token", tokenConfig, () =>
  handleToken().pipe(withRuntime("auth token")),
).pipe(
  withArgvTracking(tokenConfig),
  Command.withSubcommands([createTokenCommand, listTokenCommand, revokeTokenCommand]),
  Command.withDescription("Output current auth token to stdout"),
  Command.withExamples([
    {
      command: "axm auth token",
      description: "Print your auth token (e.g., for piping to another tool)",
    },
    { command: "axm token", description: "Same command via shortcut" },
    { command: "axm auth token --json", description: "Get the token as structured JSON" },
  ]),
);
