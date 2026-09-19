import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { defineSpecification } from "@agentxm/specification-metadata";
import type { PlanExecution } from "../../transitions/planning/index.js";
import { interactiveOnlyPlanExecution } from "../../transitions/planning/testing.js";

import { makeLifecycleFixture, makeLifecycleRegistry } from "../testing.js";
import { InstallExtensions, type InstallExtensionsRequest } from "./install-extensions.js";
import { installRequest, previewInstall } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/pack-source-switches-are-member-diffed",
  title: "Pack authority switches are atomic member-diffed reinstalls",
  statement:
    "When install resolves an accepted Pack identity from another source authority, it shall preview every member as added, removed, retained, source-changed, version-changed, or unchanged with prior and target authority evidence; apply the target manifest as one atomic graph transition; retain a dropped member that is also desired directly; and leave the prior graph unchanged when any target member cannot resolve.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity", "safe-repetition"],
  methods: ["example", "state-transition", "invariant"],
  derivedFrom: ["cli/install/source-switches-are-previewed-and-atomic"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const PACK = "toolkit";
const PACK_FQN = `@acme/packs/${PACK}`;
const REGISTRY_MEMBERS = ["stable", "evolving", "migrated", "added"] as const;
const execution: PlanExecution = interactiveOnlyPlanExecution({
  command: ["install"],
  arguments: [],
});

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

const writeSkill = (source: string, name: string): void => {
  const root = path.join(source, "skills", name);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "skill.json"),
    `${JSON.stringify({
      owner: "@acme",
      type: "skill",
      name,
      version: "1.0.0",
      description: `The ${name} skill.`,
    })}\n`,
  );
  fs.writeFileSync(
    path.join(root, "src", "SKILL.md"),
    `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n\n# ${name}\n`,
  );
};

const makeGitPackFixture = (registryUrl: string): Effect.Effect<GitFixture> =>
  Effect.promise(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-pack-switch-git-"));
    const source = path.join(root, "source");
    const packRoot = path.join(source, "packs", PACK);
    const repository = path.join(root, "toolkit.git");
    fs.mkdirSync(packRoot, { recursive: true });
    for (const name of ["migrated", "removed"]) writeSkill(source, name);
    fs.writeFileSync(
      path.join(packRoot, "pack.json"),
      `${JSON.stringify({
        owner: "@acme",
        type: "pack",
        name: PACK,
        version: "1.0.0",
        description: "The toolkit pack.",
        dependencies: {
          "@acme/skills/migrated": "^1.0.0",
          "@acme/skills/removed": "^1.0.0",
          "@acme/skills/retained": {
            source: { type: "registry", url: registryUrl },
            versionRange: "^1.0.0",
          },
          "@acme/skills/stable": {
            source: { type: "registry", url: registryUrl },
            versionRange: "^1.0.0",
          },
          "@acme/skills/evolving": {
            source: { type: "registry", url: registryUrl },
            versionRange: "^1.0.0",
          },
        },
      })}\n`,
    );
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
      url: `git://127.0.0.1:${String(port)}/toolkit.git`,
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

const sourceRequest = (source: string): InstallExtensionsRequest =>
  installRequest({ type: "pack", subject: { kind: "source", source } });

describe("Pack source switches", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "previews every member class and applies a Git-to-Registry switch atomically",
    () =>
      Effect.gen(function* () {
        const registry = makeLifecycleRegistry();
        cleanups.push(registry.cleanup);
        registry.writeSkill("stable", [{ version: "1.0.0", body: "Stable." }]);
        registry.writeSkill("evolving", [
          { version: "1.0.0", body: "Evolving one." },
          { version: "2.0.0", body: "Evolving two." },
        ]);
        registry.writeSkill("migrated", [{ version: "1.0.0", body: "Migrated." }]);
        registry.writeSkill("added", [{ version: "1.0.0", body: "Added." }]);
        registry.writeSkill("retained", [{ version: "1.0.0", body: "Retained." }]);
        registry.writePack(PACK, [
          {
            version: "2.0.0",
            dependencies: {
              "@acme/skills/stable": "^1.0.0",
              "@acme/skills/evolving": "^2.0.0",
              "@acme/skills/migrated": "^1.0.0",
              "@acme/skills/added": "^1.0.0",
            },
          },
        ]);
        const git = yield* makeGitPackFixture(registry.source.location);
        cleanups.push(git.cleanup);
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
            const initial = yield* resolveInstall(sourceRequest(git.url));
            expect(initial.units.every((unit) => unit.state === "committed")).toBe(true);

            const directMembers = yield* resolveInstall(
              installRequest({
                type: "skill",
                subject: { kind: "source", source: "@acme/skills/retained" },
              }),
            );
            if (
              !directMembers.units.every(
                (unit) => unit.state === "committed" || unit.state === "unchanged",
              )
            ) {
              throw new Error(
                `Direct member install did not commit: ${JSON.stringify(directMembers)}`,
              );
            }

            const request = sourceRequest(PACK_FQN);
            const preview = yield* previewInstall(request);
            const evidence = preview.units.flatMap((unit) =>
              unit.artifact?.sourceSwitch === undefined ? [] : [unit.artifact.sourceSwitch],
            )[0];
            expect(evidence?.packMembers).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ member: "@acme/skills/added", disposition: "added" }),
                expect.objectContaining({ member: "@acme/skills/removed", disposition: "removed" }),
                expect.objectContaining({
                  member: "@acme/skills/retained",
                  disposition: "retained",
                }),
                expect.objectContaining({
                  member: "@acme/skills/migrated",
                  disposition: "source-changed",
                  before: expect.objectContaining({ family: "git" }),
                  after: expect.objectContaining({
                    family: "registry",
                    resolution: "version 1.0.0",
                  }),
                }),
                expect.objectContaining({
                  member: "@acme/skills/evolving",
                  disposition: "version-changed",
                  before: expect.objectContaining({ resolution: "version 1.0.0" }),
                  after: expect.objectContaining({ resolution: "version 2.0.0" }),
                }),
                expect.objectContaining({
                  member: "@acme/skills/stable",
                  disposition: "unchanged",
                }),
              ]),
            );
            expect(evidence?.dependencies).toMatchObject({
              effect: "changed",
              added: ["@acme/skills/added"],
              removed: ["@acme/skills/removed"],
              changed: expect.arrayContaining(["@acme/skills/evolving", "@acme/skills/migrated"]),
            });
            const applied = yield* resolveInstall(request);
            expect(applied.units.every((unit) => unit.state === "committed")).toBe(true);
            const lockfile = workspace.readFile("axm-lock.yaml");
            expect(lockfile).toContain("type: registry");
            expect(lockfile).toContain("added");
            expect(lockfile).toContain("retained");
            expect(lockfile).not.toContain("removed");
            expect(REGISTRY_MEMBERS.every((member) => lockfile.includes(member))).toBe(true);
          }),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 15_000 },
  );

  it.effect("leaves the installed graph unchanged when a target member cannot resolve", () =>
    Effect.gen(function* () {
      const registry = makeLifecycleRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("stable", [{ version: "1.0.0", body: "Stable." }]);
      registry.writeSkill("evolving", [{ version: "1.0.0", body: "Evolving one." }]);
      registry.writeSkill("retained", [{ version: "1.0.0", body: "Retained." }]);
      registry.writePack(PACK, [
        {
          version: "2.0.0",
          dependencies: { "@acme/skills/inaccessible": "^1.0.0" },
        },
      ]);
      const git = yield* makeGitPackFixture(registry.source.location);
      cleanups.push(git.cleanup);
      const workspace = makeLifecycleFixture({
        sources: "live",
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
          yield* resolveInstall(sourceRequest(git.url));
          const before = workspace.snapshot();
          const failure = yield* InstallExtensions.prepare(sourceRequest(PACK_FQN)).pipe(
            Effect.flip,
          );

          expect(failure).toMatchObject({ detail: expect.stringContaining("inaccessible") });
          expect(workspace.snapshot()).toEqual(before);
        }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
