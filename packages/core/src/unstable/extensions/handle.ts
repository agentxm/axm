import * as Schema from "effect/Schema";

const SLUG_SEGMENT_PATTERN_SOURCE = "[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?";

export const SLUG_PATTERN_SOURCE = `${SLUG_SEGMENT_PATTERN_SOURCE}(?:\\.${SLUG_SEGMENT_PATTERN_SOURCE})*`;
export const HANDLE_PATTERN_SOURCE = `@${SLUG_PATTERN_SOURCE}`;

export const SLUG_PATTERN = new RegExp(`^${SLUG_PATTERN_SOURCE}$`);
export const HANDLE_PATTERN = new RegExp(`^${HANDLE_PATTERN_SOURCE}$`);

export const SlugSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(SLUG_PATTERN)),
  Schema.brand("Slug"),
);

export type Slug = Schema.Schema.Type<typeof SlugSchema>;

export const HandleSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(HANDLE_PATTERN)),
  Schema.brand("Handle"),
);

export type Handle = Schema.Schema.Type<typeof HandleSchema>;

const decodeHandleSync = Schema.decodeUnknownSync(HandleSchema);
const decodeSlugSync = Schema.decodeUnknownSync(SlugSchema);

export const handleFromSlug = (slug: Slug): Handle => decodeHandleSync(`@${slug}`);

export const slugFromHandle = (handle: Handle): Slug => decodeSlugSync(handle.slice(1));

export const normalizeSlug = (slug: string): Slug => decodeSlugSync(slug.trim().toLowerCase());

export const normalizeHandle = (handle: string): Handle =>
  decodeHandleSync(handle.trim().toLowerCase());

// Internal escape hatch for call sites migrating from plain strings.
export const unsafeHandle = (handle: string): Handle => decodeHandleSync(handle);

// Internal escape hatch for call sites migrating from plain strings.
export const unsafeSlug = (slug: string): Slug => decodeSlugSync(slug);
