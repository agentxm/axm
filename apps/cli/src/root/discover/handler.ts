import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { DiscoverExtensions, DiscoverOutputSchema } from "@agentxm/workspace/discovery";
import { observeUnit } from "@agentxm/workspace/transitions/planning";

import { Screen } from "../../screen/index.js";
import { discoverDoc } from "./view.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import {
  ExecutionDirectory,
  resolveExecutionPath,
  type ExecutionDirectoryService,
} from "../../execution-directory.js";

export interface DiscoverHandlerArgs {
  readonly path: Option.Option<string>;
}

export const resolveDiscoverProjectDir = (
  selected: Option.Option<string>,
  executionDirectory: ExecutionDirectoryService,
  path: Pick<Path.Path, "resolve">,
): string =>
  Option.match(selected, {
    onNone: () => executionDirectory.path,
    onSome: (value) => resolveExecutionPath(path, executionDirectory, value),
  });

export const handleDiscover = Effect.fn("Discover.handle")(function* (args: DiscoverHandlerArgs) {
  const screen = yield* Screen;
  const executionDirectory = yield* ExecutionDirectory;
  const path = yield* Path.Path;
  const projectDir = resolveDiscoverProjectDir(args.path, executionDirectory, path);
  const result = yield* withLiveOperation(
    { command: "discover", name: "Discover companion extensions", mode: "preview" },
    observeUnit(
      { id: "dependencies", label: "project dependencies" },
      DiscoverExtensions.query({ projectDir }),
    ),
  );

  if (yield* screen.document(result.document, DiscoverOutputSchema)) {
    return;
  }

  yield* screen.result(discoverDoc(result));
});
