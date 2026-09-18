import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { observeUnit } from "@agentxm/workspace/transitions/planning";
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
} from "@agentxm/workspace/inspection";
import type { PublishedMetadataUnavailable } from "@agentxm/workspace/inspection";
import type { ExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type { IdentifierResourceType } from "@agentxm/workspace/resolution/sources";

import { Screen, rawDoc } from "../../screen/index.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { publishedMetadataUnavailableToAppError } from "../inspection-errors.js";
import { viewPageDoc } from "./view.js";

export interface ViewHandlerArgs {
  readonly handle: string;
  readonly field: Option.Option<string>;
  readonly registry: Option.Option<string>;
  readonly type?: Option.Option<IdentifierResourceType>;
}

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
    yield* screen.result(viewPageDoc(data));
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
