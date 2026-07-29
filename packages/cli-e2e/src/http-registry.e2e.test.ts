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
  command: { newArgs: [] },
  subagent: { newArgs: ["--agent", "claude-code"] },
  knowledge: { newArgs: [] },
  files: { newArgs: [] },
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
      expect(record?.byteLength).toBeGreaterThan(0);

      // The upload really went over the remote transport, at the versioned
      // path — not through a file:// shortcut.
      expect(registry.requests).toContainEqual({
        method: "PUT",
        path: `/v1/extensions/${OWNER}/${row.plural}/${name}/${record?.version ?? ""}`,
        status: 201,
      });
    } finally {
      await registry.close();
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
