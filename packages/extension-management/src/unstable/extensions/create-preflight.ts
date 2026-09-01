import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import {
  CreateDestinationExists,
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
} from "./errors.js";

export interface CreateOnlyPreflightArgs {
  readonly subject: string;
  readonly name: string;
  readonly configured: boolean;
  readonly destinations: ReadonlyArray<string>;
}

/** Refuse every declared identity/path collision before a create operation mutates the workspace. */
export const preflightCreateOnly = Effect.fn("Extensions.preflightCreateOnly")(function* (
  args: CreateOnlyPreflightArgs,
) {
  if (args.configured) {
    return yield* new CreateNameConfigured({ subject: args.subject, name: args.name });
  }

  const fs = yield* FileSystem.FileSystem;
  for (const destination of args.destinations) {
    const exists = yield* fs
      .exists(destination)
      .pipe(
        Effect.mapError(
          (cause) => new CreateDestinationInspectionFailed({ path: destination, cause }),
        ),
      );
    if (exists) {
      return yield* new CreateDestinationExists({ subject: args.subject, path: destination });
    }
  }
});
