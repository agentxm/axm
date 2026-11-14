/**
 * Evidence that one archive buffer was hashed against an expected integrity.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { computeIntegrity } from "@agentxm/host-primitives";
import { withWork } from "@agentxm/host-primitives/work-observation";

/**
 * Proof that `bytes` hashed to `integrity`. The only way to obtain one is
 * {@link VerifiedArchive.check}, which runs the hash; the private fields make the
 * type nominal so a structurally similar object is not accepted in its place.
 */
export class VerifiedArchive {
  readonly #bytes: Uint8Array;
  readonly #integrity: string;

  private constructor(bytes: Uint8Array, integrity: string) {
    this.#bytes = bytes;
    this.#integrity = integrity;
  }

  /** The exact buffer instance that was hashed. */
  get bytes(): Uint8Array {
    return this.#bytes;
  }

  /** The integrity the buffer matched. */
  get integrity(): string {
    return this.#integrity;
  }

  /** Hash `bytes` and return evidence only when the digest equals `expected`. */
  static check(bytes: Uint8Array, expected: string): Effect.Effect<Option.Option<VerifiedArchive>> {
    return withWork(
      "axm.archive.integrity",
      Effect.map(computeIntegrity(bytes), (actual) =>
        actual === expected ? Option.some(new VerifiedArchive(bytes, expected)) : Option.none(),
      ),
      {
        attributes: {
          "axm.archive.bytes": bytes.byteLength,
          "axm.work.executed": 1,
        },
      },
    );
  }

  /** True only for the same buffer instance checked against the same integrity. */
  covers(bytes: Uint8Array, expected: string): boolean {
    return this.#bytes === bytes && this.#integrity === expected;
  }
}
