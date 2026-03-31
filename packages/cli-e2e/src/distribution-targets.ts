import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type InstallTestMode = "bash" | "powershell" | "cmd";

export const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)), "..");
export const binaryDir = path.join(repoRoot, "packages", "cli", "dist", "bin");

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

export const resolveBinaryPath = (): string =>
  process.env["AXM_BINARY_PATH"] ?? path.join(binaryDir, resolveHostBinaryName());

export const resolveInstallMode = (): InstallTestMode => {
  const explicitMode = process.env["AXM_INSTALL_TEST_MODE"];

  if (explicitMode === "bash" || explicitMode === "powershell" || explicitMode === "cmd") {
    return explicitMode;
  }

  return process.platform === "win32" ? "powershell" : "bash";
};
