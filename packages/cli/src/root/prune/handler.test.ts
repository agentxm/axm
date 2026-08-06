import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
} from "../../test-helpers.js";
import { handleRootPrune } from "./handler.js";

const createSkill = (root: string, name: string, managed: boolean) => {
  const dir = path.join(root, ".claude", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `${managed ? "<!-- AXM managed file — do not edit directly -->\n" : ""}# ${name}\n`,
  );
  return dir;
};

const staleLocalLock = {
  type: "local",
  path: "fixtures/extension",
  installedAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const stalePackLock = {
  type: "registry",
  owner: "@acme",
  name: "stale-pack",
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "default",
  publisherBindingId: "hbnd_test",
  installedAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  resolvedSkills: {},
  resolvedCommands: {},
  resolvedMcpServers: {},
  resolvedSubagents: {},
};

const canonicalTypeDirectories = [
  "skills",
  "commands",
  "mcps",
  "subagents",
  "files",
  "rules",
  "hooks",
  "knowledge",
  "packs",
] as const;

const createCanonicalExtension = (root: string, typeDirectory: string, name: string) => {
  const packageRoot = path.join(root, ".axm", "extensions", "@acme", typeDirectory, name);
  const contentRoot = typeDirectory === "packs" ? packageRoot : path.join(packageRoot, "src");
  fs.mkdirSync(contentRoot, { recursive: true });
  return packageRoot;
};

describe("root.prune.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-prune-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (machine = false) => makeWorkspaceHandlerTestContext({ machine });

  it.effect("removes an unmanaged artifact only when an AXM marker proves ownership", () => {
    const { provide } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const managed = createSkill(tempDir, "stale-managed", true);
    const unknown = createSkill(tempDir, "unknown", false);

    return provide(
      Effect.gen(function* () {
        yield* handleRootPrune({ patterns: [] }, { yes: true });
        expect(fs.existsSync(managed)).toBe(false);
        expect(fs.existsSync(unknown)).toBe(true);
      }),
    );
  });

  it.effect("removes canonical AXM packages across every extension type", () => {
    const { provide } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const packages = canonicalTypeDirectories.map((typeDirectory) =>
      createCanonicalExtension(tempDir, typeDirectory, `stale-${typeDirectory}`),
    );

    return provide(
      Effect.gen(function* () {
        yield* handleRootPrune({ patterns: [] }, { yes: true });
        expect(packages.filter((packageRoot) => fs.existsSync(packageRoot))).toEqual([]);
      }),
    );
  });

  it.effect("prunes one external package without deleting its siblings", () => {
    const { provide } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const externalRoot = path.join(tempDir, ".axm", "extensions", "external", "skills");
    const stale = path.join(externalRoot, "stale-external");
    const sibling = path.join(externalRoot, "configured-sibling");
    fs.mkdirSync(stale, { recursive: true });
    fs.mkdirSync(sibling, { recursive: true });

    return provide(
      Effect.gen(function* () {
        yield* handleRootPrune({ patterns: ["stale-*"] }, { yes: true });
        expect(fs.existsSync(stale)).toBe(false);
        expect(fs.existsSync(sibling)).toBe(true);
      }),
    );
  });

  it.effect("previews exact ownership evidence without deleting", () => {
    const { provide, rendererState } = makeLayers(true);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const managed = createSkill(tempDir, "stale-managed", true);

    return provide(
      Effect.gen(function* () {
        yield* handleRootPrune({ patterns: [] }, { yes: false });
        expect(fs.existsSync(managed)).toBe(true);
        const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
          planName: "Prune AXM-owned state",
          totalSteps: 1,
        });
        expect(planResultSteps(result)[0]).toMatchObject({
          label: expect.stringContaining("managed-marker:.claude/skills/stale-managed/SKILL.md"),
          status: "ready",
        });
      }),
    );
  });

  it.effect("reports an unowned artifact as unchanged and never deletes it", () => {
    const { provide, rendererState } = makeLayers(true);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const unknown = createSkill(tempDir, "unknown", false);

    return provide(
      Effect.gen(function* () {
        yield* handleRootPrune({ patterns: [] }, { yes: true });
        expect(fs.existsSync(unknown)).toBe(true);
        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            outcome: "no-op",
            planName: "Prune AXM-owned state",
            warningCount: 1,
            steps: [
              expect.objectContaining({
                status: "unchanged",
                artifact: expect.objectContaining({
                  change: "unchanged",
                  path: ".claude/skills/unknown",
                }),
              }),
            ],
          },
        });
      }),
    );
  });

  it.effect("removes stale receipt and trust state across every extension type", () => {
    const { provide } = makeLayers();
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      lockfileSkills: { "stale-skill": staleLocalLock },
      lockfileCommands: { "stale-command": staleLocalLock },
      lockfileMcpServers: {
        "stale-mcp": {
          type: "inline",
          command: "node",
          installedAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
      lockfileSubagents: { "stale-subagent": staleLocalLock },
      lockfilePacks: { "stale-pack": stalePackLock },
      lockfileFiles: { "stale-files": staleLocalLock },
      lockfileRules: { "stale-rule": staleLocalLock },
      lockfileHooks: { "stale-hook": staleLocalLock },
      lockfileKnowledge: { "stale-knowledge": staleLocalLock },
      writeTrustFromLockfile: true,
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRootPrune({ patterns: [] }, { yes: true });
        const lock = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
        const trust = JSON.parse(fs.readFileSync(path.join(axmDir, "trust.json"), "utf8"));
        for (const key of [
          "skills",
          "commands",
          "mcpServers",
          "subagents",
          "packs",
          "files",
          "rules",
          "hooks",
          "knowledge",
        ]) {
          expect(lock[key] ?? {}).toEqual({});
        }
        expect(trust.records).toEqual({});
      }),
    );
  });

  it.effect("removes only x-axm-owned entries from native MCP configuration", () => {
    const { provide } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const mcpPath = path.join(tempDir, ".mcp.json");
    fs.writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          stale: {
            type: "stdio",
            command: "node",
            args: ["server.js"],
            "x-axm": { managed: true, source: "inline" },
          },
          manual: { type: "stdio", command: "manual-server" },
        },
      }),
    );

    return provide(
      Effect.gen(function* () {
        yield* handleRootPrune({ patterns: [] }, { yes: true });
        const config: unknown = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
        expect(config).toEqual({
          mcpServers: {
            manual: { type: "stdio", command: "manual-server" },
          },
        });
      }),
    );
  });

  it.effect("preserves unmatched x-axm-owned MCP entries when pruning by pattern", () => {
    const { provide } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const mcpPath = path.join(tempDir, ".mcp.json");
    fs.writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          "old-selected": {
            type: "stdio",
            command: "node",
            "x-axm": { managed: true, source: "inline" },
          },
          retained: {
            type: "stdio",
            command: "node",
            "x-axm": { managed: true, source: "inline" },
          },
        },
      }),
    );

    return provide(
      Effect.gen(function* () {
        yield* handleRootPrune({ patterns: ["old-*"] }, { yes: true });
        const config: unknown = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
        expect(config).toEqual({
          mcpServers: {
            retained: {
              type: "stdio",
              command: "node",
              "x-axm": { managed: true, source: "inline" },
            },
          },
        });
      }),
    );
  });

  it.effect("applies patterns to artifacts and stale state", () => {
    const { provide } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const selected = createSkill(tempDir, "old-selected", true);
    const retained = createSkill(tempDir, "other", true);

    return provide(
      Effect.gen(function* () {
        yield* handleRootPrune({ patterns: ["old-*"] }, { yes: true });
        expect(fs.existsSync(selected)).toBe(false);
        expect(fs.existsSync(retained)).toBe(true);
      }),
    );
  });

  it.effect("is idempotent after ownership-proven state is removed", () => {
    const { provide, rendererState } = makeLayers(true);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    createSkill(tempDir, "stale-managed", true);

    return provide(
      Effect.gen(function* () {
        yield* handleRootPrune({ patterns: [] }, { yes: true });
        rendererState.results.length = 0;
        yield* handleRootPrune({ patterns: [] }, { yes: true });
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Prune AXM-owned state",
          message: "No stale or unmanaged state found.",
        });
      }),
    );
  });
});
