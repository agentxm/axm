import type { Doc } from "../../screen/doc.js";
import { progressActivity, progressTransitionDoc } from "../../screen/progress-view.js";
import { initialProgress, reduceProgress } from "../../screen/progress.js";
import type { TranscriptCheckpoint } from "./fixture.js";
import { liveUpdateNowMs, liveUpdateThrough } from "./samples/operation-stress.js";

/** Each checkpoint includes committed history, followed by current activity. */
const frame = (index: number, phase: "started" | "settled"): TranscriptCheckpoint => {
  let state = initialProgress;
  const transcript: Array<Doc[number]> = [];
  for (const event of liveUpdateThrough(index, phase)) {
    const next = reduceProgress(state, event);
    transcript.push(...progressTransitionDoc(state, next));
    state = next;
  }
  return {
    history: transcript,
    scene: {
      activity: (facts) => progressActivity(state)({ ...facts, nowMs: liveUpdateNowMs(index) }),
    },
  };
};
export const liveUpdateStart = frame(0, "started");
export const liveUpdateMid = frame(4, "started");
export const liveUpdateFailure = frame(5, "settled");
export const liveUpdateLast = frame(11, "started");
