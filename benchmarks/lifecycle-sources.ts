/** Local path and loopback Git sources for controlled lifecycle measurements. */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";

const owner = "@acme";

export const writeSkillPackage = (root: string, name: string, body: string): string => {
  const packageRoot = path.join(root, "vendor", name);
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "skill.json"),
    `${JSON.stringify({ owner, type: "skill", name, version: "1.0.0", description: `The ${name} skill.` })}\n`,
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "SKILL.md"),
    `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n\n# ${name}\n\n${body}\n`,
  );
  return packageRoot;
};

const availablePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Git benchmark fixture could not allocate a port."));
        return;
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
    });
  });

const awaitGitDaemon = (daemon: ChildProcess): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Git benchmark daemon was not ready.")),
      5_000,
    );
    const ready = (chunk: Buffer) => {
      if (!chunk.toString().includes("Ready to rumble")) return;
      clearTimeout(timeout);
      resolve();
    };
    daemon.stderr?.on("data", ready);
    daemon.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Git benchmark daemon exited with ${String(code)}.`));
    });
  });

export interface LifecycleGitSource {
  readonly url: string;
  readonly advance: () => void;
  readonly close: () => Promise<void>;
}

export const startLifecycleGitSource = async (root: string): Promise<LifecycleGitSource> => {
  const source = path.join(root, "git-source");
  const remote = path.join(root, "bench.git");
  fs.mkdirSync(source);
  writeSkillPackage(source, "bench-git", "Accepted Git guidance.");
  const git = (args: ReadonlyArray<string>, cwd = source): string =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      env: {
        PATH: process.env["PATH"],
        HOME: path.join(root, "git-author-home"),
        GIT_CONFIG_NOSYSTEM: "1",
      },
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  fs.mkdirSync(path.join(root, "git-author-home"));
  git(["init", "--quiet", "--initial-branch=main"]);
  git(["config", "user.email", "benchmark@example.invalid"]);
  git(["config", "user.name", "Benchmark"]);
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "accepted"]);
  git(["clone", "--quiet", "--bare", source, remote], root);
  const port = await availablePort();
  const daemon = spawn(
    "git",
    [
      "daemon",
      "--verbose",
      "--reuseaddr",
      "--export-all",
      `--base-path=${root}`,
      "--listen=127.0.0.1",
      `--port=${String(port)}`,
      root,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  try {
    await awaitGitDaemon(daemon);
  } catch (error) {
    daemon.kill();
    throw error;
  }
  return {
    url: `git://127.0.0.1:${String(port)}/bench.git`,
    advance: () => {
      fs.appendFileSync(
        path.join(source, "vendor", "bench-git", "src", "SKILL.md"),
        "\nNew Git guidance.\n",
      );
      git(["add", "."]);
      git(["commit", "--quiet", "-m", "newer"]);
      git(["push", remote, "main"]);
    },
    close: () =>
      new Promise<void>((resolve) => {
        if (daemon.exitCode !== null) return resolve();
        daemon.once("exit", () => resolve());
        daemon.kill();
      }),
  };
};
