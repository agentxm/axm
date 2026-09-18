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

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export const TOKEN_PERMISSION_LEVELS = ["read", "publish", "admin"] as const;

export type TokenPermissionLevel = (typeof TOKEN_PERMISSION_LEVELS)[number];

/** What each level lets a token do, in the words every surface uses. */
const TOKEN_PERMISSION_LABELS = {
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

/**
 * A token's permissions, in the public vocabulary and nothing else. The
 * Registry's document also names its internal permission model; decoding
 * leaves that behind, so no surface repeats it.
 */
export const TokenPermissionsSchema = Schema.Struct({
  owners: Schema.Array(Schema.String),
  extensions: Schema.Array(Schema.String),
  permission: Schema.Literals(TOKEN_PERMISSION_LEVELS),
});

export type TokenPermissions = typeof TokenPermissionsSchema.Type;

const decodePermissions = Schema.decodeUnknownOption(TokenPermissionsSchema);

/**
 * Reads the permission document the Registry returned, or null for one this
 * vocabulary does not name: reporting nothing is more honest than inventing a
 * level for it.
 */
export const readTokenPermissions = (permissions: unknown): TokenPermissions | null =>
  Option.getOrNull(decodePermissions(permissions));

/** One line saying what a token may do and where, in the words every surface uses. */
export const describeTokenPermissions = (document: TokenPermissions | null): string => {
  if (document === null) return "not described";
  const level = TOKEN_PERMISSION_LABELS[document.permission];
  const reach =
    document.owners.includes("all") ||
    (document.owners.length === 0 && document.extensions.length === 0)
      ? "everything you can reach"
      : [...document.owners, ...document.extensions].join(", ");
  return `${level} — ${reach}`;
};
