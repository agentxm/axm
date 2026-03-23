import * as p from "@clack/prompts";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ClackTaskLogConfig, ClackTaskLogGroupHandle, ClackTaskLogHandle } from "./types.js";

export class ClackTaskLog extends ServiceMap.Service<
  ClackTaskLog,
  {
    readonly start: (config: ClackTaskLogConfig) => Effect.Effect<ClackTaskLogHandle>;
  }
>()("@axm.sh/cli/clack-effect/ClackTaskLog") {}

const wrapGroupHandle = (
  group: ReturnType<ReturnType<typeof p.taskLog>["group"]>,
): ClackTaskLogGroupHandle => ({
  message: (msg) => Effect.sync(() => group.message(msg)),
  error: (message) => Effect.sync(() => group.error(message)),
  success: (message) => Effect.sync(() => group.success(message)),
});

const wrapTaskLogHandle = (handle: ReturnType<typeof p.taskLog>): ClackTaskLogHandle => ({
  message: (msg) => Effect.sync(() => handle.message(msg)),
  group: (name) => Effect.sync(() => wrapGroupHandle(handle.group(name))),
  error: (message) => Effect.sync(() => handle.error(message)),
  success: (message) => Effect.sync(() => handle.success(message)),
});

const makeLiveClackTaskLogService = (): ServiceMap.Service.Shape<typeof ClackTaskLog> => ({
  start: (config) => Effect.sync(() => wrapTaskLogHandle(p.taskLog(config))),
});

export const ClackTaskLogLive: Layer.Layer<ClackTaskLog> = Layer.succeed(
  ClackTaskLog,
  makeLiveClackTaskLogService(),
);
