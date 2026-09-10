/**
 * Published metadata for one extension, read from the registry that supplies it.
 *
 * Three decisions live here: which registry answers (the configured default,
 * or a named registry source the workspace configured), which extension a
 * handle names (a fully qualified handle, a bare name with an explicit type,
 * or a bare name that must match exactly one installed identity), and which
 * fields the answer carries. Reading published metadata never requires
 * management access.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import {
  extensionTypeToPlural,
  parseExtensionFqnParts,
  type ExtensionFqnParts,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { DeprecationViewSchema } from "@agentxm/extension-model/unstable/extensions/deprecation";
import {
  resolveIdentifier,
  type IdentifierResourceType,
  type ResolvedIdentifier,
} from "@agentxm/extension-sources";
import { RegistryClientFactory, RegistryUrl } from "@agentxm/registry-client";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry";
import { SettingsReader } from "@agentxm/workspace-state";

import { PublishedMetadataUnavailable } from "../errors.js";

const ViewVersionSchema = Schema.Struct({
  version: Schema.String,
  published: DateTimeUtcSchema,
});

const ViewDocumentFields = {
  handle: Schema.String,
  owner: Schema.String,
  type: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  latest: Schema.optional(ViewVersionSchema),
  versions: Schema.Array(ViewVersionSchema),
  install: Schema.String,
  visibility: Schema.Literals(["public", "private"] as const),
  deprecation: Schema.NullOr(DeprecationViewSchema),
} satisfies Schema.Struct.Fields;

export const ViewDocumentSchema = Schema.Struct(ViewDocumentFields);
export type ViewDocument = typeof ViewDocumentSchema.Type;

export const ViewFieldValueSchema = Schema.Union([
  Schema.String,
  Schema.Array(Schema.String),
  Schema.Null,
  DeprecationViewSchema,
]);
export type ViewFieldValue = typeof ViewFieldValueSchema.Type;

/** The fields `axm view` can report on their own. */
export const VIEW_FIELDS = [
  "version",
  "versions",
  "latest",
  "description",
  "owner",
  "type",
  "visibility",
  "deprecation",
] as const;
export type ViewField = (typeof VIEW_FIELDS)[number];

const isViewField = (field: string): field is ViewField =>
  VIEW_FIELDS.some((supported) => supported === field);

/** The registry a view reads from, and the name it is configured under. */
export interface ViewTargetRegistry {
  readonly registryName: string;
  readonly registryUrl: string;
}

/** The install command that resolves for `type`, given a fully qualified handle. */
const installCommandFor = (type: ExtensionType, handle: string): string =>
  `axm ${extensionTypeToPlural[type]} install ${handle}`;

/** The configured default registry, for invocations that precede a workspace. */
export const defaultViewRegistry: Effect.Effect<ViewTargetRegistry, never, RegistryUrl> =
  Effect.map(RegistryUrl, (registryUrl) => ({ registryName: "agentxm", registryUrl }));

/**
 * The registry a request selects: the configured default when none is named,
 * otherwise the named registry source this workspace configured.
 */
export const resolveViewRegistry = Effect.fn("ViewExtension.resolveRegistry")(function* (
  registry: Option.Option<string>,
) {
  if (Option.isNone(registry)) return yield* defaultViewRegistry;
  const settings = yield* SettingsReader;
  const registrySources = yield* settings.registrySourceHosts;
  if (registrySources.length === 0) {
    return yield* new PublishedMetadataUnavailable({
      reason: "workspace-not-initialized",
      detail: "No registry sources configured",
    });
  }
  const named = yield* settings.sourceByName(registry.value);
  if (Option.isNone(named) || named.value.type !== "registry") {
    return yield* new PublishedMetadataUnavailable({
      reason: "registry-not-configured",
      detail: `Registry source "${registry.value}" not found or not a registry source`,
    });
  }
  return {
    registryName: registry.value,
    registryUrl: named.value.location.href,
  } satisfies ViewTargetRegistry;
});

/**
 * A bare name with no type names exactly one extension or none: probing every
 * identifier-bearing type and finding more than one match is an ambiguity the
 * caller has to settle, not a choice this query may make.
 */
const resolveBareHandle = Effect.fn("ViewExtension.resolveBareHandle")(function* (handle: string) {
  const attempts = yield* Effect.forEach(
    ["skill", "subagent"] as const,
    (resourceType) =>
      Effect.scoped(
        resolveIdentifier({
          input: handle,
          resourceType,
          scope: "both",
          registrySourceName: "agentxm",
        }),
      ).pipe(Effect.result),
    { concurrency: "unbounded" },
  );
  const matches = attempts.flatMap((result): ReadonlyArray<ResolvedIdentifier> =>
    result._tag === "Success" ? [result.success] : [],
  );
  if (matches.length > 1) {
    return yield* new PublishedMetadataUnavailable({
      reason: "ambiguous-name",
      detail: `"${handle}" matches more than one extension: ${matches.map((match) => match.fqn).join(", ")}`,
      matches: matches.map((match) => match.fqn),
    });
  }
  const [match] = matches;
  if (match === undefined) {
    return yield* new PublishedMetadataUnavailable({
      reason: "not-found",
      detail: `No extension named "${handle}" was found`,
    });
  }
  return match;
});

/** The published identity a handle names, resolving a bare name if needed. */
export const resolveViewHandle = Effect.fn("ViewExtension.resolveHandle")(function* (request: {
  readonly handle: string;
  readonly type: Option.Option<IdentifierResourceType>;
}) {
  const parts = parseExtensionFqnParts(request.handle);
  if (parts !== undefined) return parts;

  const resolved = Option.isSome(request.type)
    ? yield* Effect.scoped(
        resolveIdentifier({
          input: request.handle,
          resourceType: request.type.value,
          scope: "both",
          registrySourceName: "agentxm",
        }),
      )
    : yield* resolveBareHandle(request.handle);
  const owner = Option.getOrUndefined(resolved.owner);
  if (owner === undefined) {
    return yield* new PublishedMetadataUnavailable({
      reason: "unqualified-name",
      detail: Option.isSome(request.type)
        ? `Extension "${request.handle}" does not have a registry owner`
        : `Invalid extension handle: ${request.handle}`,
    });
  }
  return { owner, type: resolved.type, name: resolved.name };
});

const toDocument = (index: ExtensionIndex, visibility: "public" | "private"): ViewDocument => {
  const [latest] = index.versions;
  const handle = `${index.owner}/${extensionTypeToPlural[index.type]}/${index.name}`;
  return {
    handle,
    owner: index.owner,
    type: index.type,
    name: index.name,
    ...(index.description === undefined ? {} : { description: index.description }),
    ...(latest === undefined
      ? {}
      : { latest: { version: latest.version, published: latest.published } }),
    versions: index.versions.map((entry) => ({
      version: entry.version,
      published: entry.published,
    })),
    install: installCommandFor(index.type, handle),
    visibility,
    deprecation: index.deprecation,
  };
};

const fieldValue = (data: ViewDocument, field: ViewField): ViewFieldValue | undefined => {
  switch (field) {
    case "version":
    case "latest":
      return data.latest?.version;
    case "versions":
      return data.versions.map((entry) => entry.version);
    case "description":
      return data.description;
    case "owner":
      return data.owner;
    case "type":
      return data.type;
    case "visibility":
      return data.visibility;
    case "deprecation":
      return data.deprecation;
  }
};

export type ViewExtensionResult =
  | { readonly outcome: "document"; readonly document: ViewDocument }
  | {
      readonly outcome: "field";
      readonly field: ViewField;
      readonly value: ViewFieldValue;
      readonly document: ViewDocument;
    };

export interface ReadPublishedExtensionRequest {
  readonly handle: string;
  readonly parts: ExtensionFqnParts;
  readonly targetRegistry: ViewTargetRegistry;
  readonly field: Option.Option<string>;
}

export const ViewExtension = {
  /**
   * Read the selected registry's index for one extension. The index a public
   * read returns already carries the visibility the caller may observe, so no
   * management endpoint is consulted afterwards.
   */
  read: Effect.fn("ViewExtension.read")(function* (request: ReadPublishedExtensionRequest) {
    const factory = yield* RegistryClientFactory;
    const client = yield* factory.forLocation(request.targetRegistry.registryUrl);
    const index = yield* client.getExtensionIndex(request.parts);
    if (Option.isNone(index)) {
      return yield* new PublishedMetadataUnavailable({
        reason: "not-found",
        detail: `Extension ${request.handle} not found on registry "${request.targetRegistry.registryName}".`,
      });
    }
    const document = toDocument(index.value, index.value.visibility ?? "public");
    if (Option.isNone(request.field)) {
      return { outcome: "document", document } satisfies ViewExtensionResult;
    }
    const field = request.field.value;
    if (!isViewField(field)) {
      return yield* new PublishedMetadataUnavailable({
        reason: "unknown-field",
        detail: `Unknown view field: ${field}`,
      });
    }
    const value = fieldValue(document, field);
    if (value === undefined) {
      return yield* new PublishedMetadataUnavailable({
        reason: "field-unavailable",
        detail: `Field "${field}" is not available for ${document.handle}`,
      });
    }
    return { outcome: "field", field, value, document } satisfies ViewExtensionResult;
  }),
};
