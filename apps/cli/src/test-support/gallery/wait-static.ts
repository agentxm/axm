import type { Doc } from "../../screen/doc.js";
import { deviceSignIn } from "./wait-open.js";

/**
 * The same handoff where nothing animates — CI, a pipe, or `--quiet`. The
 * brief is the whole of it: no countdown, no keys, and the command waits.
 */
export const waitStatic: Doc = deviceSignIn.brief;
