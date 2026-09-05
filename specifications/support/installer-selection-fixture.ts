import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const installer = fileURLToPath(
  new URL("../../packages/cli/site-content/install.sh", import.meta.url),
);
const executable = (version: string) =>
  Buffer.from(`#!/bin/sh\n[ "$1" = "--version" ] || exit 64\nprintf '%s\\n' '${version}'\n`);
export const makeInstallerSelectionFixture = () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-installer-selection-")));
  const platformHome = path.join(root, "platform-home");
  const applicationHome = path.join(root, "application-home");
  const tools = path.join(root, "transport");
  for (const directory of [platformHome, applicationHome, tools]) fs.mkdirSync(directory);
  const requests = path.join(root, "requests.txt");
  const artifact = `axm-${process.platform}-${process.arch}`;
  const selectedVersion = "1.2.3";
  const newerVersion = "9.0.0";
  for (const [directory, version] of [
    ["selected", selectedVersion],
    ["latest", newerVersion],
  ]) {
    if (directory === undefined || version === undefined)
      throw new Error("Invalid release fixture");
    const release = path.join(root, directory);
    fs.mkdirSync(release);
    const bytes = executable(version);
    fs.writeFileSync(path.join(release, artifact), bytes, { mode: 0o755 });
    fs.writeFileSync(
      path.join(release, "SHA256SUMS"),
      `${createHash("sha256").update(bytes).digest("hex")}  ${artifact}\n`,
    );
  }
  // A downloader transport boundary, not a substitute installer: the actual
  // public shell selects URLs, checks downloaded bytes, executes them, and
  // commits the installation. The latest route serves different valid bytes.
  fs.writeFileSync(
    path.join(tools, "curl"),
    `#!/bin/sh\nset -eu\noutput=''\nurl=''\nwhile [ "$#" -gt 0 ]; do\n  case "$1" in\n    --output) output="$2"; shift 2 ;;\n    -*) shift ;;\n    *) url="$1"; shift ;;\n  esac\ndone\nprintf '%s\\n' "$url" >> "$AXM_FIXTURE_REQUESTS"\ncase "$url" in\n  https://github.com/agentxm/axm/releases/download/cli-v1.2.3/*) release=selected ;;\n  https://github.com/agentxm/axm/releases/latest/download/*) release=latest ;;\n  *) exit 22 ;;\nesac\ncp "$AXM_FIXTURE_ROOT/$release/\${url##*/}" "$output"\n`,
    { mode: 0o755 },
  );
  return {
    root,
    platformHome,
    applicationHome,
    selectedVersion,
    newerVersion,
    selectedBytes: executable(selectedVersion),
    latestBytes: executable(newerVersion),
    serveDifferentReportedVersion: () => {
      for (const file of [artifact, "SHA256SUMS"])
        fs.copyFileSync(path.join(root, "latest", file), path.join(root, "selected", file));
    },
    readRequests: () =>
      fs.existsSync(requests) ? fs.readFileSync(requests, "utf8").trim().split("\n") : [],
    install: (version: string, signal: AbortSignal) =>
      new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn("sh", [installer], {
          cwd: root,
          env: {
            ...process.env,
            HOME: platformHome,
            AXM_USER_HOME: applicationHome,
            AXM_INSTALL_DIR: "",
            AXM_INSTALL_VERSION: version,
            AXM_INSTALL_BASE_URL: "",
            AXM_INSTALL_GITHUB_REPO: "agentxm/axm",
            AXM_NO_UPDATE_CHECK: "1",
            AXM_TELEMETRY: "0",
            DO_NOT_TRACK: "1",
            AXM_TOKEN: "",
            AXM_TOKEN_FILE: "",
            AXM_FIXTURE_ROOT: root,
            AXM_FIXTURE_REQUESTS: requests,
            PATH: `${tools}:${process.env["PATH"] ?? ""}`,
            ENV: "",
            BASH_ENV: "",
          },
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30_000,
          signal,
        });
        let stdout = "",
          stderr = "";
        child.stdout.on("data", (data: Buffer) => {
          stdout += data.toString();
        });
        child.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
        child.once("error", reject);
        child.once("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
      }),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};
