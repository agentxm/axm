/**
 * Core implementation of the native-write port the agent adapters declare.
 *
 * Native writers own the format; the workspace transaction owns protection and
 * durable-change accounting. This layer joins the two, so a native target that
 * cannot be snapshotted is never mutated.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { NativeWriteAuthority, NativeWriteRefused } from "./agent-adapters/index.js";
import { protectWorkspacePath, recordFootprint } from "../transitions/settlement/index.js";

export const NativeWriteAuthorityLive = Layer.succeed(NativeWriteAuthority, {
  protect: (absolutePath: string) =>
    protectWorkspacePath(absolutePath).pipe(
      Effect.mapError((cause) => new NativeWriteRefused({ path: absolutePath, cause })),
    ),
  record: (change) => recordFootprint(change),
});
