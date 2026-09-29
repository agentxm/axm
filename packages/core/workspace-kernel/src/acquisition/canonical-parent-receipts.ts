import * as Effect from "effect/Effect";

import { NativeWriteAuthority } from "../agent-adapters/index.js";
import { resolveNativeEntry } from "../locations/index.js";
import { retireWorkspacePath } from "../settlement/index.js";
import { PackageMaterializationFailed } from "./errors.js";

const parentUnit = (physicalPath: string) =>
  JSON.stringify(["canonical-parent-directories", physicalPath]);

/** The acquisition supplies this capability only for a proved new identity. */
export const prepareCanonicalParents = (args: {
  readonly canonicalPath: string;
  readonly eligible: boolean;
}) =>
  Effect.gen(function* () {
    const authority = yield* NativeWriteAuthority;
    const address = yield* resolveNativeEntry(args.canonicalPath);
    const capture = yield* authority.captureCreatedDirectories({
      path: args.canonicalPath,
      unit: parentUnit(address.entryPath),
      eligible: args.eligible,
    });
    const createdDirectories = yield* authority.createParentDirectories(args.canonicalPath);
    // Publication must complete before the directory receipt gains authority.
    return authority.recordCreatedDirectories({ capture, createdDirectories }).pipe(
      Effect.mapError(
        (cause) =>
          new PackageMaterializationFailed({
            path: args.canonicalPath,
            step: "record-parent-creation",
            cause,
          }),
      ),
    );
  }).pipe(
    Effect.mapError(
      (cause) =>
        new PackageMaterializationFailed({
          path: args.canonicalPath,
          step: "prepare-parent",
          cause,
        }),
    ),
  );

/** The caller must have proved exact accepted ownership of the canonical tree. */
export const retireCanonicalDirectory = (canonicalPath: string) =>
  Effect.gen(function* () {
    const authority = yield* NativeWriteAuthority;
    const address = yield* resolveNativeEntry(canonicalPath);
    if (address.kind !== "absent") yield* retireWorkspacePath(canonicalPath);
    yield* authority.retireCreatedDirectories({
      path: canonicalPath,
      unit: parentUnit(address.entryPath),
    });
  }).pipe(
    Effect.mapError(
      (cause) => new PackageMaterializationFailed({ path: canonicalPath, step: "retire", cause }),
    ),
  );
