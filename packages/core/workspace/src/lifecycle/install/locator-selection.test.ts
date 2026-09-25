import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { ExtensionLifecycleFailed } from "../errors.js";
import { writeLocalRulePackage, writeLocalSkillPackage } from "../testing.js";
import { deriveOperationOutcome } from "../../transitions/planning/index.js";
import { applyInstall, installRequest, makeInstallWorld } from "./test-helpers.js";

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
    process.stderr?.on("data", (chunk: Buffer) => {
      if (!chunk.toString().includes("Ready to rumble")) return;
      clearTimeout(timeout);
      resolve();
    });
    process.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Git fixture exited before readiness with status ${String(code)}`));
    });
  });

const startGitSource = async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-locator-git-"));
  const source = path.join(root, "source");
  const remote = path.join(root, "source.git");
  fs.mkdirSync(source);
  writeLocalSkillPackage(source, { name: "review" });
  writeLocalRulePackage(source, { name: "style" });
  const git = (args: ReadonlyArray<string>, cwd = source): void => {
    execFileSync("git", args, { cwd, stdio: "ignore" });
  };
  git(["init", "--quiet", "--initial-branch=main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "fixture"]);
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
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  return {
    url: `git://127.0.0.1:${String(port)}/source.git`,
    close: () => {
      daemon.kill();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
};

describe("root locator install selection", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("requires a per-type selector or --all when no prompt can open", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeLocalSkillPackage(world.workspace.root, { name: "code-review" });

    return Effect.gen(function* () {
      const failure = yield* world.workspace
        .provide(
          applyInstall(
            installRequest({
              subject: { kind: "source", source },
              selectors: {},
              all: false,
              nonInteractive: true,
            }),
          ),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.flip);

      expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
      expect(failure).toMatchObject({
        category: "usage",
        detail: "A per-type selector or --all is required when no prompt can open",
      });
    });
  });

  it.effect(
    "surfaces a selector that matched nothing instead of reading it as an empty type",
    () => {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const source = writeLocalSkillPackage(world.workspace.root, { name: "code-review" });

      return Effect.gen(function* () {
        const failure = yield* world.workspace
          .provide(
            applyInstall(
              installRequest({
                subject: { kind: "source", source },
                selectors: { skill: ["missing"] },
                all: false,
                nonInteractive: true,
              }),
            ),
          )
          .pipe(Effect.provide(NodeServices.layer), Effect.flip);

        expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
        expect(failure).toMatchObject({
          category: "not_found",
          detail: "No skills matched: missing. Source contains: code-review",
        });
      });
    },
  );

  it.effect("installs two types from one Git locator source view", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    return Effect.acquireUseRelease(
      Effect.promise(startGitSource),
      (git) =>
        world.workspace
          .provide(
            applyInstall(
              installRequest({
                subject: { kind: "source", source: git.url },
                selectors: { skill: ["review"], rule: ["style"] },
                all: false,
                nonInteractive: true,
              }),
            ),
          )
          .pipe(
            Effect.tap((resolution) =>
              Effect.sync(() => {
                expect(deriveOperationOutcome(resolution)).toBe("applied");
                expect(
                  world.workspace.readFile("agent_extensions/git/@acme/skills/review/src/SKILL.md"),
                ).toContain("The review skill.");
                expect(
                  world.workspace.readFile("agent_extensions/git/@acme/rules/style/src/RULE.md"),
                ).toContain("Guidance for style");
              }),
            ),
            Effect.provide(NodeServices.layer),
          ),
      (git) => Effect.sync(git.close),
    );
  });
});
