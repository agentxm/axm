import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackTaskLog, type ClackTaskLogService } from "./service.js";
import type { ClackTaskLogGroupHandle } from "./types.js";

export interface ClackTaskLogGroupCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface ClackTaskLogGroupRecord {
  readonly name: string;
  readonly calls: ClackTaskLogGroupCall[];
}

export interface ClackTaskLogCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface MockClackTaskLogService extends ClackTaskLogService {
  readonly calls: ClackTaskLogCall[];
  readonly groups: ClackTaskLogGroupRecord[];
}

export function makeClackTaskLogTestLayer(): [Layer.Layer<ClackTaskLog>, MockClackTaskLogService] {
  const calls: ClackTaskLogCall[] = [];
  const groups: ClackTaskLogGroupRecord[] = [];

  const makeGroupHandle = (name: string): ClackTaskLogGroupHandle => {
    const groupRecord: ClackTaskLogGroupRecord = { name, calls: [] };
    groups.push(groupRecord);
    return {
      message: (msg) =>
        Effect.sync(() => {
          groupRecord.calls.push({ method: "message", args: [msg] });
        }),
      error: (message) =>
        Effect.sync(() => {
          groupRecord.calls.push({ method: "error", args: [message] });
        }),
      success: (message) =>
        Effect.sync(() => {
          groupRecord.calls.push({ method: "success", args: [message] });
        }),
    };
  };

  const mockService: MockClackTaskLogService = {
    calls,
    groups,
    start: (config) =>
      Effect.sync(() => {
        calls.push({ method: "start", args: [config] });
        return {
          message: (msg: string) =>
            Effect.sync(() => {
              calls.push({ method: "message", args: [msg] });
            }),
          group: (name: string) =>
            Effect.sync(() => {
              calls.push({ method: "group", args: [name] });
              return makeGroupHandle(name);
            }),
          error: (message: string) =>
            Effect.sync(() => {
              calls.push({ method: "error", args: [message] });
            }),
          success: (message: string) =>
            Effect.sync(() => {
              calls.push({ method: "success", args: [message] });
            }),
        };
      }),
  };

  const layer = Layer.succeed(ClackTaskLog, mockService);
  return [layer, mockService];
}
