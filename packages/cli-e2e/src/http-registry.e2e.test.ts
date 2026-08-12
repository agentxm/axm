import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXTENSION_TYPE_MATRIX,
  type MatrixExtensionType,
} from "./__generated__/extension-type-matrix.js";
import { startHttpRegistry, type HttpRegistry } from "./e2e/http-registry-server.js";
import { createTempDir, runCli } from "./e2e/utils.js";

/**
 * Publish and install over the HTTP registry transport.
 *
 * Every other install suite drives a `file://` registry, which skips the remote
 * client entirely: no bearer token, no `PUT` upload, no JSON index decode. A
 * regression in that path would only show up against a deployed registry. These
 * rows run the same flows against a local HTTP server instead.
 */

const OWNER = "@test";
const TOKEN = "e2e-test-token";

/**
 * `AXM_TOKEN` is only honored for the origin AXM treats as its default
 * registry, so pointing `AXM_REGISTRY_URL` at the harness is what keeps publish
 * non-interactive. Without it the CLI falls through to the browser-based
 * publish authorization flow, which an e2e run cannot complete. This mirrors
 * how a self-hosted registry is configured.
 */
const registryEnv = (registryUrl: string): Record<string, string> => ({
  AXM_REGISTRY_URL: registryUrl,
  AXM_TOKEN: TOKEN,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface ScaffoldPublish {
  /** Extra flags `axm <plural> new` needs for this type. */
  readonly newArgs: ReadonlyArray<string>;
}

interface BlockedPublish {
  /** Why no HTTP publish row exists yet, in terms a reader can act on. */
  readonly blocked: string;
}

const isBlocked = (entry: ScaffoldPublish | BlockedPublish): entry is BlockedPublish =>
  "blocked" in entry;

/**
 * How each extension type publishes over HTTP, or why it cannot yet. Keyed by
 * the generated matrix union, so a new catalog row fails compile here until its
 * coverage is decided rather than silently missing from the suite.
 */
const HTTP_PUBLISH = {
  skill: { newArgs: ["--agent", "claude-code"] },
  subagent: { newArgs: ["--agent", "claude-code"] },
  knowledge: { newArgs: [] },
  hook: { newArgs: [] },
  rule: { newArgs: [] },
  "mcp-server": {
    blocked:
      "`axm mcps new` scaffolds a manifest without a server definition, so publishing needs a hand-written manifest the file:// matrix already covers.",
  },
  pack: {
    blocked:
      "A pack publish requires its dependencies published first; the file:// install matrix covers pack round trips.",
  },
} as const satisfies Record<MatrixExtensionType, ScaffoldPublish | BlockedPublish>;

const publishRows = EXTENSION_TYPE_MATRIX.filter((row) => !isBlocked(HTTP_PUBLISH[row.type]));
const blockedRows = EXTENSION_TYPE_MATRIX.flatMap((row) => {
  const entry = HTTP_PUBLISH[row.type];
  return isBlocked(entry) ? [{ row, reason: entry.blocked }] : [];
});

const newArgsFor = (type: MatrixExtensionType): ReadonlyArray<string> => {
  const entry = HTTP_PUBLISH[type];
  if (isBlocked(entry)) throw new Error(`${type} has no HTTP publish flow`);
  return entry.newArgs;
};

const settingsPathIn = (workspacePath: string) => path.join(workspacePath, ".axm", "settings.json");

const configureRegistry = (workspacePath: string, location: string) => {
  const settingsPath = settingsPathIn(workspacePath);
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.sources = [{ name: "local", type: "registry", location }];
  settings.owner = OWNER;
  settings.minimumReleaseAge = "0s";
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

const configureMinimumReleaseAge = (workspacePath: string, value: string) => {
  const settingsPath = settingsPathIn(workspacePath);
  const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  if (!isRecord(settings)) throw new Error("Expected settings object");
  settings["minimumReleaseAge"] = value;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

const structuredPlanResult = (stdout: string): Record<string, unknown> => {
  const output: unknown = JSON.parse(stdout);
  if (!isRecord(output) || !isRecord(output["result"])) {
    throw new Error("Expected structured plan result");
  }
  return output["result"];
};

const initWorkspace = async (workspacePath: string, location: string) => {
  const setup = await runCli(["setup", "--yes", "--agent", "claude-code"], {
    cwd: workspacePath,
    env: registryEnv(location),
  });
  expect(setup.exitCode, setup.stderr).toBe(0);
  configureRegistry(workspacePath, location);
};

const snapshotDir = (rootDir: string): Readonly<Record<string, string>> => {
  const files: Record<string, string> = {};
  const walk = (currentDir: string) => {
    for (const entry of fs
      .readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      files[path.relative(rootDir, absolutePath).split(path.sep).join("/")] = fs.readFileSync(
        absolutePath,
        "utf-8",
      );
    }
  };
  walk(rootDir);
  return files;
};

/** Scaffold one extension in a throwaway workspace and publish it to `location`. */
const scaffoldAndPublish = async (
  location: string,
  plural: string,
  type: MatrixExtensionType,
  name: string,
) => {
  const workspace = createTempDir();
  try {
    await initWorkspace(workspace.path, location);

    const created = await runCli(
      [plural, "new", name, "--owner", OWNER, ...newArgsFor(type), "--yes"],
      { cwd: workspace.path, env: registryEnv(location) },
    );
    expect(created.exitCode, created.stderr).toBe(0);

    const published = await runCli([plural, "publish", `${OWNER}/${plural}/${name}`, "--yes"], {
      cwd: workspace.path,
      env: registryEnv(location),
    });
    expect(published.exitCode, published.stderr).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

describe("HTTP registry transport", () => {
  it("answers for every extension type with a publish row or a stated reason", () => {
    expect(publishRows.length + blockedRows.length).toBe(EXTENSION_TYPE_MATRIX.length);
  });

  for (const { row, reason } of blockedRows) {
    it.skip(`publishes a ${row.sentenceLabel} over HTTP — ${reason}`, () => {
      // Skipped until the named obligation clears; the title carries the reason.
    });
  }

  it.each(publishRows)("publishes a $label over the HTTP registry transport", async (row) => {
    const registry: HttpRegistry = await startHttpRegistry();
    const name = `http-${row.type.replace("mcp-server", "mcp")}`;

    try {
      await scaffoldAndPublish(registry.url, row.plural, row.type, name);

      const [record] = registry.publishes;
      expect(registry.publishes).toHaveLength(1);
      expect(record?.owner).toBe(OWNER);
      expect(record?.plural).toBe(row.plural);
      expect(record?.name).toBe(name);
      expect(record?.integrity.startsWith("sha512-")).toBe(true);
      expect(record?.contentType).toBe("application/zip");
      expect(record?.authorization).toBe(`Bearer ${TOKEN}`);
      expect(record?.ifMatch).toMatch(/^"e2e-[a-f0-9]{64}"$/);
      expect(record?.byteLength).toBeGreaterThan(0);

      expect(registry.requests).toContainEqual({
        method: "GET",
        path: `/v1/owners/${OWNER}`,
        status: 200,
      });

      // The upload really went over the remote transport, at the versioned
      // path — not through a file:// shortcut.
      expect(registry.requests).toContainEqual({
        method: "POST",
        path: "/v1/publish-previews",
        status: 200,
      });
      expect(registry.requests).toContainEqual({
        method: "PUT",
        path: `/v1/extensions/${OWNER}/${row.plural}/${name}/${record?.version ?? ""}`,
        status: 201,
      });
    } finally {
      await registry.close();
    }
  });

  it("reports root and targeted holdbacks and an explicit targeted bypass", async () => {
    const registry = await startHttpRegistry();
    const publisher = createTempDir();
    const consumer = createTempDir();
    const env = registryEnv(registry.url);

    try {
      await initWorkspace(publisher.path, registry.url);
      const created = await runCli(
        ["skills", "new", "review", "--owner", OWNER, "--agent", "claude-code", "--yes"],
        { cwd: publisher.path, env },
      );
      expect(created.exitCode, created.stderr).toBe(0);
      const firstPublish = await runCli(["skills", "publish", `${OWNER}/skills/review`, "--yes"], {
        cwd: publisher.path,
        env,
      });
      expect(firstPublish.exitCode, firstPublish.stderr).toBe(0);
      const firstPublished = registry.publishes[0];
      if (firstPublished === undefined) throw new Error("Expected first published skill version");

      await initWorkspace(consumer.path, registry.url);
      const installed = await runCli(["install", `${OWNER}/skills/review`, "--yes"], {
        cwd: consumer.path,
        env,
      });
      expect(installed.exitCode, installed.stderr).toBe(0);
      configureMinimumReleaseAge(consumer.path, "365d");

      const bumped = await runCli(["version", `${OWNER}/skills/review`, "minor"], {
        cwd: publisher.path,
        env,
      });
      expect(bumped.exitCode, bumped.stderr).toBe(0);
      const secondPublish = await runCli(["skills", "publish", `${OWNER}/skills/review`, "--yes"], {
        cwd: publisher.path,
        env,
      });
      expect(secondPublish.exitCode, secondPublish.stderr).toBe(0);
      const secondPublished = registry.publishes[1];
      if (secondPublished === undefined) throw new Error("Expected second published skill version");

      const root = await runCli(["update", "--yes", "--json"], { cwd: consumer.path, env });
      expect(root.exitCode, `${root.stderr}\n${root.stdout}`).toBe(0);
      expect(structuredPlanResult(root.stdout)).toMatchObject({
        outcome: "no-op",
        holdbackCount: 1,
        holdbacks: [
          { target: `${OWNER}/skills/review`, candidateVersion: secondPublished.version },
        ],
      });

      const targeted = await runCli(["update", `${OWNER}/skills/review`, "--yes", "--json"], {
        cwd: consumer.path,
        env,
      });
      expect(targeted.exitCode, `${targeted.stderr}\n${targeted.stdout}`).toBe(0);
      expect(structuredPlanResult(targeted.stdout)).toMatchObject({
        outcome: "no-op",
        holdbacks: [
          {
            target: `${OWNER}/skills/review`,
            currentVersion: firstPublished.version,
            selectedVersion: firstPublished.version,
            candidateVersion: secondPublished.version,
          },
        ],
      });

      const bypass = await runCli(
        ["update", `${OWNER}/skills/review`, "--ignore-release-age", "--yes", "--json"],
        { cwd: consumer.path, env },
      );
      expect(bypass.exitCode, `${bypass.stderr}\n${bypass.stdout}`).toBe(0);
      expect(structuredPlanResult(bypass.stdout)).toMatchObject({
        outcome: "applied",
        releaseAgeBypassCount: 1,
        releaseAgeBypasses: [
          { target: `${OWNER}/skills/review`, candidateVersion: secondPublished.version },
        ],
      });
    } finally {
      publisher.cleanup();
      consumer.cleanup();
      await registry.close();
    }
  });

  it("bulk visibility establishes new extensions and preserves existing visibility", async () => {
    const registry = await startHttpRegistry();
    const workspace = createTempDir();

    try {
      await initWorkspace(workspace.path, registry.url);
      const createReview = await runCli(
        ["skills", "new", "review", "--owner", OWNER, "--agent", "claude-code", "--yes"],
        { cwd: workspace.path, env: registryEnv(registry.url) },
      );
      expect(createReview.exitCode, createReview.stderr).toBe(0);
      const firstPublish = await runCli(["skills", "publish", `${OWNER}/skills/review`, "--yes"], {
        cwd: workspace.path,
        env: registryEnv(registry.url),
      });
      expect(firstPublish.exitCode, firstPublish.stderr).toBe(0);

      const createDeploy = await runCli(
        ["skills", "new", "deploy", "--owner", OWNER, "--agent", "claude-code", "--yes"],
        { cwd: workspace.path, env: registryEnv(registry.url) },
      );
      expect(createDeploy.exitCode, createDeploy.stderr).toBe(0);
      const bumpReview = await runCli(["version", `${OWNER}/skills/review`, "minor"], {
        cwd: workspace.path,
        env: registryEnv(registry.url),
      });
      expect(bumpReview.exitCode, bumpReview.stderr).toBe(0);

      const published = await runCli(
        ["publish", "--owner", OWNER, "--visibility", "private", "--yes", "--json"],
        { cwd: workspace.path, env: registryEnv(registry.url) },
      );
      expect(published.exitCode, `${published.stderr}\n${published.stdout}`).toBe(0);
      const output: unknown = JSON.parse(published.stdout);
      if (!isRecord(output) || !isRecord(output["result"])) {
        throw new Error("Expected structured publish output");
      }
      const results = output["result"]["results"];
      if (!Array.isArray(results)) throw new Error("Expected publish result items");
      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "review",
            status: "success",
            visibility: { value: "public", disposition: "preserve", source: "existing" },
          }),
          expect.objectContaining({
            name: "deploy",
            status: "success",
            visibility: { value: "private", disposition: "establish", source: "explicit" },
          }),
        ]),
      );
      expect(registry.publishes).toHaveLength(3);
      expect(registry.publishes.every((record) => record.ifMatch !== undefined)).toBe(true);
      expect(
        registry.publishes.find((record) => record.name === "review" && record.version === "0.1.0"),
      ).toHaveProperty("requestedVisibility", undefined);
      expect(registry.publishes.find((record) => record.name === "deploy")).toHaveProperty(
        "requestedVisibility",
        "private",
      );
    } finally {
      await registry.close();
      workspace.cleanup();
    }
  });

  it.each(["unavailable", "incomplete", "missing"] as const)(
    "fails closed without uploading when publish preview is %s",
    async (publishPreviewMode) => {
      const registry = await startHttpRegistry({ publishPreviewMode });
      const workspace = createTempDir();

      try {
        await initWorkspace(workspace.path, registry.url);
        const created = await runCli(
          [
            "skills",
            "new",
            `blocked-${publishPreviewMode}`,
            "--owner",
            OWNER,
            "--agent",
            "claude-code",
            "--yes",
          ],
          { cwd: workspace.path, env: registryEnv(registry.url) },
        );
        expect(created.exitCode, created.stderr).toBe(0);

        const published = await runCli(
          ["skills", "publish", `${OWNER}/skills/blocked-${publishPreviewMode}`, "--yes", "--json"],
          { cwd: workspace.path, env: registryEnv(registry.url) },
        );
        expect(published.exitCode).not.toBe(0);
        expect(registry.publishes).toHaveLength(0);
        const output: unknown = JSON.parse(published.stdout);
        if (!isRecord(output) || !isRecord(output["result"])) {
          throw new Error("Expected structured failed publish output");
        }
        const results = output["result"]["results"];
        if (!Array.isArray(results) || !isRecord(results[0])) {
          throw new Error("Expected one failed publish result item");
        }
        expect(results[0]["status"]).toBe("failed");
        expect(results[0]).not.toHaveProperty("visibility");
      } finally {
        await registry.close();
        workspace.cleanup();
      }
    },
  );

  it("root publish uploads selected pack dependencies before the pack", async () => {
    const registry = await startHttpRegistry({
      enforcePackDependencies: true,
      publishDelayMsByPlural: { skills: 50 },
    });
    const workspace = createTempDir();

    try {
      await initWorkspace(workspace.path, registry.url);
      const createdSkill = await runCli(
        ["skills", "new", "pack-member", "--owner", OWNER, "--agent", "claude-code", "--yes"],
        { cwd: workspace.path, env: registryEnv(registry.url) },
      );
      expect(createdSkill.exitCode, createdSkill.stderr).toBe(0);
      const createdPack = await runCli(
        ["packs", "new", "ordered-pack", "--owner", OWNER, "--yes"],
        {
          cwd: workspace.path,
          env: registryEnv(registry.url),
        },
      );
      expect(createdPack.exitCode, createdPack.stderr).toBe(0);
      const added = await runCli(
        ["packs", "add", "ordered-pack", `${OWNER}/skills/pack-member`, "--yes"],
        { cwd: workspace.path, env: registryEnv(registry.url) },
      );
      expect(added.exitCode, added.stderr).toBe(0);

      const published = await runCli(["publish", "--owner", OWNER, "--yes", "--json"], {
        cwd: workspace.path,
        env: registryEnv(registry.url),
      });

      expect(published.exitCode, `${published.stderr}\n${published.stdout}`).toBe(0);
      expect(registry.publishes.map((entry) => `${entry.plural}/${entry.name}`)).toEqual([
        "skills/pack-member",
        "packs/ordered-pack",
      ]);
      expect(JSON.parse(published.stdout).result.results).toMatchObject([
        { type: "skill", name: "pack-member", status: "success" },
        { type: "pack", name: "ordered-pack", status: "success" },
      ]);
    } finally {
      await registry.close();
      workspace.cleanup();
    }
  });

  it("materializes an HTTP install exactly like the same package installed from file://", async () => {
    const registry = await startHttpRegistry();
    const fileRegistry = createTempDir("axm-registry-");
    const httpWorkspace = createTempDir();
    const fileWorkspace = createTempDir();
    const name = "transport-parity";
    const fqn = `${OWNER}/skills/${name}`;

    try {
      await scaffoldAndPublish(registry.url, "skills", "skill", name);
      await scaffoldAndPublish(`file://${fileRegistry.path}`, "skills", "skill", name);

      await initWorkspace(httpWorkspace.path, registry.url);
      await initWorkspace(fileWorkspace.path, `file://${fileRegistry.path}`);

      const httpInstall = await runCli(["install", fqn, "--yes"], {
        cwd: httpWorkspace.path,
        env: registryEnv(registry.url),
      });
      const fileInstall = await runCli(["install", fqn, "--yes"], {
        cwd: fileWorkspace.path,
        env: registryEnv(`file://${fileRegistry.path}`),
      });

      expect(httpInstall.exitCode, httpInstall.stderr).toBe(0);
      expect(fileInstall.exitCode).toBe(httpInstall.exitCode);

      const extensionDir = (workspacePath: string) =>
        path.join(workspacePath, ".axm", "extensions", OWNER, "skills", name);

      expect(snapshotDir(extensionDir(httpWorkspace.path))).toEqual(
        snapshotDir(extensionDir(fileWorkspace.path)),
      );
    } finally {
      await registry.close();
      fileRegistry.cleanup();
      httpWorkspace.cleanup();
      fileWorkspace.cleanup();
    }
  });
});
