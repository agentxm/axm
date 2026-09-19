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

export const archive = Effect.fn("ArchivePublishedExtension.archive")(function* (input: {
  readonly ref: string;
  readonly reason: Option.Option<string>;
}) {
  const registryUrl = yield* RegistryUrl;
  const ref = yield* parseExtensionReference(input.ref);
  const current = yield* getExtensionArchival(ref);
  const suppliedReason = Option.getOrUndefined(input.reason)?.trim();
  return {
    registry: registryUrl,
    transition: yield* archiveExtension(ref, {
      revision: current.revision,
      reason: suppliedReason === undefined || suppliedReason.length === 0 ? null : suppliedReason,
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
