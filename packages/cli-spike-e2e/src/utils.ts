import { createBinaryRunner, createTempDir } from "@agentxm/client-e2e-utils";

const binaryName = process.platform === "win32" ? "axm-spike.exe" : "axm-spike";

export const runCli = createBinaryRunner(
  new URL(`../../cli-spike/dist/bin/${binaryName}`, import.meta.url),
);
export { createTempDir };
