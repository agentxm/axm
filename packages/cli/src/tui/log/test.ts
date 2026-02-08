import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Log, type LogService } from "./service.js";

export interface LogRecords {
  readonly info: string[];
  readonly warn: string[];
  readonly error: string[];
  readonly success: string[];
  readonly message: string[];
}

export interface MockLogService extends LogService {
  readonly logs: LogRecords;
}

export function makeLogTestLayer(): [Layer.Layer<Log>, MockLogService] {
  const logs: LogRecords = {
    info: [],
    warn: [],
    error: [],
    success: [],
    message: [],
  };

  const mockService: MockLogService = {
    logs,
    info: (message) =>
      Effect.sync(() => {
        logs.info.push(message);
      }),
    warn: (message) =>
      Effect.sync(() => {
        logs.warn.push(message);
      }),
    error: (message) =>
      Effect.sync(() => {
        logs.error.push(message);
      }),
    success: (message) =>
      Effect.sync(() => {
        logs.success.push(message);
      }),
    message: (message) =>
      Effect.sync(() => {
        logs.message.push(message);
      }),
  };

  const layer = Layer.succeed(Log, mockService);
  return [layer, mockService];
}
