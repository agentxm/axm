import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type InstallTestMode = "bash" | "powershell" | "cmd";

export const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)), "..");

const cliDistDir = path.join(repoRoot, "packages", "cli", "dist");

/** Output of `cli:compile` — one binary per supported platform. */
export const releaseBinaryDir = path.join(cliDistDir, "bin");

/** Output of `cli:compile-host` — the host platform binary only. */
export const hostBinaryDir = path.join(cliDistDir, "host-bin");

const resolveHostBinaryName = (): string => {
  switch (process.platform) {
    case "darwin":
      if (process.arch === "arm64") {
        return "axm-darwin-arm64";
      }

      if (process.arch === "x64") {
        return "axm-darwin-x64";
      }

      break;

    case "linux":
      if (process.arch === "arm64") {
        return "axm-linux-arm64";
      }

      if (process.arch === "x64") {
        return "axm-linux-x64";
      }

      break;

    case "win32":
      if (process.arch === "x64") {
        return "axm-windows-x64.exe";
      }

      break;
  }

  throw new Error(
    `No compiled axm binary target for host platform ${process.platform}/${process.arch}.`,
  );
};

/**
 * Which binary the smoke suite is executing. Each target that runs the suite
 * declares its own subject: `cli-e2e:binary-smoke` tests what `cli:compile`
 * just produced, and `cli-e2e:binary-smoke-artifact` tests an externally
 * identified artifact named by `AXM_BINARY_PATH`.
 */
const resolveBinarySubject = (): "artifact" | "compiled" => {
  const declaredSubject = process.env["AXM_BINARY_SOURCE"];

  if (declaredSubject === undefined || declaredSubject.length === 0) {
    return "compiled";
  }

  if (declaredSubject === "artifact" || declaredSubject === "compiled") {
    return declaredSubject;
  }

  throw new Error(
    `Unsupported AXM_BINARY_SOURCE "${declaredSubject}": expected "artifact" or "compiled".`,
  );
};

/**
 * Binary under test for the smoke suite.
 *
 * In `artifact` mode the artifact identity is a hard requirement: an absent
 * `AXM_BINARY_PATH` is a named failure, never a silent fallback to whatever
 * binary happens to sit in the compile output directory. In `compiled` mode the
 * path is derived from the `cli:compile` output directory and `AXM_BINARY_PATH`
 * is ignored, because that target is cached and an ambient environment variable
 * is not part of its cache key.
 */
export const resolveBinaryPath = (): string => {
  if (resolveBinarySubject() === "compiled") {
    return path.join(releaseBinaryDir, resolveHostBinaryName());
  }

  const identifiedArtifact = process.env["AXM_BINARY_PATH"];

  if (identifiedArtifact === undefined || identifiedArtifact.length === 0) {
    throw new Error(
      "cli-e2e:binary-smoke-artifact requires an identified artifact: set AXM_BINARY_PATH to the binary under test.",
    );
  }

  return identifiedArtifact;
};

/** Host binary produced by `cli:compile-host`, which `cli-e2e:install-suite` depends on. */
export const resolveHostBinaryPath = (): string =>
  path.join(hostBinaryDir, resolveHostBinaryName());

export const resolveInstallMode = (): InstallTestMode => {
  const explicitMode = process.env["AXM_INSTALL_TEST_MODE"];

  if (explicitMode === "bash" || explicitMode === "powershell" || explicitMode === "cmd") {
    return explicitMode;
  }

  return process.platform === "win32" ? "powershell" : "bash";
};
