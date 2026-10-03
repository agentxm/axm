import { withInspectionReadView } from "../read-view.js";
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
import { platform } from "node:os";
import { computeIntegrity } from "@agentxm/host-primitives";
import { normalizePublishInput } from "@agentxm/extension-content";
import { HookManifestSchema } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import {
  agentById,
  isConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { ConfiguredAgentOutcomeSchema } from "@agentxm/workspace-kernel/operations";
import { evaluateHookAgentOutcome } from "@agentxm/workspace-kernel/projection";

import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  extensionTypeToPlural,
  parseExtensionFqnParts,
  type ExtensionFqnParts,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { DeprecationViewSchema } from "@agentxm/extension-model/unstable/extensions/deprecation";
import { ArchivalViewSchema } from "@agentxm/extension-model/unstable/extensions/archival";
import {
  resolveIdentifier,
  type IdentifierResourceType,
  type ResolvedIdentifier,
} from "@agentxm/workspace-kernel/sources";
import { RegistryClientFactory } from "@agentxm/registry-client";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry";
import { SettingsReader, DesiredStateReader } from "@agentxm/workspace-kernel/workspace-state";

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
  lifecycleState: Schema.Literals(["active", "deprecated", "archived"] as const),
  archival: Schema.NullOr(ArchivalViewSchema),
  deprecation: Schema.NullOr(DeprecationViewSchema),
  hook: Schema.optionalKey(
    Schema.Struct({
      manifest: HookManifestSchema,
      evidence: Schema.Literal("published-static-only"),
      agentOutcomes: Schema.Array(ConfiguredAgentOutcomeSchema),
    }),
  ),
} satisfies Schema.Struct.Fields;

export const ViewDocumentSchema = Schema.Struct(ViewDocumentFields);
export type ViewDocument = typeof ViewDocumentSchema.Type;

export const ViewFieldValueSchema = Schema.Union([
  Schema.String,
  Schema.Array(Schema.String),
  Schema.Null,
  ArchivalViewSchema,
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
  "lifecycle-state",
  "archival",
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

/**
 * The registry a request selects: the configured default when none is named,
 * otherwise the named registry source this workspace configured — both
 * through the workspace's one Registry target owner.
 */
export const resolveViewRegistry = Effect.fn("ViewExtension.resolveRegistry")(function* (
  registry: Option.Option<string>,
) {
  const settings = yield* SettingsReader;
  const selection = yield* settings.registryTarget(registry);
  if (Option.isNone(selection.url)) {
    return yield* new PublishedMetadataUnavailable({
      reason: "registry-not-configured",
      detail: `Registry source "${selection.name}" not found or not a registry source`,
    });
  }
  return {
    registryName: selection.name,
    registryUrl: selection.url.value,
  } satisfies ViewTargetRegistry;
});

/**
 * A bare name with no type names exactly one extension or none: probing every
 * identifier-bearing type and finding more than one match is an ambiguity the
 * caller has to settle, not a choice this query may make.
 */
const resolveBareHandle = Effect.fn("ViewExtension.resolveBareHandle")(function* (handle: string) {
  const settings = yield* SettingsReader;
  const defaultRegistry = yield* settings.defaultRegistry;
  const installedGraph = yield* (yield* DesiredStateReader).graph();
  const registrySources = yield* settings.registrySourceHosts;
  const attempts = yield* Effect.forEach(
    installableExtensionTypes,
    (resourceType) =>
      Effect.scoped(
        resolveIdentifier({
          installedGraph,
          registrySources,
          input: handle,
          resourceType,
          scope: "both",
          registrySourceName: defaultRegistry,
        }),
      ).pipe(Effect.result),
    // eslint-disable-next-line axm-policy/no-unbounded-io -- one probe per fixed installable extension type
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
  const settings = yield* SettingsReader;
  const defaultRegistry = yield* settings.defaultRegistry;

  const resolved = Option.isSome(request.type)
    ? yield* Effect.scoped(
        resolveIdentifier({
          installedGraph: yield* (yield* DesiredStateReader).graph(),
          registrySources: yield* settings.registrySourceHosts,
          input: request.handle,
          resourceType: request.type.value,
          scope: "both",
          registrySourceName: defaultRegistry,
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
}, withInspectionReadView);

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
    lifecycleState:
      index.archival !== null ? "archived" : index.deprecation !== null ? "deprecated" : "active",
    archival: index.archival,
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
    case "lifecycle-state":
      return data.lifecycleState;
    case "archival":
      return data.archival;
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
  readonly hookContext?: {
    readonly scope: "project" | "user";
    readonly agents: ReadonlyArray<string>;
  };
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
    const latest = index.value.versions[0];
    if (index.value.type === "hook" && latest !== undefined && Option.isNone(request.field)) {
      const { archive } = yield* client.getExtensionPackage({
        owner: index.value.owner,
        type: "hook",
        name: index.value.name,
        exact: {
          version: latest.version,
          integrity: latest.integrity,
          publisherBindingId: index.value.publisherBindingId,
        },
        usagePurpose: "verification",
      });
      if ((yield* computeIntegrity(archive)) !== latest.integrity)
        return yield* new PublishedMetadataUnavailable({
          reason: "field-unavailable",
          detail: "Published Hook archive integrity does not match its selected version.",
        });
      const normalized = yield* normalizePublishInput({
        declaredIdentity: {
          owner: index.value.owner,
          type: "hook",
          name: index.value.name,
          version: latest.version,
        },
        archive: { archiveBytes: archive, archiveContentType: "application/zip" },
      }).pipe(
        Effect.mapError(
          () =>
            new PublishedMetadataUnavailable({
              reason: "field-unavailable",
              detail: "Published Hook archive does not contain a valid native Hook package.",
            }),
        ),
      );
      const manifest = yield* Schema.decodeUnknownEffect(HookManifestSchema)(
        normalized.manifest.raw,
        { onExcessProperty: "error" },
      ).pipe(
        Effect.mapError(
          () =>
            new PublishedMetadataUnavailable({
              reason: "field-unavailable",
              detail: "Published Hook manifest is invalid.",
            }),
        ),
      );
      const scope = request.hookContext?.scope ?? "project";
      const agentOutcomes = (request.hookContext?.agents ?? []).map((id) => {
        if (!isConfigurableAgentId(id))
          return {
            extensionType: "hook" as const,
            name: manifest.name,
            agentId: id,
            outcome: "blocked" as const,
            reasonCode: "unknown-agent",
            reason: "Configured agent has no supported native Hook writer.",
          };
        const agent = agentById(id);
        const hook = agent.capabilities.hook;
        const writer = hook.axm.writer;
        const nativeLocation =
          writer !== null && "locations" in hook.native
            ? hook.native.locations.find(
                (candidate) =>
                  candidate.scope === scope && writer.locationIds.includes(candidate.id),
              )
            : undefined;
        return evaluateHookAgentOutcome({
          agent,
          manifest,
          target: nativeLocation === undefined ? {} : { nativePath: nativeLocation.path },
          scope,
          host: { platform: platform() },
          state: "projected",
        });
      });
      return {
        outcome: "document",
        document: {
          ...document,
          hook: { manifest, evidence: "published-static-only", agentOutcomes },
        },
      } satisfies ViewExtensionResult;
    }
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
