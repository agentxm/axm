import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { RegistryUrl } from "@agentxm/client-core/unstable/auth";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import {
  extensionTypeToPlural,
  parseExtensionFqnParts,
  type ExtensionFqnParts,
} from "@agentxm/client-core/unstable/extensions";
import {
  resolveIdentifier,
  type IdentifierResourceType,
  type ResolvedIdentifier,
} from "@agentxm/client-core/unstable/source-resolution";
import { createRegistryClient, type ExtensionIndex } from "@agentxm/client-core/unstable/registry";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

export interface ViewHandlerArgs {
  readonly handle: string;
  readonly field: Option.Option<string>;
  readonly registry: Option.Option<string>;
  readonly type?: Option.Option<IdentifierResourceType>;
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
    if (Option.isNone(registry)) {
      const registryUrl = yield* RegistryUrl;
      return {
        registryName: "default",
        registryUrl,
      } satisfies TargetRegistry;
    }

    const ws = yield* WorkspaceMutations;
    const registrySources = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to get registry sources: ${e._tag}`,
          cause: e,
        }),
      ),
    );

    const [defaultRegistry] = registrySources;
    if (defaultRegistry === undefined) {
      return yield* makeAppError({
        code: "usage",
        detail: "No registry sources configured",
        suggestions: [{ description: "Initialize this workspace first.", cmd: "axm setup" }],
      });
    }

    const namedRegistry = yield* ws.getConfiguredSourceByName(registry.value).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to lookup registry source "${registry.value}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(namedRegistry) || namedRegistry.value.type !== "registry") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Registry source "${registry.value}" not found or not a registry source`,
      });
    }

    return {
      registryName: registry.value,
      registryUrl: namedRegistry.value.location.href,
    } satisfies TargetRegistry;
  });

const parseHandle = (handle: string, type: Option.Option<IdentifierResourceType>) =>
  Effect.gen(function* () {
    const parts = parseExtensionFqnParts(handle);
    if (parts !== undefined) {
      return parts;
    }

    if (Option.isSome(type)) {
      const resolved = yield* Effect.scoped(
        resolveIdentifier({
          input: handle,
          resourceType: type.value,
          scope: "both",
        }),
      );
      const owner = Option.getOrUndefined(resolved.owner);
      if (owner === undefined) {
        return yield* makeAppError({
          code: "validation",
          detail: `Extension "${handle}" does not have a registry owner`,
          suggestions: [
            {
              description: "Use a fully-qualified registry handle like @owner/skills/name.",
            },
          ],
        });
      }
      return {
        owner,
        type: resolved.type,
        name: resolved.name,
      };
    }

    const resolved = yield* resolveBareViewHandle(handle);
    const owner = Option.getOrUndefined(resolved.owner);
    if (owner === undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid extension handle: ${handle}`,
        suggestions: [
          {
            description:
              "Use a fully-qualified handle like @owner/skills/name, or pass --type for a bare name.",
          },
        ],
      });
    }
    return { owner, type: resolved.type, name: resolved.name };
  });

const resolveBareViewHandle = (handle: string) =>
  Effect.gen(function* () {
    const attempts = yield* Effect.forEach(
      ["skill", "command", "subagent"] as const,
      (resourceType) =>
        Effect.scoped(
          resolveIdentifier({
            input: handle,
            resourceType,
            scope: "both",
          }),
        ).pipe(Effect.result),
      { concurrency: "unbounded" },
    );
    const matches = attempts.flatMap(
      (result): ReadonlyArray<ResolvedIdentifier> =>
        result._tag === "Success" ? [result.success] : [],
    );

    if (matches.length === 1) {
      const [match] = matches;
      if (match !== undefined) return match;
    }

    if (matches.length > 1) {
      return yield* makeAppError({
        code: "internal",
        detail: `"${handle}" matches more than one extension: ${matches.map((match) => match.fqn).join(", ")}`,
        suggestions: [{ description: "Re-run with --type or the fully-qualified name." }],
      });
    }

    return yield* makeAppError({
      code: "not_found",
      detail: `No extension named "${handle}" was found`,
      suggestions: [
        {
          description: "Check the name, pass --type, or use a fully-qualified name.",
        },
      ],
    });
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
    const targetRegistry = yield* resolveTargetRegistry(args.registry);
    const parts = yield* parseHandle(args.handle, args.type ?? Option.none());
    yield* handleResolvedView({
      handle: args.handle,
      field: args.field,
      targetRegistry,
      parts,
    });
  });

export const handleDefaultRegistryFqnView = (args: {
  readonly handle: string;
  readonly field: Option.Option<string>;
  readonly parts: ExtensionFqnParts;
}) =>
  Effect.gen(function* () {
    const registryUrl = yield* RegistryUrl;
    yield* handleResolvedView({
      handle: args.handle,
      field: args.field,
      targetRegistry: {
        registryName: "default",
        registryUrl,
      },
      parts: args.parts,
    });
  });

const handleResolvedView = (args: {
  readonly handle: string;
  readonly field: Option.Option<string>;
  readonly targetRegistry: TargetRegistry;
  readonly parts: ExtensionFqnParts;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const client = yield* createRegistryClient(args.targetRegistry.registryUrl);
    const indexOption = yield* client.getExtensionIndex(args.parts);

    if (Option.isNone(indexOption)) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Extension ${args.handle} not found on registry "${args.targetRegistry.registryName}".`,
        suggestions: [
          {
            description: "Sign in if this extension is private.",
            cmd: "axm login",
          },
        ],
      });
    }

    const data = toDocumentData(indexOption.value);

    if (Option.isSome(args.field)) {
      const field = args.field.value;
      if (!isSupportedField(field)) {
        return yield* makeAppError({
          code: "not_found",
          detail: `Unknown view field: ${field}`,
        });
      }
      const value = fieldValue(data, field);
      if (value === undefined) {
        return yield* makeAppError({
          code: "internal",
          detail: `Field "${field}" is not available for ${data.handle}`,
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
