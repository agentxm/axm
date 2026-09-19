import type { Doc } from "../../screen/doc.js";
import { waitDoc } from "../../screen/wait/view.js";
import type { WaitView } from "../../screen/wait/wait.js";

const EXPIRES_AT_MS = 600_000;
const NOW_MS = EXPIRES_AT_MS - 272_000;

export const deviceSignIn: WaitView = {
  subject: "device-authorization",
  detail: "waiting on you",
  label: "Device sign-in",
  status: "Waiting for approval on registry.agentxm.ai",
  brief: [
    { _tag: "paragraph", text: "Sign in to AgentXM.ai with a one-time code." },
    {
      _tag: "paragraph",
      text: [{ text: "One-time code: " }, { text: "WDJB-MJHT", copyable: true }],
    },
    {
      _tag: "paragraph",
      text: [
        { text: "Open: " },
        { text: "https://agentxm.ai/device?user_code=WDJB-MJHT", copyable: true },
      ],
    },
    {
      _tag: "paragraph",
      tone: "dim",
      text: [
        { text: "Or enter the code at: " },
        { text: "https://agentxm.ai/device", copyable: true },
      ],
    },
    {
      _tag: "paragraph",
      tone: "warn",
      text: "Only continue if you started this sign-in with AXM.",
    },
  ],
  expiresAtMs: EXPIRES_AT_MS,
};

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
