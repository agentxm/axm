import * as Schema from "effect/Schema";

export const SLUG_PATTERN_SOURCE = "[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?";
export const HANDLE_PATTERN_SOURCE = `@${SLUG_PATTERN_SOURCE}`;

export const SLUG_PATTERN = new RegExp(`^${SLUG_PATTERN_SOURCE}$`);
export const HANDLE_PATTERN = new RegExp(`^${HANDLE_PATTERN_SOURCE}$`);

export const SlugSchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(SLUG_PATTERN, {
      message: "Expected a valid slug (lowercase alphanumeric, hyphens, and underscores)",
    }),
  ),
  Schema.annotate({
    identifier: "Slug",
    title: "Slug",
    description: "A short name using lowercase letters, numbers, hyphens, and underscores.",
    examples: ["my-org", "user_name"],
    message: "Expected a valid slug (e.g., my-org)",
  }),
  Schema.brand("Slug"),
);

export type Slug = Schema.Schema.Type<typeof SlugSchema>;

export const HandleSchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(HANDLE_PATTERN, {
      message: "Expected a valid handle starting with @ (e.g., @my-org)",
    }),
  ),
  Schema.annotate({
    identifier: "Handle",
    title: "Handle",
    description: "A unique username or organization name starting with @, like @my-org.",
    examples: ["@my-org", "@username"],
    message: "Expected a valid handle (e.g., @my-org)",
  }),
  Schema.brand("Handle"),
);

export type Handle = Schema.Schema.Type<typeof HandleSchema>;

export const decodeHandleSync = Schema.decodeUnknownSync(HandleSchema);
export const decodeSlugSync = Schema.decodeUnknownSync(SlugSchema);

export const handleFromSlug = (slug: Slug): Handle => decodeHandleSync(`@${slug}`);

export const slugFromHandle = (handle: Handle): Slug => decodeSlugSync(handle.slice(1));

export const normalizeSlug = (slug: string): Slug => decodeSlugSync(slug.trim().toLowerCase());

export const normalizeHandle = (handle: string): Handle =>
  decodeHandleSync(handle.trim().toLowerCase());
