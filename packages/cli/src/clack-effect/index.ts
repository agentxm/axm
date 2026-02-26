import * as Layer from "effect/Layer";
import { ClackLogLive } from "./log/index.js";
import { ClackProgressLive } from "./progress/index.js";
import { ClackPromptLive } from "./prompt/index.js";
import { ClackSpinnerLive } from "./spinner/index.js";
import { ClackStreamLive } from "./stream/index.js";
import { ClackTaskLogLive } from "./task-log/index.js";

// Re-export all sub-modules
export * from "./prompt/index.js";
export * from "./log/index.js";
export * from "./spinner/index.js";
export * from "./progress/index.js";
export * from "./task-log/index.js";
export * from "./stream/index.js";

// runTasks
export { runTasks, type ClackTask } from "./tasks.js";

// Merged convenience layer
export const ClackLive = Layer.mergeAll(
  ClackPromptLive,
  ClackLogLive,
  ClackSpinnerLive,
  ClackProgressLive,
  ClackTaskLogLive,
  ClackStreamLive,
);
