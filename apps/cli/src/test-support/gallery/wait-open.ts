import type { Doc } from "../../screen/doc.js";
import { waitDoc } from "../../screen/wait/view.js";
import type { WaitView } from "../../screen/wait/wait.js";
import { handoffWaitView } from "../../root/auth/view.js";

const EXPIRES_AT_MS = 600_000;
const NOW_MS = EXPIRES_AT_MS - 272_000;

export const deviceSignIn: WaitView = handoffWaitView({
  _tag: "DeviceLogin",
  registryHost: "registry.agentxm.ai",
  verificationUriComplete: "https://agentxm.ai/device?user_code=WDJB-MJHT",
  verificationUri: "https://agentxm.ai/device",
  userCode: "WDJB-MJHT",
  expiresAtMs: EXPIRES_AT_MS,
  browserOpened: false,
});

/**
 * One wait as the terminal shows it: the brief that printed once, carrying the
 * values a person copies, and beneath it the only line that repaints — the
 * countdown and the keys that reopen, copy, and stop the wait.
 */
export const waitOpen: Doc = [
  ...deviceSignIn.brief,
  { _tag: "blank" },
  ...waitDoc(deviceSignIn, { open: true, copy: true }, { nowMs: NOW_MS }),
];
