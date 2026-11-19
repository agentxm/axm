import type { WaitView } from "../../../screen/wait/wait.js";
import { handoffWaitView } from "../../../root/auth/view.js";

const EXPIRES_AT_MS = 600_000;

/** The moment the wait frames are painted at: four and a half minutes left on the code. */
export const deviceSignInNowMs = EXPIRES_AT_MS - 272_000;

/** A device sign-in handoff whose browser did not open, so the code is the way in. */
export const deviceSignIn: WaitView = handoffWaitView({
  _tag: "DeviceLogin",
  registryHost: "registry.agentxm.ai",
  verificationUriComplete: "https://agentxm.ai/device?user_code=WDJB-MJHT",
  verificationUri: "https://agentxm.ai/device",
  userCode: "WDJB-MJHT",
  expiresAtMs: EXPIRES_AT_MS,
  browserOpened: false,
});
