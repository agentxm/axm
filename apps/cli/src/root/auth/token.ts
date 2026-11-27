import {
  withParameterDefault,
  withParameterDescription,
  withParameterRange,
} from "../../cli-parameters.js";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/cli";

import {
  currentToken,
  describeTokenPermissions,
  readTokenPermissions,
  listTokens,
  revokeToken,
  selectedRegistry,
  TokenPermissionsSchema,
} from "@agentxm/registry-access/authentication";
import { jsonFlag, registryFlag } from "../../cli-flags/index.js";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import { emitResult, Screen, count, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { publicRecoveryValue, recoveryOption } from "@agentxm/workspace-kernel/operations";
import { makeConfirmationRecovery, retrySuggestion } from "../shared/confirmation-recovery.js";
import { coerceAuthFailure } from "../../feature-errors.js";
import { withRuntime } from "../../runtime.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { makeAppError } from "../../app-error/index.js";
import {
  directWriteCapabilities,
  groupCapabilities,
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

const TokenListItemSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  type: Schema.String,
  permissions: Schema.NullOr(TokenPermissionsSchema),
  createdAt: DateTimeUtcSchema,
  expiresAt: DateTimeUtcSchema,
  lastUsedAt: Schema.NullOr(DateTimeUtcSchema),
});
const TokenListDocumentFields = {
  items: Schema.Array(TokenListItemSchema),
  count: Schema.Number,
  hasMore: Schema.Boolean,
  cursor: Schema.NullOr(Schema.String),
} satisfies Schema.Struct.Fields;
export const TokenListDocumentSchema = Schema.Struct(TokenListDocumentFields);

const RevokeTokenResultSchema = Schema.Struct({
  status: Schema.Literal("revoked"),
  tokenId: Schema.String,
});
const RevokeTokenDocumentFields = {
  result: RevokeTokenResultSchema,
} satisfies Schema.Struct.Fields;
export const RevokeTokenDocumentSchema = Schema.Struct(RevokeTokenDocumentFields);

const RevokeTokenSuggestions = [
  { description: "List remaining tokens", cmd: "axm token list" },
] satisfies ReadonlyArray<SuggestedAction>;

interface TokenTableItem {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly canDo: string;
  readonly expiresAt: string;
  readonly lastUsedAt: string;
}

const TokenListColumns = [
  { header: "ID", role: "name", priority: "required", value: (row: TokenTableItem) => row.id },
  { header: "Name", value: (row: TokenTableItem) => row.name },
  { header: "Type", value: (row: TokenTableItem) => row.type },
  { header: "Can do", value: (row: TokenTableItem) => row.canDo },
  { header: "Expires", value: (row: TokenTableItem) => row.expiresAt },
  { header: "Last used", priority: "optional", value: (row: TokenTableItem) => row.lastUsedAt },
] satisfies ReadonlyArray<ViewColumn<TokenTableItem>>;

export interface TokenHandlerArgs {
  readonly plain?: boolean;
}

const plainFlag = Flag.Boolean("plain").pipe(
  withParameterDescription(
    "Write only the secret to stdout; required when stdout is not a terminal",
  ),
  withParameterDefault(false),
);

const resolveCredentialOutput = (requested: boolean | undefined) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const facts = yield* screen.facts;
    const json = Option.getOrElse(yield* jsonFlag, () => false);
    const nonInteractive = !(yield* screen.canAsk);

    if (json) {
      return yield* makeAppError({
        code: "usage",
        detail:
          "Token credentials cannot be returned as JSON. Use --plain to write only the token to stdout.",
      });
    }
    if (requested === true) return "token" as const;
    if (nonInteractive || !facts.stdoutIsTTY) {
      return yield* makeAppError({
        code: "usage",
        detail: "Non-interactive token access requires --plain to write only the secret to stdout.",
      });
    }
    return "human" as const;
  });

export const handleToken = Effect.fn("AuthToken.handle")(
  function* (args: TokenHandlerArgs) {
    yield* resolveCredentialOutput(args.plain);
    const registry = yield* selectedRegistry("Showing a token");
    const screen = yield* Screen;

    const token = yield* currentToken(registry);
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

export const handleListTokens = Effect.fn("AuthTokenList.handle")(
  function* (page: { readonly limit?: number; readonly cursor?: string }) {
    const registry = yield* selectedRegistry("Listing tokens");
    const limit = page.limit ?? 50;
    const result = yield* withLiveOperation(
      { name: "List registry tokens", mode: "query" },
      listTokens(registry, {
        limit,
        ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
      }),
    );
    const continuation =
      result.hasMore && result.cursor !== null
        ? [
            retrySuggestion(
              "List the next page of tokens",
              yield* makeConfirmationRecovery([
                recoveryOption("--registry", publicRecoveryValue(registry.endpoint.href)),
                recoveryOption("--limit", publicRecoveryValue(String(limit))),
                recoveryOption("--cursor", publicRecoveryValue(result.cursor)),
              ]),
            ),
          ]
        : [];

    yield* emitResult(
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
      () => {
        const rows = result.tokens.map((item) => ({
          id: item.id,
          name: item.name ?? "",
          type: item.type,
          canDo: describeTokenPermissions(readTokenPermissions(item.permissions)),
          expiresAt: DateTime.formatIso(item.expiresAt),
          lastUsedAt: item.lastUsedAt === null ? "never" : DateTime.formatIso(item.lastUsedAt),
        }));
        return [
          ...inventoryDoc({
            rows,
            columns: TokenListColumns,
            summary: [count(rows.length, "token")],
            empty: { statement: "No tokens found" },
          }),
          ...(continuation.length === 0 ? [] : [{ _tag: "next", actions: continuation } as const]),
        ];
      },
    );
  },
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

export const handleRevokeToken = Effect.fn("AuthTokenRevoke.handle")(
  function* (tokenId: string) {
    const registry = yield* selectedRegistry("Revoking a token");
    yield* withLiveOperation(
      { name: `Revoke registry token ${tokenId}`, mode: "apply" },
      revokeToken(tokenId, registry),
    );

    yield* emitResult(
      { result: { status: "revoked", tokenId } },
      RevokeTokenDocumentSchema,
      () => [
        {
          _tag: "headline",
          tone: "ok",
          text: `Revoked token ${tokenId}. It is refused on its next request.`,
        },
        { _tag: "next", actions: RevokeTokenSuggestions },
      ],
      {
        suggestions: RevokeTokenSuggestions,
        completion: { mode: "apply", outcome: "applied", exitCode: 0 },
      },
    );
  },
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

const tokenConfig = { plain: plainFlag, registry: registryFlag } as const;

const listTokenConfig = {
  registry: registryFlag,
  limit: Flag.Int("limit").pipe(
    withParameterRange(1, 100),
    withParameterDefault(50),
    withParameterDescription("Tokens per page"),
  ),
  cursor: Flag.String("cursor").pipe(
    withParameterDescription("Continue from the cursor returned by the previous page"),
    Flag.optional,
  ),
} as const;

const listTokenCommand = Command.make("list", listTokenConfig, ({ registry, limit, cursor }) =>
  handleListTokens({
    limit,
    ...Option.match(cursor, { onNone: () => ({}), onSome: (cursor) => ({ cursor }) }),
  }).pipe(withRuntime({ registry })),
).pipe(
  withArgvTracking(listTokenConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List granular access tokens"),
  Command.withExamples([
    { command: "axm token list", description: "List your granular access tokens" },
  ]),
);

const revokeTokenConfig = {
  registry: registryFlag,
  id: Argument.String("id").pipe(withParameterDescription("Token ID to revoke")),
} as const;

const revokeTokenCommand = Command.make("revoke", revokeTokenConfig, ({ id, registry }) =>
  handleRevokeToken(id).pipe(withRuntime({ registry })),
).pipe(
  withArgvTracking(revokeTokenConfig),
  withCommandCapabilities(directWriteCapabilities("credentials")),
  Command.withDescription("Revoke a granular access token"),
  Command.withExamples([
    { command: "axm token revoke token_123", description: "Revoke a granular access token" },
  ]),
);

const showTokenCommand = Command.make("show", tokenConfig, ({ plain, registry }) =>
  handleToken({ plain }).pipe(withRuntime({ registry })),
).pipe(
  withArgvTracking(tokenConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Show the effective authentication token"),
  Command.withExamples([
    { command: "axm token show", description: "Show your auth token in a terminal" },
    {
      command: "axm token show --plain",
      description: "Write only your auth token for another tool",
    },
  ]),
);

export const tokenCommand = Command.make("token").pipe(
  withCommandCapabilities(groupCapabilities),
  Command.withDescription("Show and manage Registry authentication tokens"),
  Command.withExamples([
    { command: "axm token show", description: "Show your effective authentication token" },
    { command: "axm token list", description: "List your granular access tokens" },
  ]),
  Command.withSubcommands([showTokenCommand, listTokenCommand, revokeTokenCommand]),
);
