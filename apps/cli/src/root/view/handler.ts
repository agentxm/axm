import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

import { observeUnit } from "@agentxm/workspace-operations";
import {
  defaultViewRegistry,
  resolveViewHandle,
  resolveViewRegistry,
  ViewDocumentSchema,
  ViewExtension,
  ViewFieldValueSchema,
  type ViewDocument,
  type ViewExtensionResult,
  type ViewFieldValue,
  type ViewTargetRegistry,
} from "@agentxm/workspace-inspection";
import type { PublishedMetadataUnavailable } from "@agentxm/workspace-inspection";
import type { ExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type { DeprecationView } from "@agentxm/extension-model/unstable/extensions/deprecation";
import type { IdentifierResourceType } from "@agentxm/extension-sources";

import { Screen, rawDoc, tableViewDoc, type TableView } from "../../screen/index.js";
import { withLiveOperation } from "../shared/operation-lifecycle.js";
import { publishedMetadataUnavailableToAppError } from "../inspection-errors.js";

export interface ViewHandlerArgs {
  readonly handle: string;
  readonly field: Option.Option<string>;
  readonly registry: Option.Option<string>;
  readonly type?: Option.Option<IdentifierResourceType>;
}

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

const deprecationReplacementText = (deprecation: DeprecationView): string => {
  const replacement = deprecation.replacement;
  if (replacement === undefined) return "-";
  if (replacement.status === "available") return replacement.fqn;
  return replacement.fqn === undefined
    ? "unavailable or not visible"
    : `${replacement.fqn} (unavailable)`;
};

const emitFieldValue = (value: ViewFieldValue) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const emitted = yield* screen.document(value, ViewFieldValueSchema);
    if (emitted) return;
    yield* screen.result(
      rawDoc(
        typeof value === "string"
          ? `${value}\n`
          : Array.isArray(value)
            ? `${value.join("\n")}\n`
            : value === null
              ? "active\n"
              : `${JSON.stringify(value, null, 2)}\n`,
      ),
    );
  });

const emitDocument = (data: ViewDocument) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    if (yield* screen.document(data, ViewDocumentSchema)) return;
    const versions = data.versions.map((entry) => entry.version);
    const versionSummary =
      versions.length <= 5
        ? versions.join(", ")
        : `${versions.slice(0, 5).join(", ")} (${versions.length} total)`;
    yield* screen.result(
      tableViewDoc(
        [
          { field: "Handle", value: data.handle },
          { field: "Type", value: data.type },
          { field: "Owner", value: data.owner },
          { field: "Latest", value: data.latest?.version ?? "-" },
          { field: "Versions", value: versionSummary },
          { field: "Description", value: data.description ?? "" },
          { field: "Visibility", value: data.visibility },
          {
            field: "Lifecycle",
            value: data.deprecation === null ? "active" : "deprecated",
          },
          ...(data.deprecation === null
            ? []
            : [
                {
                  field: "Deprecated at",
                  value: DateTime.formatIso(data.deprecation.deprecatedAt),
                },
                { field: "Deprecation message", value: data.deprecation.message ?? "-" },
                {
                  field: "Replacement",
                  value: deprecationReplacementText(data.deprecation),
                },
              ]),
          { field: "Install", value: data.install },
        ],
        ViewTable,
      ),
    );
  });

const emit = (result: ViewExtensionResult) =>
  result.outcome === "field" ? emitFieldValue(result.value) : emitDocument(result.document);

const unavailable = {
  PublishedMetadataUnavailable: (failure: PublishedMetadataUnavailable) =>
    Effect.fail(publishedMetadataUnavailableToAppError(failure)),
} as const;

const readAndEmit = (args: {
  readonly handle: string;
  readonly field: Option.Option<string>;
  readonly targetRegistry: ViewTargetRegistry;
  readonly parts: ExtensionFqnParts;
}) =>
  Effect.gen(function* () {
    const result = yield* withLiveOperation(
      { command: "view", name: `View ${args.handle}`, mode: "preview" },
      observeUnit(
        { id: "index", label: `${args.handle} from ${args.targetRegistry.registryName}` },
        Effect.catchTags(ViewExtension.read(args), unavailable),
      ),
    );
    yield* emit(result);
  });

export const handleView = Effect.fn("View.handle")(function* (args: ViewHandlerArgs) {
  const targetRegistry = yield* Effect.catchTags(resolveViewRegistry(args.registry), unavailable);
  const parts = yield* Effect.catchTags(
    resolveViewHandle({ handle: args.handle, type: args.type ?? Option.none() }),
    unavailable,
  );
  yield* readAndEmit({ handle: args.handle, field: args.field, targetRegistry, parts });
});

/**
 * A fully qualified handle with no registry or type flag reads published
 * metadata straight from the configured default registry, before any
 * workspace exists.
 */
export const handleDefaultRegistryFqnView = Effect.fn("View.handleDefaultRegistryFqn")(
  function* (args: {
    readonly handle: string;
    readonly field: Option.Option<string>;
    readonly parts: ExtensionFqnParts;
  }) {
    const targetRegistry = yield* defaultViewRegistry;
    yield* readAndEmit({ ...args, targetRegistry });
  },
);
