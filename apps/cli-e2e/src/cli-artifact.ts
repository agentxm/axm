/**
 * Which axm artifact this suite observes.
 *
 * `AXM_E2E_CLI_SOURCE` selects the compiled single-file executable or the
 * built ESM entry. One resolution serves both the piped runner and the
 * pseudo-terminal harness, so the two can never disagree about which build a
 * failure came from. The Bun runtime for a built entry is resolved by
 * whichever runner spawns it, not here.
 */

import { fileURLToPath } from "node:url";

import { resolveHostBinaryPath } from "./distribution-targets.js";

export interface CliArtifact {
  /** `binary` runs the path directly; `bun-script` runs it under Bun. */
  readonly runtime: "binary" | "bun-script";
  readonly path: string;
}

const declaredSource = process.env["AXM_E2E_CLI_SOURCE"] ?? "compiled";
if (declaredSource !== "built" && declaredSource !== "compiled")
  throw new Error(`Unsupported AXM_E2E_CLI_SOURCE: ${declaredSource}.`);

export const cliArtifact: CliArtifact =
  declaredSource === "compiled"
    ? { runtime: "binary", path: resolveHostBinaryPath() }
    : {
        runtime: "bun-script",
        path: fileURLToPath(new URL("../../cli/dist/src/main.js", import.meta.url)),
      };
