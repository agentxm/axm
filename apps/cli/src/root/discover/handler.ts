import * as Effect from "effect/Effect";

import { DiscoverExtensions, DiscoverOutputSchema } from "@agentxm/workspace-features/discovery";
import { observeUnit } from "@agentxm/workspace-kernel/operations";

import { emitResult } from "../../screen/index.js";
import { discoverDoc } from "./view.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { ExecutionDirectory } from "../../execution-directory.js";

export const handleDiscover = Effect.fn("Discover.handle")(function* () {
  const executionDirectory = yield* ExecutionDirectory;
  const projectDir = executionDirectory.path;
  const result = yield* withLiveOperation(
    { command: "discover", name: "Discover companion extensions", mode: "query" },
    observeUnit(
      { id: "dependencies", label: "project dependencies" },
      DiscoverExtensions.query({ projectDir }),
    ),
  );

  yield* emitResult(result.document, DiscoverOutputSchema, () => discoverDoc(result));
});
