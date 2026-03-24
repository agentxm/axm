import * as Layer from "effect/Layer";
import type { OutputFormat } from "../output-format.js";
import type { Output } from "../output/output.js";
import type { Activity } from "../activity/activity.js";
import { OutputLive } from "../output/output-live.js";
import { OutputStructured } from "../output/output-structured.js";
import { ActivityLive } from "../activity/activity-live.js";
import { ActivityStructured } from "../activity/activity-structured.js";

/**
 * Build the Output + Activity layer for the given output format.
 *
 * - text:        OutputLive + ActivityLive (interactive)
 * - json/stream: OutputStructured + ActivityStructured (NDJSON events)
 *
 * Does NOT include Input — callers add InputLive/InputStructured separately
 * since InputLive depends on CliFlags.
 */
export const makeUiLayer = (
  format: OutputFormat,
): Layer.Layer<Output | Activity> =>
  format === "text"
    ? Layer.mergeAll(OutputLive("text"), ActivityLive)
    : Layer.mergeAll(
        OutputStructured(format as Exclude<OutputFormat, "text">),
        ActivityStructured(format as Exclude<OutputFormat, "text">),
      );
