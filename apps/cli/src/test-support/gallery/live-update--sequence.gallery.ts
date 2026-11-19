import type { Doc } from "../../screen/doc.js";
import { progressActivity, progressTransitionDoc } from "../../screen/progress-view.js";
import { initialProgress, reduceProgress } from "../../screen/progress.js";
import { galleryModule, stressWidths, type TranscriptCheckpoint } from "./fixture.js";
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
const liveUpdateStart = frame(0, "started");
const liveUpdateMid = frame(4, "started");
const liveUpdateFailure = frame(5, "settled");
const liveUpdateLast = frame(11, "started");

/** Every checkpoint is held at the stress widths. */
export default galleryModule(
  {
    _tag: "transcript",
    name: "live-update--start",
    ...liveUpdateStart,
    snapshotWidths: stressWidths,
  },
  {
    _tag: "transcript",
    name: "live-update--mid",
    ...liveUpdateMid,
    snapshotWidths: stressWidths,
  },
  {
    _tag: "transcript",
    name: "live-update--failure",
    ...liveUpdateFailure,
    snapshotWidths: stressWidths,
  },
  {
    _tag: "transcript",
    name: "live-update--last",
    ...liveUpdateLast,
    snapshotWidths: stressWidths,
  },
);
