/**
 * `DeprecatePublishedExtension`: warning-only publisher guidance on a
 * published identity.
 *
 * Deprecation is a read-then-merge write: the edit the caller expressed is
 * merged onto the guidance the Registry currently holds, and the write is
 * conditioned on the revision that read observed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  ExtensionFqnSchema,
  formatFqn,
  parseFqn,
} from "@agentxm/extension-model/unstable/extensions";
import {
  deprecateExtension,
  getExtensionDeprecation,
  undeprecateExtension,
  RegistryUrl,
} from "@agentxm/registry-client";
import type { DeprecationReplacementIntent } from "@agentxm/registry-protocol/unstable/registry";

import { PublishFailed } from "../errors.js";
import { parseExtensionReference } from "./retirement.js";

/** The edit a caller expressed for one field of the guidance. */
export interface DeprecationEdit {
  readonly ref: string;
  readonly message: Option.Option<string>;
  readonly replacement: Option.Option<string>;
  readonly clearMessage: boolean;
  readonly clearReplacement: boolean;
}

const validation = (detail: string, suggestions?: ReadonlyArray<{ description: string }>) =>
  new PublishFailed({
    category: "validation",
    detail,
    ...(suggestions === undefined ? {} : { suggestions }),
  });

const parseReplacementFqn = (input: string) =>
  Effect.gen(function* () {
    const parsed = yield* Effect.fromResult(
      Result.mapError(
        parseFqn(input),
        (cause) =>
          new PublishFailed({
            category: "validation",
            detail: `Invalid fully qualified name: ${input}`,
            cause,
          }),
      ),
    );
    return yield* Schema.decodeUnknownEffect(ExtensionFqnSchema)(formatFqn(parsed)).pipe(
      Effect.mapError(() => validation(`Invalid fully qualified name: ${input}`)),
    );
  });

/** Reject flag pairs that express opposite intents for one field. */
const rejectConflictingEdit = (edit: DeprecationEdit) =>
  Option.isSome(edit.message) && edit.clearMessage
    ? Option.some(validation("--message and --clear-message cannot be combined."))
    : Option.isSome(edit.replacement) && edit.clearReplacement
      ? Option.some(validation("--replacement and --clear-replacement cannot be combined."))
      : Option.none();

export const deprecate = Effect.fn("DeprecatePublishedExtension.deprecate")(function* (
  edit: DeprecationEdit,
) {
  const registryUrl = yield* RegistryUrl;
  const ref = yield* parseExtensionReference(edit.ref);
  const conflicting = rejectConflictingEdit(edit);
  if (Option.isSome(conflicting)) return yield* Effect.fail(conflicting.value);

  const current = yield* getExtensionDeprecation(ref);
  const suppliedMessage = Option.getOrUndefined(edit.message)?.trim();
  const message = edit.clearMessage
    ? null
    : suppliedMessage === undefined
      ? (current.deprecation?.message ?? null)
      : suppliedMessage.length === 0
        ? null
        : suppliedMessage;
  const replacement: DeprecationReplacementIntent = edit.clearReplacement
    ? { kind: "clear" }
    : Option.isSome(edit.replacement)
      ? { kind: "set", fqn: yield* parseReplacementFqn(edit.replacement.value) }
      : current.deprecation?.replacement === undefined
        ? { kind: "clear" }
        : current.deprecation.replacement.status === "available"
          ? { kind: "set", fqn: current.deprecation.replacement.fqn }
          : { kind: "preserve" };
  if (message === null && replacement.kind === "clear") {
    return yield* Effect.fail(
      validation("A deprecation requires a message, a replacement, or both.", [
        { description: "Supply --message or --replacement, or remove the deprecation instead." },
      ]),
    );
  }
  return {
    registry: registryUrl,
    transition: yield* deprecateExtension(ref, {
      revision: current.revision,
      message,
      replacement,
    }),
  };
});

export const undeprecate = Effect.fn("DeprecatePublishedExtension.undeprecate")(function* (
  input: string,
) {
  const registryUrl = yield* RegistryUrl;
  const ref = yield* parseExtensionReference(input);
  const current = yield* getExtensionDeprecation(ref);
  return {
    registry: registryUrl,
    transition: yield* undeprecateExtension(ref, current.revision),
  };
});

/** The application API for published-extension deprecation guidance. */
export const DeprecatePublishedExtension = { deprecate, undeprecate } as const;
