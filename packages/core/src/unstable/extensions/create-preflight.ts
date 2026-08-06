import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { makeAppError, type AppError } from "../app-error/index.js";

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
    const recover = `Choose a different name or remove the existing ${args.subject.toLowerCase()} first`;
    return yield* makeAppError({
      code: "conflict",
      detail: `${args.subject} '${args.name}' already exists in settings`,
      recover,
    });
  }

  const fs = yield* FileSystem.FileSystem;
  for (const destination of args.destinations) {
    const exists = yield* fs.exists(destination).pipe(
      Effect.mapError((cause): AppError =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect create destination: ${destination}`,
          cause,
        }),
      ),
    );
    if (exists) {
      const recover = "Choose a different name or remove the existing directory first";
      return yield* makeAppError({
        code: "conflict",
        detail: `${args.subject} destination already exists: ${destination}`,
        recover,
      });
    }
  }
});
