import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { SettingsReader } from "@agentxm/workspace-kernel/workspace-state";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { observeUnit } from "@agentxm/workspace-kernel/operations";
import {
  resolveViewHandle,
  resolveViewRegistry,
  ViewDocumentSchema,
  ViewExtension,
  ViewFieldValueSchema,
  type ViewDocument,
  type ViewExtensionResult,
  type ViewFieldValue,
  type ViewTargetRegistry,
  type PublishedMetadataUnavailable,
} from "@agentxm/workspace-features/inspection";
import type { ExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type { IdentifierResourceType } from "@agentxm/workspace-kernel/sources";

import { isSignedIn } from "@agentxm/registry-access/authentication";

import { emitResult, rawDoc } from "../../screen/index.js";
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
    yield* emitResult(value, ViewFieldValueSchema, () =>
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
    yield* emitResult(data, ViewDocumentSchema, () => viewPageDoc(data));
  });

const emit = (result: ViewExtensionResult) =>
  result.outcome === "field" ? emitFieldValue(result.value) : emitDocument(result.document);

const readAndEmit = (args: {
  readonly handle: string;
  readonly field: Option.Option<string>;
  readonly targetRegistry: ViewTargetRegistry;
  readonly parts: ExtensionFqnParts;
}) =>
  Effect.gen(function* () {
    // The read itself carries the invocation's credential, so a signed-in
    // person sees their own private extensions here. What being signed in
    // changes for a miss is only whether signing in is offered as a recovery.
    const signedIn = yield* isSignedIn(args.targetRegistry.registryUrl);
    const settings = yield* SettingsReader;
    const agents = yield* settings.configuredAgents;
    const result = yield* withLiveOperation(
      { command: "view", name: `View ${args.handle}`, mode: "query" },
      observeUnit(
        { id: "index", label: `${args.handle} from ${args.targetRegistry.registryName}` },
        Effect.catchTags(
          ViewExtension.read({ ...args, hookContext: { scope: DEFAULT_WORKSPACE_SCOPE, agents } }),
          {
            PublishedMetadataUnavailable: (failure: PublishedMetadataUnavailable) =>
              Effect.fail(publishedMetadataUnavailableToAppError(failure, !signedIn)),
          },
        ),
      ),
    );
    yield* emit(result);
  });

/**
 * Naming the target and the handle happens before any read, so none of these
 * is a miss and none of them is answered by signing in.
 */
const unresolvable = {
  PublishedMetadataUnavailable: (failure: PublishedMetadataUnavailable) =>
    Effect.fail(publishedMetadataUnavailableToAppError(failure, false)),
} as const;

export const handleView = Effect.fn("View.handle")(function* (args: ViewHandlerArgs) {
  const parts = yield* Effect.catchTags(
    resolveViewHandle({ handle: args.handle, type: args.type ?? Option.none() }),
    unresolvable,
  );
  const targetRegistry = yield* Effect.catchTags(resolveViewRegistry(args.registry), unresolvable);
  yield* readAndEmit({ handle: args.handle, field: args.field, targetRegistry, parts });
});

/** Read a fully qualified handle from the invocation's effective default Registry. */
export const handleDefaultRegistryFqnView = Effect.fn("View.handleDefaultRegistryFqn")(
  function* (args: {
    readonly handle: string;
    readonly field: Option.Option<string>;
    readonly parts: ExtensionFqnParts;
  }) {
    const targetRegistry = yield* Effect.catchTags(
      resolveViewRegistry(Option.none()),
      unresolvable,
    );
    yield* readAndEmit({ ...args, targetRegistry });
  },
);
