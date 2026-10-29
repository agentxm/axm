/**
 * The inherited Git transport context: the environment child Git processes
 * inherit, and the fingerprint that tells source reads under different
 * transport or credential contexts apart.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { withoutLocalGitEnvironment } from "@agentxm/host-primitives";
import { createHash } from "node:crypto";

/** Transport context with repository selectors removed; fingerprint this same environment. */
export const inheritedGitEnvironment = () =>
  // eslint-disable-next-line no-restricted-properties -- This process adapter forwards inherited transport settings to child Git processes.
  withoutLocalGitEnvironment(process.env, { preserveCommandConfig: true });

/** Distinguish source reads under different inherited transport or credential contexts. */
export const gitTransportContextFingerprint = (): string =>
  createHash("sha256")
    .update(
      JSON.stringify(
        Object.entries(inheritedGitEnvironment()).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    )
    .digest("hex");
