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

import {
  archiveExtension,
  getExtensionArchival,
  unarchiveExtension,
  RegistryUrl,
} from "@agentxm/registry-client";

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
  const registryUrl = yield* RegistryUrl;
  const ref = yield* parseExtensionReference(input.ref);
  const current = yield* getExtensionArchival(ref);
  const message = input.clearMessage
    ? Option.some(null)
    : Option.map(input.message, (value) => value.trim() || null);
  return {
    registry: registryUrl,
    transition: yield* archiveExtension(ref, {
      revision: current.revision,
      ...(Option.isNone(message) ? {} : { message: message.value }),
    }),
  };
});

export const unarchive = Effect.fn("ArchivePublishedExtension.unarchive")(function* (
  input: string,
) {
  const registryUrl = yield* RegistryUrl;
  const ref = yield* parseExtensionReference(input);
  const current = yield* getExtensionArchival(ref);
  return {
    registry: registryUrl,
    transition: yield* unarchiveExtension(ref, current.revision),
  };
});

/** The application API for published-extension archival. */
export const ArchivePublishedExtension = { archive, unarchive } as const;
