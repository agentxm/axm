import * as Schema from "effect/Schema";

/** Digest of the exact downloaded artifact bytes, independent of the unpacked tree. */
export const ArtifactDigestSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      /^sha256:[0-9a-f]{64}$/u.test(value)
        ? undefined
        : "Expected SHA-256 artifact digest in sha256:<hex> form",
    ),
  ),
  Schema.brand("ArtifactDigest"),
);
export type ArtifactDigest = typeof ArtifactDigestSchema.Type;

/** A relative file in a downloaded package, never a filesystem escape. */
export const ArtifactPathSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      value.includes("\\") ||
      value.includes("\0") ||
      value.startsWith("/") ||
      /^[A-Za-z]:/u.test(value) ||
      value.split("/").some((part) => part === ".." || part === "." || part.length === 0)
        ? "Expected a contained artifact file path"
        : undefined,
    ),
  ),
);

export const ArtifactUrlSchema = Schema.URLFromString.pipe(
  Schema.check(
    Schema.makeFilter((url: URL) =>
      url.protocol === "https:" && url.username === "" && url.password === ""
        ? undefined
        : "Expected a credential-free HTTPS artifact URL",
    ),
  ),
);

/** Accepted download inputs; replay verifies each exact artifact without re-reading discovery. */
export const HttpArtifactSnapshotSchema = Schema.Union([
  Schema.Struct({
    format: Schema.Literals(["skill-md", "zip", "tar", "tar.gz"]),
    url: ArtifactUrlSchema,
    digest: ArtifactDigestSchema,
  }),
  Schema.Struct({
    format: Schema.Literal("files"),
    files: Schema.Array(
      Schema.Struct({
        path: ArtifactPathSchema,
        url: ArtifactUrlSchema,
        digest: ArtifactDigestSchema,
      }),
    ).pipe(Schema.check(Schema.isMinLength(1))),
  }),
]);
export type HttpArtifactSnapshot = typeof HttpArtifactSnapshotSchema.Type;

/** Recognizable public artifact and discovery locations, leaving clone URLs to Git. */
export const httpSourceKind = (url: URL): "skill-md" | "archive" | "index" | undefined => {
  if (url.protocol !== "https:") return undefined;
  if (url.pathname.endsWith("/SKILL.md")) return "skill-md";
  if (/\.(zip|tar|tar\.gz|tgz)$/iu.test(url.pathname)) return "archive";
  if (
    url.pathname === "/" ||
    /^\/\.well-known\/(agent-skills|skills)(?:\/index\.json|\/?)$/u.test(url.pathname)
  )
    return "index";
  return undefined;
};
