/**
 * Running the built CLI and stopping it at a chosen moment.
 *
 * A signal is a process fact: nothing in memory can establish that a durable
 * file was left whole, that a lock was reclaimed, or that a half-finished
 * canonical swap was resolved by the next invocation. These helpers spawn the
 * real binary and deliver the signal from outside it.
 */

import { spawn } from "node:child_process";
import * as http from "node:http";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../../../cli/dist/src/main.js", import.meta.url));

export interface SpawnResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunUntilOptions {
  readonly cwd: string;
  readonly userHome: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Resolves at the moment the signal should be delivered. */
  readonly signalWhen: Promise<unknown>;
  readonly signal: "SIGINT" | "SIGTERM";
}

/** Run the built CLI and deliver `signal` when `signalWhen` resolves. */
export const runCliUntil = async (
  args: ReadonlyArray<string>,
  options: RunUntilOptions,
): Promise<SpawnResult> => {
  const { FORCE_COLOR: _forceColor, ...parentEnv } = process.env;
  return await new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn("bun", ["run", cliPath, ...args], {
      cwd: options.cwd,
      env: {
        ...parentEnv,
        AXM_TELEMETRY: "0",
        AXM_USER_HOME: options.userHome,
        HOME: options.userHome,
        NO_COLOR: "1",
        ...options.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    void options.signalWhen.then(() => child.kill(options.signal));
  });
};

/**
 * Run the built CLI against an HTTP registry that accepts the first request
 * and never answers it, delivering the signal the moment that request arrives
 * — a deterministic interruption before anything is written.
 */
export const interruptOnFirstRegistryRequest = async (
  args: ReadonlyArray<string>,
  options: { readonly cwd: string; readonly userHome: string },
): Promise<SpawnResult> => {
  const registryRequest = Promise.withResolvers<void>();
  const server = http.createServer((_request, _response) => registryRequest.resolve());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("HTTP interruption fixture did not bind a TCP port");
  }
  try {
    return await runCliUntil(args, {
      cwd: options.cwd,
      userHome: options.userHome,
      env: {
        AXM_REGISTRY_LOCATION: `http://127.0.0.1:${address.port}`,
        AXM_REGISTRY_URL: `http://127.0.0.1:${address.port}`,
      },
      signalWhen: registryRequest.promise,
      signal: "SIGINT",
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
};
