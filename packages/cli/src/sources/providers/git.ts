/**
 * Source provider stub for generic git repositories.
 *
 * Not yet implemented -- all operations fail with a descriptive error.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { SourceError } from "../provider.js";
import type { SourceProvider } from "../provider.js";
import type { GitRepositorySourceInput } from "../types.js";

/**
 * Source provider for generic git URLs (stub).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createGitProvider = (): SourceProvider<GitRepositorySourceInput> => ({
  type: "git",

  find: () =>
    Effect.fail(
      new SourceError({
        message: "Generic git sources are not yet supported",
        cause: undefined,
      }),
    ),

  fetch: () =>
    Effect.fail(
      new SourceError({
        message: "Generic git sources are not yet supported",
        cause: undefined,
      }),
    ),
});
