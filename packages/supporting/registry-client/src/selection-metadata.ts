import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ExtensionIndexSchema } from "@agentxm/registry-protocol/unstable/registry/schema";
import type { ResolutionMetadataOutcome } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import type { GetExtensionIndexArgs } from "./client.js";
import { RegistryRequestFailed } from "./errors.js";

/** Wire evidence becomes complete selection facts only inside the Registry adapter. */
export const indexFromMetadata = (
  identity: GetExtensionIndexArgs,
  outcome: ResolutionMetadataOutcome | undefined,
) =>
  Effect.gen(function* () {
    if (outcome?.outcome === "unavailable") return Option.none();
    if (outcome?.outcome !== "metadata")
      return yield* new RegistryRequestFailed({
        category: "internal",
        detail: "Registry selection did not return complete metadata for the submitted identity.",
      });
    return Option.some(
      yield* Schema.decodeUnknownEffect(Schema.toType(ExtensionIndexSchema))({
        ...identity,
        ...outcome.page,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new RegistryRequestFailed({
              category: "internal",
              detail: "Registry metadata could not be used for selection.",
              cause,
            }),
        ),
      ),
    );
  });
