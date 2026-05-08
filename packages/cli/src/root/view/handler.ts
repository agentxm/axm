import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import {
  extensionTypeToPlural,
  parseFullyQualifiedNameParts,
} from "@agentxm/client-core/unstable/extensions";
import { createRegistryClient, type ExtensionIndex } from "@agentxm/client-core/unstable/registry";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

export interface ViewHandlerArgs {
  readonly handle: string;
  readonly field: Option.Option<string>;
  readonly registry: Option.Option<string>;
}

interface TargetRegistry {
  readonly registryName: string;
  readonly registryUrl: string;
}

const supportedFields = ["version", "versions", "latest", "description", "owner", "type"] as const;
type SupportedField = (typeof supportedFields)[number];

const isSupportedField = (field: string): field is SupportedField =>
  supportedFields.some((supported) => supported === field);

const ViewVersionSchema = Schema.Struct({
  version: Schema.String,
  published: Schema.String,
});

const ViewDocumentFields = {
  data: Schema.Struct({
    handle: Schema.String,
    owner: Schema.String,
    type: Schema.String,
    name: Schema.String,
    description: Schema.optional(Schema.String),
    latest: Schema.optional(ViewVersionSchema),
    versions: Schema.Array(ViewVersionSchema),
    install: Schema.String,
  }),
} satisfies Schema.Struct.Fields;

type ViewDocumentData = Schema.Struct.Type<typeof ViewDocumentFields>["data"];

interface ViewTableRow {
  readonly field: string;
  readonly value: string;
}

const ViewTable = {
  columns: {
    field: { header: "Field" },
    value: { header: "Value" },
  },
} as const satisfies TableView<ViewTableRow>;

const resolveTargetRegistry = (registry: Option.Option<string>) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const registrySources = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "REGISTRY_SOURCES_FAILED",
          what: `Failed to get registry sources: ${e._tag}`,
          cause: e,
        }),
      ),
    );

    const [defaultRegistry] = registrySources;
    if (defaultRegistry === undefined) {
      return yield* makeAppError({
        code: "NO_REGISTRY_CONFIGURED",
        what: "No registry sources configured",
        howToFix: "Run `axm setup` first.",
      });
    }

    if (Option.isNone(registry)) {
      return {
        registryName: defaultRegistry.name,
        registryUrl: defaultRegistry.location.href,
      } satisfies TargetRegistry;
    }

    const namedRegistry = yield* ws.getConfiguredSourceByName(registry.value).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "VIEW_REGISTRY_LOOKUP_FAILED",
          what: `Failed to lookup registry source "${registry.value}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(namedRegistry) || namedRegistry.value.type !== "registry") {
      return yield* makeAppError({
        code: "VIEW_REGISTRY_NOT_FOUND",
        what: `Registry source "${registry.value}" not found or not a registry source`,
      });
    }

    return {
      registryName: registry.value,
      registryUrl: namedRegistry.value.location.href,
    } satisfies TargetRegistry;
  });

const parseHandle = (handle: string) =>
  Effect.gen(function* () {
    const parts = parseFullyQualifiedNameParts(handle);
    if (parts === undefined) {
      return yield* makeAppError({
        code: "VIEW_INVALID_HANDLE",
        what: `Invalid extension handle: ${handle}`,
        howToFix: "Use a fully-qualified handle like @owner/skills/name or @owner/commands/name.",
      });
    }
    return parts;
  });

const toDocumentData = (index: ExtensionIndex): ViewDocumentData => {
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
    install: `axm ${extensionTypeToPlural[index.type]} install ${handle}`,
  };
};

const fieldValue = (
  data: ViewDocumentData,
  field: SupportedField,
): string | ReadonlyArray<string> | undefined => {
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
  }
};

const emitFieldValue = (field: SupportedField, value: string | ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const emitted =
      typeof value === "string"
        ? yield* renderer.result(value, Schema.String)
        : yield* renderer.result(value, Schema.Array(Schema.String));
    if (emitted) return;
    yield* renderer.raw(typeof value === "string" ? `${value}\n` : `${value.join("\n")}\n`);
  });

export const handleView = (args: ViewHandlerArgs) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const targetRegistry = yield* resolveTargetRegistry(args.registry);
    const parts = yield* parseHandle(args.handle);
    const client = yield* createRegistryClient(targetRegistry.registryUrl);
    const indexOption = yield* client.getExtensionIndex(parts);

    if (Option.isNone(indexOption)) {
      return yield* makeAppError({
        code: "VIEW_EXTENSION_NOT_FOUND",
        what: `Extension ${args.handle} not found on registry "${targetRegistry.registryName}".`,
        howToFix: `If this extension is private, run "axm login" and try again.`,
      });
    }

    const data = toDocumentData(indexOption.value);

    if (Option.isSome(args.field)) {
      const field = args.field.value;
      if (!isSupportedField(field)) {
        return yield* makeAppError({
          code: "VIEW_UNKNOWN_FIELD",
          what: `Unknown view field: ${field}`,
        });
      }
      const value = fieldValue(data, field);
      if (value === undefined) {
        return yield* makeAppError({
          code: "VIEW_FIELD_EMPTY",
          what: `Field "${field}" is not available for ${data.handle}`,
        });
      }
      yield* emitFieldValue(field, value);
      return;
    }

    if (yield* renderer.result({ data }, Schema.Struct(ViewDocumentFields))) {
      return;
    }

    const latest = data.latest?.version ?? "-";
    const versions = data.versions.map((entry) => entry.version);
    const versionSummary =
      versions.length <= 5
        ? versions.join(", ")
        : `${versions.slice(0, 5).join(", ")} (${versions.length} total)`;

    yield* renderer.table(
      [
        { field: "Handle", value: data.handle },
        { field: "Type", value: data.type },
        { field: "Owner", value: data.owner },
        { field: "Latest", value: latest },
        { field: "Versions", value: versionSummary },
        { field: "Description", value: data.description ?? "" },
        { field: "Install", value: data.install },
      ],
      ViewTable,
    );
  });
