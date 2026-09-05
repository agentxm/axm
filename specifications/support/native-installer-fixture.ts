import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const installer = fileURLToPath(new URL("../../install.sh", import.meta.url));
const version = "1.2.3";
// This executable answers only --version. It proves installer file placement
// and printed shell commands, never AXM product startup or functionality.
const executable = Buffer.from(
  `#!/bin/sh\nif [ "$#" -eq 1 ] && [ "$1" = "--version" ]; then\n  printf '%s\\n' '${version}'\nelse\n  exit 64\nfi\n`,
);
const alteredExecutable = Buffer.concat([executable, Buffer.from("# Altered download bytes\n")]);
const checksum = createHash("sha256").update(executable).digest("hex");

interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}
interface InstallOptions {
  readonly installDirectory?: string;
  readonly includeOnPath?: boolean;
  readonly corruptDownload?: boolean;
}
export interface NativeInstallerFixture {
  readonly root: string;
  readonly userHome: string;
  readonly customDirectory: string;
  readonly version: string;
  readonly executable: Buffer;
  readonly requests: ReadonlyArray<string>;
  readonly artifactName: string;
  readonly install: (options?: InstallOptions) => Promise<ProcessResult>;
  readonly runShell: (command: string) => Promise<ProcessResult>;
}

export const withNativeInstallerFixture = async <A>(
  use: (fixture: NativeInstallerFixture) => Promise<A>,
  signal: AbortSignal,
): Promise<A> => {
  if (process.platform !== "darwin" && process.platform !== "linux")
    throw new Error(
      "The primary shell fixture requires macOS or Linux; Windows uses installed matrix evidence",
    );
  if (process.arch !== "arm64" && process.arch !== "x64")
    throw new Error("The primary shell fixture requires a supported architecture");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm installer spec ")));
  const userHome = path.join(root, "user home");
  const customDirectory = path.join(root, "custom tools", "bin");
  fs.mkdirSync(userHome, { recursive: true });
  const requests: string[] = [];
  const artifactName = `axm-${process.platform}-${process.arch}`;
  const server = http.createServer((request, response) => {
    const requestPath = request.url ?? "/";
    requests.push(requestPath);
    if (requestPath.endsWith("/SHA256SUMS")) response.end(`${checksum}  ${artifactName}\n`);
    else if (requestPath.endsWith(`/${artifactName}`))
      response.end(requestPath.startsWith("/corrupt/") ? alteredExecutable : executable);
    else {
      response.statusCode = 404;
      response.end("Unknown fixture artifact");
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Fixture server has no port");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const environment = {
      ...process.env,
      HOME: userHome,
      AXM_USER_HOME: userHome,
      AXM_INSTALL_VERSION: version,
      AXM_INSTALL_DIR: "",
      ENV: "",
      BASH_ENV: "",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
      AXM_TELEMETRY: "0",
    };
    const run = (args: ReadonlyArray<string>, env: NodeJS.ProcessEnv) =>
      new Promise<ProcessResult>((resolve, reject) => {
        const child = spawn("sh", [...args], {
          cwd: root,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30_000,
          signal,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
      });
    return await use({
      root,
      userHome,
      customDirectory,
      version,
      executable,
      requests,
      artifactName,
      install: (options = {}) => {
        const directory = options.installDirectory ?? path.join(userHome, ".axm", "bin");
        return run([installer], {
          ...environment,
          AXM_INSTALL_BASE_URL: `${baseUrl}/${options.corruptDownload ? "corrupt" : "valid"}`,
          AXM_INSTALL_DIR: options.installDirectory ?? "",
          PATH: options.includeOnPath
            ? `${directory}:${process.env["PATH"] ?? ""}`
            : process.env["PATH"],
        });
      },
      runShell: (command) => run(["-c", command], environment),
    });
  } finally {
    try {
      await new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
};
