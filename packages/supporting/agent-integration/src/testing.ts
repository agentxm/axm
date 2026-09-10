/**
 * @agentxm/agent-integration test doubles.
 *
 * Native writers keep `NativeWriteAuthority` in `R`; tests that exercise a
 * writer without a workspace transaction provide one of these layers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { NativeWriteAuthority, type NativeWriteRecord } from "./native-write-authority.js";

/** Permits every protection request and drops every reported change. */
export const NativeWriteAuthorityPermissive = Layer.succeed(NativeWriteAuthority, {
  protect: () => Effect.void,
  record: () => Effect.void,
});

/** What a recording authority observed while a native writer ran. */
export interface RecordedNativeWrites {
  readonly protectedPaths: ReadonlyArray<string>;
  readonly records: ReadonlyArray<NativeWriteRecord>;
}

/**
 * A permissive authority that remembers what it was asked to protect and what
 * durable changes were reported, so a test can assert both.
 */
export const makeRecordingNativeWriteAuthority = Effect.gen(function* () {
  const observed = yield* Ref.make<RecordedNativeWrites>({ protectedPaths: [], records: [] });
  const layer = Layer.succeed(NativeWriteAuthority, {
    protect: (absolutePath: string) =>
      Ref.update(observed, (current) => ({
        ...current,
        protectedPaths: [...current.protectedPaths, absolutePath],
      })),
    record: (change: NativeWriteRecord) =>
      Ref.update(observed, (current) => ({
        ...current,
        records: [...current.records, change],
      })),
  });
  return { layer, observed: Ref.get(observed) } as const;
});
