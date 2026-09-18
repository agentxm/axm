/**
 * The public vocabulary a limited credential is described in.
 *
 * A personal access token carries one permission level, an optional allowlist
 * of owners and extensions, and an expiry. The Registry owns this vocabulary
 * and reports it back on every token; these labels and bounds mirror it so a
 * token reads the same here as it does on the web.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

export const TOKEN_PERMISSION_LEVELS = ["read", "publish", "admin"] as const;

export type TokenPermissionLevel = (typeof TOKEN_PERMISSION_LEVELS)[number];

/** What each level lets a token do, in the words every surface uses. */
export const TOKEN_PERMISSION_LABELS = {
  read: "Read extensions",
  publish: "Publish versions",
  admin: "Administer extensions",
} as const satisfies Record<TokenPermissionLevel, string>;

const READ_MAX_LIFETIME_SECONDS = 31_536_000;
const WRITE_MAX_LIFETIME_SECONDS = 7_776_000;

/**
 * How long a token of each level may live. A token that can change the
 * registry is worth more to an attacker than one that can only read it.
 */
export const maxTokenLifetimeSeconds = (permission: TokenPermissionLevel): number =>
  permission === "read" ? READ_MAX_LIFETIME_SECONDS : WRITE_MAX_LIFETIME_SECONDS;

export const TokenPermissionsSchema = Schema.Struct({
  model: Schema.Literal("gat"),
  owners: Schema.Array(Schema.String),
  extensions: Schema.Array(Schema.String),
  permission: Schema.Literals(TOKEN_PERMISSION_LEVELS),
});

export type TokenPermissions = typeof TokenPermissionsSchema.Type;

const decodePermissions = Schema.decodeUnknownOption(TokenPermissionsSchema);

/**
 * Reads the permission document the Registry returned. A token minted before
 * the vocabulary narrowed may carry something this shape does not name; saying
 * so is more honest than inventing a level for it.
 */
export const describeTokenPermissions = (permissions: unknown): string => {
  const decoded = decodePermissions(permissions);
  if (decoded._tag === "None") return "not described";
  const document = decoded.value;
  const level = TOKEN_PERMISSION_LABELS[document.permission];
  const reach =
    document.owners.includes("all") ||
    (document.owners.length === 0 && document.extensions.length === 0)
      ? "everything you can reach"
      : [...document.owners, ...document.extensions].join(", ");
  return `${level} — ${reach}`;
};
