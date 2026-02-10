/**
 * Source provider stub for Azure Repos.
 *
 * Not yet implemented -- all operations fail with a descriptive error.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { SourceError } from "../provider.js";
import type { SourceProvider } from "../provider.js";
import type { AzureReposSourceInput } from "../types.js";

/**
 * Source provider for Azure Repos (stub).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createAzureReposProvider = (): SourceProvider<AzureReposSourceInput> => ({
  type: "azurerepos",

  find: () =>
    Effect.fail(
      new SourceError({
        message: "Azure Repos sources are not yet supported",
        cause: undefined,
      }),
    ),

  fetch: () =>
    Effect.fail(
      new SourceError({
        message: "Azure Repos sources are not yet supported",
        cause: undefined,
      }),
    ),
});
