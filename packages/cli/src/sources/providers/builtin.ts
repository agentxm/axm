/**
 * Source provider for builtin bundled extensions.
 *
 * Builtin extensions are resolved from bundled data, not from user input.
 * `match` always returns false — builtin sources are installed by init/bootstrap.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { makeCliError } from "../../cli-error/index.js";
import type { SourceHostProvider } from "../provider.js";
import type { BuiltinSource } from "../types.js";

/**
 * Source host provider for builtin extensions.
 *
 * Self-describing — no host config needed.
 * `match` always returns false — builtin extensions are not resolved from URLs.
 * `find` does in-memory lookup of bundled extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createBuiltinSourceHostProvider = (): SourceHostProvider<BuiltinSource> => ({
  type: "builtin",

  match: () => Effect.succeed(false),

  find: () =>
    Effect.fail(
      makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: "Builtin source provider find not yet implemented",
      }),
    ),

  fetch: () =>
    Effect.fail(
      makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: "Builtin source provider fetch not yet implemented",
      }),
    ),
});
