/**
 * Running the built CLI and stopping it at a chosen moment.
 *
 * A signal is a process fact: nothing in memory can establish that a durable
 * file was left whole, that a lock was reclaimed, or that a half-finished
 * canonical swap was resolved by the next invocation. These helpers spawn the
 * real binary and deliver the signal from outside it.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { cliArtifact } from "../cli-artifact.js";
import { writeDefaultRegistrySettings } from "./utils.js";

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
    const child = spawn(
      cliArtifact.runtime === "binary" ? cliArtifact.path : "bun",
      cliArtifact.runtime === "binary" ? [...args] : ["run", cliArtifact.path, ...args],
      {
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
      },
    );
    let stdout = "";
    let stderr = "";
    let failure: Error | undefined;
    const stop = (reason: Error) => {
      failure = reason;
      child.kill("SIGKILL");
    };
    let deadline = setTimeout(
      () => stop(new Error("CLI did not reach the interruption boundary within 30 seconds")),
      30_000,
    );
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(deadline);
      if (failure !== undefined)
        reject(new Error(`${failure.message}\n${stdout}\n${stderr}`, { cause: failure }));
      else resolve({ code, stdout, stderr });
    });
    void options.signalWhen.then(
      () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        clearTimeout(deadline);
        deadline = setTimeout(
          () => stop(new Error("CLI did not finish interruption cleanup within 5 seconds")),
          5_000,
        );
        child.kill(options.signal);
      },
      (cause: unknown) => stop(new Error("Could not observe the interruption boundary", { cause })),
    );
  });
};

/** Observe the waiting publisher's prepared owner before signalling it. */
export const waitForPublicationWaiter = (directory: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      clearInterval(poll);
      reject(new Error("Publisher did not prepare its lock owner within 10 seconds"));
    }, 10_000);
    const poll = setInterval(() => {
      try {
        const staged = fs
          .readdirSync(directory)
          .some(
            (name) =>
              name.startsWith(".publication-") &&
              fs.existsSync(path.join(directory, name, "owner.json")),
          );
        if (!staged) return;
        clearTimeout(deadline);
        clearInterval(poll);
        resolve();
      } catch (cause) {
        clearTimeout(deadline);
        clearInterval(poll);
        reject(cause);
      }
    }, 10);
  });

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
  const settingsPath = path.join(options.cwd, "axm.json");
  const originalSettings = fs.existsSync(settingsPath)
    ? fs.readFileSync(settingsPath, "utf8")
    : undefined;
  try {
    writeDefaultRegistrySettings(settingsPath, `http://127.0.0.1:${address.port}`);
    return await runCliUntil(args, {
      cwd: options.cwd,
      userHome: options.userHome,
      signalWhen: registryRequest.promise,
      signal: "SIGINT",
    });
  } finally {
    if (originalSettings === undefined) {
      fs.rmSync(settingsPath, { force: true });
    } else {
      fs.writeFileSync(settingsPath, originalSettings);
    }
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
};
