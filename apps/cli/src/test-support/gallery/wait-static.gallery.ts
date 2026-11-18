import type { Doc } from "../../screen/doc.js";
import { deviceSignIn } from "./samples/handoff-waits.js";
import { galleryModule } from "./fixture.js";

/**
 * The same handoff where nothing animates — CI, a pipe, or `--quiet`. The
 * brief is the whole of it: no countdown, no keys, and the command waits.
 */
const waitStatic: Doc = deviceSignIn.brief;

export default galleryModule({
  _tag: "document",
  name: "wait-static",
  doc: waitStatic,
});
