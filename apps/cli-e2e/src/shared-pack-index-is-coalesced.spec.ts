import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { startHttpRegistry } from "./e2e/http-registry-server.js";
import { createTempDir, runCli } from "./e2e/utils.js";

export const specification = defineSpecification({
  requirement: "cli/shared-pack-member-index-is-coalesced",
  title: "Configured packs share one member index read and materialization",
  statement:
    "When two configured Packs depend on the same Registry member and require resolution, AXM shall resolve both Pack indexes in one batch, read the shared member's metadata once during planning, retain both Packs' constraints, and acquire the selected member archive once for the workspace transition; a repeated install shall reuse their satisfying accepted choices without resolving them again.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "The real CLI process and controlled HTTP Registry hold one Pack metadata item while observing the other Pack in the same batch and counting shared member metadata and archive requests.",
  methods: ["example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const OWNER = "@test";
const env = { AXM_TOKEN: "e2e-test-token", AXM_NO_UPDATE_CHECK: "1" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const setupWorkspace = async (workspace: string, registryUrl: string) => {
  const setup = await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
    cwd: workspace,
    env,
  });
  expect(setup.exitCode, setup.stderr).toBe(0);
  const settingsPath = path.join(workspace, "axm.json");
  const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  if (!isRecord(parsed)) throw new Error("Expected workspace settings");
  parsed["defaultRegistry"] = "test";
  parsed["sources"] = [{ name: "test", type: "registry", location: registryUrl }];
  parsed["owner"] = OWNER;
  parsed["minimumReleaseAge"] = "0s";
  fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2));
  return { settingsPath, settings: parsed };
};

const authorPack = async (workspace: string, name: string) => {
  const created = await runCli(["packs", "new", name, "--owner", OWNER], {
    cwd: workspace,
    env,
  });
  expect(created.exitCode, created.stderr).toBe(0);
  const added = await runCli(["packs", "add", name, `${OWNER}/skills/shared`], {
    cwd: workspace,
    env,
  });
  expect(added.exitCode, added.stdout + added.stderr).toBe(0);
  const manifest: unknown = JSON.parse(
    fs.readFileSync(path.join(workspace, "packs", name, "pack.json"), "utf8"),
  );
  expect(manifest).toMatchObject({
    dependencies: { [`${OWNER}/skills/shared`]: expect.any(String) },
  });
};

describe("Shared configured Pack member", () => {
  it.each(["sync", "install", "update"])(
    "%s reads one member index and downloads one selected archive",
    async (command) => {
      const publisher = createTempDir();
      const consumer = createTempDir();
      const consumerHome = createTempDir();
      let holdFirstPack = false;
      let releaseFirstPack: () => void = () => undefined;
      const firstPackGate = new Promise<void>((resolve) => {
        releaseFirstPack = resolve;
      });
      let observeSecondPack: () => void = () => undefined;
      const secondPackRequested = new Promise<void>((resolve) => {
        observeSecondPack = resolve;
      });
      const registry = await startHttpRegistry({
        enforcePackDependencies: true,
        beforeIndexResponse: (name) => {
          if (!holdFirstPack) return;
          if (name === "packs/first-pack") return firstPackGate;
          if (name === "packs/second-pack") observeSecondPack();
          return undefined;
        },
      });
      try {
        await setupWorkspace(publisher.path, registry.url);
        const created = await runCli(["skills", "new", "shared", "--owner", OWNER], {
          cwd: publisher.path,
          env,
        });
        expect(created.exitCode, created.stderr).toBe(0);
        for (const name of ["first-pack", "second-pack"]) {
          await authorPack(publisher.path, name);
        }
        const published = await runCli(["publish", "--owner", OWNER, "--json"], {
          cwd: publisher.path,
          env,
        });
        expect(published.exitCode, published.stdout + published.stderr).toBe(0);
        const sharedPublication = registry.publishes.find(
          (entry) => entry.plural === "skills" && entry.name === "shared",
        );
        if (sharedPublication === undefined) throw new Error("Shared member was not published.");
        const [major, minor, patch] = sharedPublication.version.split(".").map(Number);
        if (major === undefined || minor === undefined || patch === undefined)
          throw new Error("Expected a three-part fixture version.");
        const yankedVersion = `${major}.${minor}.${patch + 1}`;
        registry.copyVersion(OWNER, "skills", "shared", sharedPublication.version, yankedVersion);
        registry.yank(OWNER, "skills", "shared", yankedVersion);

        const { settingsPath, settings } = await setupWorkspace(consumer.path, registry.url);
        settings["packs"] = {
          "first-pack": `${OWNER}/packs/first-pack`,
          "second-pack": `${OWNER}/packs/second-pack`,
        };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        const start = registry.requests.length;
        const metadataStart = registry.metadataRequests.length;
        holdFirstPack = true;
        const operation = runCli([command, "--json"], {
          cwd: consumer.path,
          env: { ...env, HOME: consumerHome.path, AXM_USER_HOME: consumerHome.path },
        });
        let deadline: ReturnType<typeof setTimeout> | undefined;
        let secondStartedWhileFirstHeld = false;
        try {
          secondStartedWhileFirstHeld = await Promise.race([
            secondPackRequested.then(() => true),
            operation.then(() => false),
            new Promise<false>((resolve) => {
              deadline = setTimeout(() => resolve(false), 10_000);
            }),
          ]);
        } finally {
          if (deadline !== undefined) clearTimeout(deadline);
          releaseFirstPack();
        }
        const result = await operation;
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        expect(secondStartedWhileFirstHeld, "Independent Pack index request was serialized").toBe(
          true,
        );
        expect(JSON.parse(result.stdout)).toMatchObject({
          ok: true,
          result: { outcome: "applied" },
        });
        const requests = registry.requests.slice(start);
        const batches = registry.metadataRequests.slice(metadataStart);
        const metadataRequests = batches.flat();
        const memberMetadata = metadataRequests.filter(
          (identity) => identity === `${OWNER}/skill/shared`,
        );
        expect(batches.map((batch) => batch.toSorted())).toContainEqual(
          [`${OWNER}/pack/first-pack`, `${OWNER}/pack/second-pack`].toSorted(),
        );
        const memberArchive = requests.filter(
          (request) =>
            request.method === "GET" && /\/skills\/shared\/[^/]+\/archive$/u.test(request.path),
        );
        expect(
          memberMetadata,
          `${result.stdout}\n${JSON.stringify(
            requests.map(({ method, path: requestPath, status }) => ({
              method,
              path: requestPath,
              status,
            })),
          )}`,
        ).toHaveLength(1);
        expect(memberArchive).toHaveLength(1);
        expect(memberArchive[0]?.path).toContain(
          `/skills/shared/${sharedPublication.version}/archive`,
        );

        if (command === "install") {
          const lockPath = path.join(consumer.path, "axm-lock.yaml");
          const acceptedLock = fs.readFileSync(lockPath, "utf8");
          const acceptedSettings = fs.readFileSync(settingsPath, "utf8");
          const acquiredRoot = path.join(consumer.path, "agent_extensions", "registry", OWNER);
          const sharedRoot = path.join(acquiredRoot, "skills", "shared");
          const acceptedManifest = fs.readFileSync(path.join(sharedRoot, "skill.json"), "utf8");
          registry.copyVersion(
            OWNER,
            "skills",
            "shared",
            sharedPublication.version,
            `${major}.${minor}.${patch + 2}`,
          );
          const beforeWarm = registry.requests.length;
          const warm = await runCli(["install", "--json"], {
            cwd: consumer.path,
            env: { ...env, HOME: consumerHome.path, AXM_USER_HOME: consumerHome.path },
          });
          expect(warm.exitCode, warm.stdout + warm.stderr).toBe(0);
          expect(registry.requests.slice(beforeWarm)).toEqual([]);
          expect(fs.readFileSync(lockPath, "utf8")).toBe(acceptedLock);
          expect(fs.readFileSync(settingsPath, "utf8")).toBe(acceptedSettings);

          fs.rmSync(sharedRoot, { recursive: true });
          fs.rmSync(path.join(acquiredRoot, "packs", "first-pack"), { recursive: true });
          const beforeRestoreMetadata = registry.metadataRequests.length;
          const restored = await runCli(["install", "--json"], {
            cwd: consumer.path,
            env: { ...env, HOME: consumerHome.path, AXM_USER_HOME: consumerHome.path },
          });
          expect(restored.exitCode, restored.stdout + restored.stderr).toBe(0);
          // Cached exact archives still require current Registry authorization.
          expect(registry.metadataRequests.slice(beforeRestoreMetadata).flat().toSorted()).toEqual(
            [`${OWNER}/pack/first-pack`, `${OWNER}/skill/shared`].toSorted(),
          );
          expect(registry.metadataPurposes.slice(beforeRestoreMetadata).flat()).toEqual([
            "restore-exact",
            "restore-exact",
          ]);
          expect(fs.readFileSync(lockPath, "utf8")).toBe(acceptedLock);
          expect(fs.readFileSync(path.join(sharedRoot, "skill.json"), "utf8")).toBe(
            acceptedManifest,
          );
          expect(fs.existsSync(path.join(acquiredRoot, "packs", "first-pack", "pack.json"))).toBe(
            true,
          );
        }
      } finally {
        releaseFirstPack();
        await registry.close();
        publisher.cleanup();
        consumer.cleanup();
        consumerHome.cleanup();
      }
    },
  );
});
