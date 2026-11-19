import * as Result from "effect/Result";
import { describe, expect, it } from "vitest";

import { parseKeySteps } from "@agentxm/test-support/key-steps";

import { displayWidth } from "../../screen/width.js";
import { unicodeGlyphs } from "../../screen/glyphs.js";
import { driveAsk, type AskRun } from "./drive-ask.js";
import { toolkitPick } from "./samples/pick-asks.js";

const style = { colors: false, glyphs: unicodeGlyphs };
const terminal = { columns: 80, rows: 24 };

const drive = (script: string): Result.Result<AskRun, string> => {
  const steps = parseKeySteps(script);
  if (Result.isFailure(steps)) throw new Error(steps.failure);
  return driveAsk(toolkitPick, steps.success, terminal, style);
};

const succeeded = (run: Result.Result<AskRun, string>): AskRun => {
  if (Result.isFailure(run)) throw new Error(run.failure);
  return run.success;
};

describe("driveAsk", () => {
  it("paints the question as it opens when no step is given", () => {
    const run = succeeded(drive(""));
    expect(run.ending).toEqual({ _tag: "Open" });
    expect(run.frames).toHaveLength(1);
    expect(run.frames[0]?.lines.join("\n")).toContain("2 of 6 selected");
  });

  it("paints the controls under the question's short label, as the live region does", () => {
    const opening = succeeded(drive("")).frames[0]?.lines.join("\n") ?? "";
    expect(opening).toContain("Extensions");
    expect(opening).not.toContain("Which extensions should be installed?");
  });

  it("presses each key through the reducer and ends with the submission", () => {
    // The toolkit opens with code-review and triage picked; the caret starts on
    // the Skills header, so two downs reach triage and space unpicks it.
    const run = succeeded(drive("down*2,space,enter"));
    expect(run.frames.map((frame) => frame.after?._tag)).toEqual([
      undefined,
      "Press",
      "Press",
      "Press",
    ]);
    expect(run.frames.at(-1)?.lines.join("\n")).toContain("1 of 6 selected");
    expect(run.ending).toMatchObject({ _tag: "Submitted", value: ["code-review"] });
  });

  it("repaints the same state in the space a resize gives it", () => {
    const run = succeeded(drive("size:40x10"));
    const resized = run.frames.at(-1)?.lines ?? [];
    expect(resized.length).toBeGreaterThan(0);
    expect(resized.length).toBeLessThanOrEqual(10);
    expect(Math.max(...resized.map(displayWidth))).toBeLessThan(40);
  });

  it("ends with a cancellation on escape", () => {
    expect(succeeded(drive("esc")).ending).toEqual({ _tag: "Cancelled" });
  });

  it("refuses a wait, and a step after the question has settled", () => {
    const wait = drive("await:Skills");
    expect(Result.isFailure(wait) && wait.failure).toContain("pnpm lab run");
    const late = drive("enter,down");
    expect(Result.isFailure(late) && late.failure).toContain("settled at step 1");
  });
});
