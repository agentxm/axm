import type { Doc } from "../../screen/doc.js";
import { waitDoc } from "../../screen/wait/view.js";
import { deviceSignIn, deviceSignInNowMs } from "./samples/handoff-waits.js";
import { galleryModule } from "./fixture.js";

/**
 * One wait as the terminal shows it: the brief that printed once, carrying the
 * values a person copies, and beneath it the only line that repaints — the
 * countdown and the keys that reopen, copy, and stop the wait.
 */
const waitOpen: Doc = [
  ...deviceSignIn.brief,
  { _tag: "blank" },
  ...waitDoc(deviceSignIn, { open: true, copy: true }, { nowMs: deviceSignInNowMs }),
];

export default galleryModule({
  _tag: "document",
  name: "wait-open",
  doc: waitOpen,
});
