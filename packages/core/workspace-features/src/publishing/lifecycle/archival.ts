/**
 * Publisher-managed extension archival.
 *
 * Both transitions read the current lifecycle revision and condition the
 * requested write on precisely that observation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { selectedLifecycleRegistry } from "./registry.js";
import { parseExtensionReference } from "./retirement.js";
import { PublishFailed } from "../errors.js";

export const archive = Effect.fn("ArchivePublishedExtension.archive")(function* (input: {
  readonly ref: string;
  readonly message: Option.Option<string>;
  readonly clearMessage: boolean;
}) {
  if (Option.isSome(input.message) && input.clearMessage) {
    return yield* new PublishFailed({
      category: "usage",
      detail: "--message and --clear-message cannot be combined",
    });
  }
  const ref = yield* parseExtensionReference(input.ref);
  const { registry, lifecycle } = yield* selectedLifecycleRegistry("Archiving an extension");
  const current = yield* lifecycle.getExtensionArchival(ref);
  const message = input.clearMessage
    ? Option.some(null)
    : Option.map(input.message, (value) => value.trim() || null);
  return {
    registry,
    transition: yield* lifecycle.archiveExtension(ref, {
      revision: current.revision,
      ...(Option.isNone(message) ? {} : { message: message.value }),
    }),
  };
});

export const unarchive = Effect.fn("ArchivePublishedExtension.unarchive")(function* (
  input: string,
) {
  const ref = yield* parseExtensionReference(input);
  const { registry, lifecycle } = yield* selectedLifecycleRegistry("Unarchiving an extension");
  const current = yield* lifecycle.getExtensionArchival(ref);
  return {
    registry,
    transition: yield* lifecycle.unarchiveExtension(ref, current.revision),
  };
});

/** The application API for published-extension archival. */
export const ArchivePublishedExtension = { archive, unarchive } as const;
