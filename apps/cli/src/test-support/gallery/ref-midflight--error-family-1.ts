import { appErrorDoc, makeAppError } from "../../app-error/index.js";
import type { Doc } from "../../screen/doc.js";

/**
 * The error family, part 1 (*Reference cases*, board `4 · Going wrong
 * mid-flight`, frame *The error family, part 1 — one shape: what, why,
 * identifiers, what next*).
 *
 * Every problem leads with its mark and a title naming what went wrong, with
 * its stable code and exit code as a dim aside at the value column; the reason
 * follows, then identifiers as fields and the copyable recovery. A retry
 * policy that ran out says how many attempts it spent.
 */
export const refMidflightErrorFamily1: Doc = [
  ...appErrorDoc(
    makeAppError({
      code: "auth",
      title: "Sign-in expired",
      detail: "Your session for registry.agentxm.ai ended on 12 Sep.",
      recover: "Sign in, then run the command again",
      cmd: "axm login",
    }),
  ),
  { _tag: "blank" },
  ...appErrorDoc(
    makeAppError({
      code: "network",
      title: "Registry unreachable",
      detail: "registry.agentxm.ai did not answer within 10s",
      metadata: {
        request: {
          service: "registry",
          method: "GET",
          url: "https://registry.agentxm.ai/v1/extensions/@acme/skills/standup",
        },
        requestPolicy: {
          retryable: true,
          attemptCount: 3,
          maxAttempts: 3,
          exhausted: true,
          stoppedBy: "attempt-limit",
          replaySafety: "safe",
        },
      },
      recover: "Show the requests",
      cmd: "axm install @acme/skills/standup --verbose",
    }),
  ),
];
