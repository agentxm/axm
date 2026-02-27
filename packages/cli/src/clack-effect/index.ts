import * as Layer from "effect/Layer";
import { ClackLogLive } from "./log/index.js";
import { ClackProgressLive } from "./progress/index.js";
import { ClackPromptLive } from "./prompt/index.js";
import { ClackSpinnerLive } from "./spinner/index.js";
import { ClackStreamLive } from "./stream/index.js";
import { ClackTaskLogLive } from "./task-log/index.js";
import { LegacyPromptLive } from "./legacy-prompt.js";
import type { ClackPromptBehavior } from "./prompt/index.js";
import { ClackLog } from "./log/service.js";
import { ClackSpinner } from "./spinner/service.js";

// Re-export all sub-modules
export * from "./prompt/index.js";
export * from "./log/index.js";
export * from "./spinner/index.js";
export * from "./progress/index.js";
export * from "./task-log/index.js";
export * from "./stream/index.js";
export * from "./legacy-prompt.js";

// runTasks
export { runTasks, type ClackTask } from "./tasks.js";

// Legacy aliases for migration compatibility

/** @deprecated Use {@link ClackLog} instead. */
export const Log = ClackLog;
/** @deprecated Use {@link ClackLog} instead. */
export type Log = ClackLog;
/** @deprecated Use {@link ClackSpinner} instead. */
export const Spinner = ClackSpinner;
/** @deprecated Use {@link ClackSpinner} instead. */
export type Spinner = ClackSpinner;
/** @deprecated Use {@link ClackPromptBehavior} instead. */
export type PromptBehavior = ClackPromptBehavior;

// Merged convenience layer
export const ClackLive = Layer.mergeAll(
  Layer.provide(LegacyPromptLive, ClackPromptLive),
  ClackPromptLive,
  ClackLogLive,
  ClackSpinnerLive,
  ClackProgressLive,
  ClackTaskLogLive,
  ClackStreamLive,
);
