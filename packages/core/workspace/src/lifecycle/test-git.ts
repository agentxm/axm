/**
 * A Git-hosted skill repository a specification can install from.
 *
 * Serves one bare repository over the Git protocol from a throwaway daemon,
 * so the production Git source provider lists its refs and clones it exactly
 * as it would a remote. The working copy behind it can advance, be tagged,
 * or have its history replaced, which models the source movements the
 * lifecycle specifications reason about.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";

import { writeLocalSkillPackage } from "./test-packages.js";

const availablePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Expected an allocated TCP port"));
        return;
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
    });
  });

const awaitGitDaemon = (process: ChildProcess): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Git fixture did not become ready")), 5_000);
    const ready = (chunk: Buffer) => {
      if (!chunk.toString().includes("Ready to rumble")) return;
      clearTimeout(timeout);
      resolve();
    };
    process.stderr?.on("data", ready);
    process.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Git fixture exited before readiness with status ${String(code)}`));
    });
  });

export interface GitSkillRepository {
  /** The `git://` URL the daemon serves the repository at. */
  readonly url: string;
  /** The commit the repository was published with. */
  readonly acceptedCommit: string;
  /** Publish a newer commit that changes the skill's guidance. */
  readonly advance: () => void;
  /** Advertise the current commit under a tag. */
  readonly tag: (name: string) => void;
  /** Replace the published history so the accepted commit is unreachable. */
  readonly replaceHistory: () => void;
  readonly cleanup: () => void;
}

/** Serve a repository holding one skill package under `vendor/<name>`. */
export const makeGitSkillRepository = (options: {
  readonly name: string;
  readonly description?: string;
}): Effect.Effect<GitSkillRepository> =>
  Effect.promise(async () => {
    const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-lifecycle-git-"));
    const source = nodePath.join(root, "source");
    const repository = nodePath.join(root, "extensions.git");
    fs.mkdirSync(source);
    writeLocalSkillPackage(source, {
      name: options.name,
      description: options.description ?? "Accepted guidance.",
    });
    const git = (args: ReadonlyArray<string>, cwd = source): string =>
      execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    git(["init", "--quiet", "--initial-branch=main"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Test"]);
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "accepted"]);
    const acceptedCommit = git(["rev-parse", "HEAD"]);
    git(["clone", "--quiet", "--bare", source, repository], root);
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
      fs.rmSync(root, { recursive: true, force: true });
      throw error;
    }
    const skillDocument = nodePath.join(source, "vendor", options.name, "src", "SKILL.md");
    return {
      url: `git://127.0.0.1:${String(port)}/extensions.git`,
      acceptedCommit,
      advance: () => {
        fs.appendFileSync(skillDocument, "\nNew guidance.\n");
        git(["add", "."]);
        git(["commit", "--quiet", "-m", "newer"]);
        git(["push", "--quiet", repository, "main"]);
      },
      tag: (name) => {
        git(["tag", name]);
        git(["push", "--quiet", repository, name]);
      },
      replaceHistory: () => {
        git(["checkout", "--quiet", "--orphan", "replacement"]);
        fs.appendFileSync(skillDocument, "\nUnrelated history.\n");
        git(["add", "."]);
        git(["commit", "--quiet", "-m", "replacement"]);
        git(["push", "--quiet", "--force", repository, "HEAD:main"]);
        git(["reflog", "expire", "--expire=now", "--all"], repository);
        git(["gc", "--prune=now"], repository);
      },
      cleanup: () => {
        daemon.kill();
        fs.rmSync(root, { recursive: true, force: true });
      },
    };
  });
