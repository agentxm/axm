/**
 * Source provider stub for generic git repositories.
 *
 * Not yet implemented -- all operations fail with a descriptive error.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { makeCliError } from "../../cli-error/index.js";
import type { SourceHostProvider } from "../provider.js";
import type { LegacySourceProvider } from "../provider.js";
import type { GitRepositorySourceInput, NewGitSource } from "../types.js";

/**
 * Source host provider for generic git URLs.
 *
 * Self-describing — no host config needed.
 * `match` returns true for git://, ssh://, and git@... URL schemes.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createGitSourceHostProvider = (): SourceHostProvider<NewGitSource> => ({
  type: "git",

  match: (url: URL) =>
    Effect.succeed(
      url.protocol === "git:" || url.protocol === "ssh:" || url.href.startsWith("git@"),
    ),

  find: () =>
    Effect.fail(
      makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: "Generic git sources are not yet supported",
      }),
    ),

  fetch: () =>
    Effect.fail(
      makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: "Generic git sources are not yet supported",
      }),
    ),
});

/**
 * Source provider for generic git URLs (stub).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createLegacyGitProvider = (): LegacySourceProvider<GitRepositorySourceInput> => ({
  type: "git",

  find: () =>
    Effect.fail(
      makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: "Generic git sources are not yet supported",
      }),
    ),

  fetch: () =>
    Effect.fail(
      makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: "Generic git sources are not yet supported",
      }),
    ),
});
