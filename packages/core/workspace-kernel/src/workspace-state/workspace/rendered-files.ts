import { withWork } from "@agentxm/host-primitives/work-observation";
/**
 * Rendered files tracking utilities for extension-managed output files.
 *
 * Provides hashing for extension-managed output files.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as crypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SourceHashSchema,
  type SourceHash,
} from "@agentxm/extension-model/unstable/sources/source-hash";

const decodeSourceHash = Schema.decodeUnknownSync(SourceHashSchema);

/**
 * Compute a SHA-256 hash of arbitrary content.
 *
 * Callers determine what to hash — this function accepts any string content
 * and returns a branded SourceHash.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computeSourceHash = (content: string): Effect.Effect<SourceHash> =>
  Effect.sync(() =>
    decodeSourceHash(crypto.createHash("sha256").update(content).digest("hex")),
  ).pipe((effect) =>
    withWork("axm.hash.content", effect, {
      attributes: { "axm.work.count": 1, "axm.work.bytes": Buffer.byteLength(content) },
    }),
  );
