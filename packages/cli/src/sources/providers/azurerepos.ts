/**
 * Source provider stub for Azure Repos.
 *
 * Not yet implemented -- all operations fail with a descriptive error.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { makeCliError } from "../../cli-error/index.js";
import type { SourceProvider } from "../provider.js";
import type { AzureReposSourceInput } from "../types.js";

/**
 * Source provider for Azure Repos (stub).
 *
 * @deprecated Use createAzureReposSourceHostProvider from git-hosting.ts
 * @experimental This API is unstable and may change without notice.
 */
export const createAzureReposProvider = (): SourceProvider<AzureReposSourceInput> => ({
  type: "azurerepos",

  find: () =>
    Effect.fail(
      makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: "Azure Repos sources are not yet supported",
      }),
    ),

  fetch: () =>
    Effect.fail(
      makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: "Azure Repos sources are not yet supported",
      }),
    ),
});
