import * as ServiceMap from "effect/Context";
import type * as Path from "effect/Path";

import {
  decodeAbsolutePathSync,
  type AbsolutePath,
} from "@agentxm/extension-model/unstable/path-types";

export interface ExecutionDirectoryService {
  readonly path: AbsolutePath;
}

export class ExecutionDirectory extends ServiceMap.Service<
  ExecutionDirectory,
  ExecutionDirectoryService
>()("axm.sh/execution-directory/ExecutionDirectory") {}

export const resolveExecutionPath = (
  path: Pick<Path.Path, "resolve">,
  executionDirectory: ExecutionDirectoryService,
  value: string,
): AbsolutePath => decodeAbsolutePathSync(path.resolve(executionDirectory.path, value));
