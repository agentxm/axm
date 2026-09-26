import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import type { PlanExecution } from "../../transitions/planning/index.js";
import { interactiveOnlyPlanExecution } from "../../transitions/planning/testing.js";

import { makeLifecycleFixture } from "../testing.js";
import { makeFileRegistry } from "@agentxm/registry-client/testing";
import { InstallExtensions, type InstallExtensionsRequest } from "./install-extensions.js";
import { installRequest, previewInstall } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/source-switches-are-previewed-and-atomic",
  title: "Installing an accepted identity from another authority is an approved source switch",
  statement:
    "When install resolves an already accepted extension identity from another source authority, it shall preview content equivalence using the published archive boundary, dependency and projection effects, and Registry guarantees gained or lost; require interactive approval; replace the accepted source atomically in either direction while preserving desired-state fields; and refuse replacement when acquired content has local modifications.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity", "safe-repetition"],
  methods: ["example", "state-transition"],
  derivedFrom: [
    "cli/install/preview-is-pure",
    "cli/publisher-changes-require-interactive-approval",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const NAME = "review";
const FQN = `@acme/skills/${NAME}`;
const BODY = "Review source changes.";
const PUBLISH_IGNORE = ["draft.txt"];
const execution: PlanExecution = interactiveOnlyPlanExecution({
  command: ["install"],
  arguments: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

interface GitFixture {
  readonly url: string;
  readonly cleanup: () => void;
}

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

const makeGitFixture = (): Effect.Effect<GitFixture> =>
  Effect.promise(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-source-switch-git-"));
    const source = path.join(root, "source");
    const packageRoot = path.join(source, "skill");
    const repository = path.join(root, "review.git");
    fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, "skill.json"),
      `${JSON.stringify(
        {
          owner: "@acme",
          type: "skill",
          name: NAME,
          version: "1.0.0",
          description: `The ${NAME} skill.`,
          publish: { ignore: PUBLISH_IGNORE },
        },
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(
      path.join(packageRoot, "src", "SKILL.md"),
      `---\nname: "${NAME}"\ndescription: "The ${NAME} skill."\n---\n\n# ${NAME}\n\n${BODY}\n`,
    );
    fs.writeFileSync(path.join(packageRoot, "draft.txt"), "Not part of the published archive.\n");
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: source });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: source });
    execFileSync("git", ["clone", "--quiet", "--bare", source, repository]);

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
      url: `git://127.0.0.1:${String(port)}/review.git`,
      cleanup: () => {
        daemon.kill();
        fs.rmSync(root, { recursive: true, force: true });
      },
    };
  });

const resolveInstall = (request: InstallExtensionsRequest) =>
  Effect.gen(function* () {
    const candidate = yield* InstallExtensions.prepare(request);
    return yield* InstallExtensions.previewOrApply(candidate, execution);
  });

describe("install source switches", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("switches Git to Registry and back with explicit evidence and preserved intent", () =>
    Effect.gen(function* () {
      const git = yield* makeGitFixture();
      cleanups.push(git.cleanup);
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(NAME, [{ version: "1.0.0", body: BODY, publishIgnore: PUBLISH_IGNORE }]);
      const workspace = makeLifecycleFixture({
        sources: "live",
        confirmation: { available: true, answer: "approved" },
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          defaultRegistry: "test",
          sources: [registry.source],
        },
      });
      cleanups.push(workspace.cleanup);

      yield* workspace.provide(
        Effect.gen(function* () {
          const initial = yield* resolveInstall(
            installRequest({ type: "skill", subject: { kind: "source", source: git.url } }),
          );
          if (!initial.units.every((unit) => unit.state === "committed")) {
            throw new Error(`Initial Git install did not commit: ${JSON.stringify(initial)}`);
          }
          const configured: unknown = JSON.parse(workspace.readFile("axm.json"));
          if (!isRecord(configured) || !isRecord(configured["skills"])) {
            throw new Error(`Expected configured skills in ${workspace.readFile("axm.json")}`);
          }
          const current = configured["skills"][NAME];
          if (typeof current !== "string" && !isRecord(current)) {
            throw new Error("Expected configured review skill");
          }
          const currentEntry = typeof current === "string" ? { source: current } : current;
          const updated = {
            ...configured,
            skills: {
              ...configured["skills"],
              [NAME]: {
                ...currentEntry,
                enabled: false,
                distribute: false,
              },
            },
          };
          workspace.writeFile("axm.json", `${JSON.stringify(updated, null, 2)}\n`);

          const toRegistry = installRequest({
            type: "skill",
            subject: { kind: "source", source: FQN },
          });
          const preview = yield* previewInstall(toRegistry);
          const evidence = preview.units.flatMap((unit) =>
            unit.artifact?.sourceSwitch === undefined ? [] : [unit.artifact.sourceSwitch],
          )[0];
          expect(preview.riskConditions).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: "source-authority-change",
                level: "confirmable",
                consent: "interactive-only",
              }),
            ]),
          );
          expect(evidence).toMatchObject({
            before: { family: "git" },
            after: { family: "registry", resolution: "version 1.0.0" },
            content: "equivalent",
            dependencies: { effect: "not-applicable" },
            projections: { effect: "reconcile" },
            guarantees: {
              gained: expect.arrayContaining(["publisher epoch", "yank filtering"]),
              lost: [],
            },
          });

          const appliedRegistry = yield* resolveInstall(toRegistry);
          expect(appliedRegistry.units.every((unit) => unit.state === "committed")).toBe(true);
          expect(workspace.readFile("axm-lock.yaml")).toContain("type: registry");
          expect(workspace.readFile("axm.json")).toContain('"enabled": false');
          expect(workspace.readFile("axm.json")).toContain('"distribute": false');

          const toGit = installRequest({
            type: "skill",
            subject: { kind: "source", source: git.url },
          });
          const reverted = yield* resolveInstall(toGit);
          const reverseEvidence = reverted.units.flatMap((unit) =>
            unit.artifact?.sourceSwitch === undefined ? [] : [unit.artifact.sourceSwitch],
          )[0];
          expect(reverseEvidence).toMatchObject({
            before: { family: "registry" },
            after: { family: "git" },
            content: "equivalent",
            guarantees: {
              gained: [],
              lost: expect.arrayContaining(["publisher epoch", "yank filtering"]),
            },
          });
          expect(workspace.readFile("axm-lock.yaml")).toContain("type: git");
          expect(workspace.readFile("axm.json")).toContain('"enabled": false');
          expect(workspace.readFile("axm.json")).toContain('"distribute": false');
        }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a source switch over locally modified acquired content", () =>
    Effect.gen(function* () {
      const git = yield* makeGitFixture();
      cleanups.push(git.cleanup);
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(NAME, [{ version: "1.0.0", body: BODY, publishIgnore: PUBLISH_IGNORE }]);
      const workspace = makeLifecycleFixture({
        sources: "live",
        confirmation: { available: true, answer: "approved" },
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          defaultRegistry: "test",
          sources: [registry.source],
        },
      });
      cleanups.push(workspace.cleanup);

      yield* workspace.provide(
        Effect.gen(function* () {
          const initial = yield* resolveInstall(
            installRequest({ type: "skill", subject: { kind: "source", source: git.url } }),
          );
          if (!initial.units.every((unit) => unit.state === "committed")) {
            throw new Error(`Initial Git install did not commit: ${JSON.stringify(initial)}`);
          }
          workspace.writeFile(
            `agent_extensions/git/@acme/skills/${NAME}/src/SKILL.md`,
            "locally modified\n",
          );
          const before = workspace.snapshot();
          const preview = yield* previewInstall(
            installRequest({ type: "skill", subject: { kind: "source", source: FQN } }),
          );

          expect(preview.blocking).toMatchObject({ class: "precondition-unmet" });
          expect(preview.riskConditions).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: "source-switch-current-state", level: "blocked" }),
            ]),
          );
          expect(workspace.snapshot()).toEqual(before);
        }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
