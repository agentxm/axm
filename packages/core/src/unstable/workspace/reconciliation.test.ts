// Raw node:fs/node:os/node:path in test setup is the repo-wide convention for
// temp-dir fixtures; the old #51 migration marker referenced a tracker entry
// that no longer exists.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import type { Settings } from "../settings/index.js";
import { extensionName, handle } from "../test-helpers.js";
import { skillReconciliationAdapter } from "../skills/reconciliation-adapter.js";
import { hookReconciliationAdapter } from "../hooks/reconciliation-adapter.js";
import { knowledgeReconciliationAdapter } from "../knowledge/reconciliation-adapter.js";
import { mcpServerReconciliationAdapter } from "../mcps/reconciliation-adapter.js";
import { packReconciliationAdapter } from "../packs/reconciliation-adapter.js";
import { ruleReconciliationAdapter } from "../rules/reconciliation-adapter.js";
import { subagentReconciliationAdapter } from "../subagents/reconciliation-adapter.js";
import {
  buildReconciliationSnapshot,
  dedupeDeclarations,
  ReconciliationAdapters,
  runReconcileMaterializeOperation,
} from "./reconciliation.js";

const reconciliationAdaptersLayer = Layer.succeed(ReconciliationAdapters, [
  skillReconciliationAdapter,
  subagentReconciliationAdapter,
  mcpServerReconciliationAdapter,
  packReconciliationAdapter,
  ruleReconciliationAdapter,
  hookReconciliationAdapter,
  knowledgeReconciliationAdapter,
]);
const testLayer = Layer.mergeAll(NodeServices.layer, reconciliationAdaptersLayer);

describe("reconciliation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-reconcile-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withContext = <A, E>(
    effect: Effect.Effect<A, E, NodeServices.NodeServices | ReconciliationAdapters>,
  ) => effect.pipe(Effect.provide(testLayer));

  it("dedupes declarations by deterministic key and warns on conflicts", () => {
    const result = dedupeDeclarations([
      {
        type: "skills",
        owner: handle("@acme"),
        name: extensionName("tool"),
        source: "@acme/skills/tool@^1",
        declarationSourceOrConstraint: "^1",
        order: 0,
        origin: "settings",
      },
      {
        type: "skills",
        owner: handle("@acme"),
        name: extensionName("tool"),
        source: "@acme/skills/tool@~2",
        declarationSourceOrConstraint: "~2",
        order: 1,
        origin: "pack",
      },
      {
        type: "skills",
        owner: handle("@acme"),
        name: extensionName("tool"),
        source: "@acme/skills/tool@^1",
        declarationSourceOrConstraint: "^1",
        order: 2,
        origin: "pack",
      },
    ]);

    expect(result.declarations).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("LOCKFILE_RECONCILE_CONFLICT");
  });

  it("orders declarations deterministically by type then name", () => {
    const result = dedupeDeclarations([
      {
        type: "hooks",
        owner: handle("@acme"),
        name: extensionName("zeta"),
        source: "@acme/hooks/zeta@^1",
        declarationSourceOrConstraint: "^1",
        order: 0,
        origin: "settings",
      },
      {
        type: "skills",
        owner: handle("@acme"),
        name: extensionName("beta"),
        source: "@acme/skills/beta@^1",
        declarationSourceOrConstraint: "^1",
        order: 5,
        origin: "settings",
      },
      {
        type: "skills",
        owner: handle("@acme"),
        name: extensionName("alpha"),
        source: "@acme/skills/alpha@^1",
        declarationSourceOrConstraint: "^1",
        order: 9,
        origin: "settings",
      },
    ]);

    expect(result.declarations.map((d) => `${d.type}:${d.name}`)).toEqual([
      "skills:alpha",
      "skills:beta",
      "hooks:zeta",
    ]);
  });

  it.effect("does not reconstruct registry identity from a disk manifest", () =>
    withContext(
      Effect.gen(function* () {
        const canonical = path.join(tempDir, ".axm", "extensions", "@acme", "skills", "tool");
        fs.mkdirSync(canonical, { recursive: true });
        fs.writeFileSync(
          path.join(canonical, "skill.json"),
          JSON.stringify({ owner: "@acme", type: "skill", name: "tool", version: "1.2.3" }),
        );

        const settings: Settings = {
          skills: {
            tool: { source: "@acme/skills/tool@^1", enabled: true },
          },
        };

        const snapshot = yield* buildReconciliationSnapshot({
          baseDir: tempDir,
          now: DateTime.makeUnsafe("2026-02-25T10:00:00.000Z"),
          configuredOwner: Option.some(handle("@community")),
          agents: ["claude-code"],
          settings,
        });

        expect(snapshot.lockfile.skills).toEqual({});
        expect(snapshot.unresolved).toEqual([
          expect.objectContaining({ reason: "missing-registry-metadata" }),
        ]);
      }),
    ),
  );

  it.effect("requires registry metadata to reconstruct workspace pack dependencies", () =>
    withContext(
      Effect.gen(function* () {
        const skillDir = path.join(tempDir, ".axm", "extensions", "@acme", "skills", "tool");
        const packDir = path.join(tempDir, ".axm", "extensions", "@acme", "packs", "toolkit");
        fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
        fs.mkdirSync(packDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, "skill.json"),
          JSON.stringify({ owner: "@acme", type: "skill", name: "tool", version: "1.2.3" }),
        );
        fs.writeFileSync(path.join(skillDir, "src", "SKILL.md"), "# Tool\n");
        fs.writeFileSync(
          path.join(packDir, "pack.json"),
          JSON.stringify({
            owner: "@acme",
            type: "pack",
            name: "toolkit",
            version: "2.0.0",
            dependencies: { "@acme/skills/tool": "^1.0.0" },
          }),
        );

        const settings: Settings = {
          skills: {
            tool: { source: "workspace:@acme/skills/tool", enabled: true },
          },
          packs: { toolkit: { source: "workspace:@acme/packs/toolkit", enabled: true } },
        };
        const snapshot = yield* buildReconciliationSnapshot({
          baseDir: tempDir,
          scope: "project",
          now: DateTime.makeUnsafe("2026-07-10T10:00:00.000Z"),
          configuredOwner: Option.some(handle("@acme")),
          agents: ["claude-code"],
          settings,
        });

        expect(snapshot.unresolved).toEqual([
          expect.objectContaining({ reason: "missing-registry-metadata" }),
        ]);
        expect(snapshot.lockfile.packs).toEqual({});
      }),
    ),
  );

  it.effect("reconstructs an empty workspace pack without registry metadata", () =>
    withContext(
      Effect.gen(function* () {
        const packDir = path.join(tempDir, ".axm", "extensions", "@acme", "packs", "toolkit");
        fs.mkdirSync(packDir, { recursive: true });
        fs.writeFileSync(
          path.join(packDir, "pack.json"),
          JSON.stringify({
            owner: "@acme",
            type: "pack",
            name: "toolkit",
            version: "2.0.0",
            dependencies: {},
          }),
        );

        const snapshot = yield* buildReconciliationSnapshot({
          baseDir: tempDir,
          scope: "project",
          now: DateTime.makeUnsafe("2026-07-10T10:00:00.000Z"),
          configuredOwner: Option.some(handle("@acme")),
          agents: ["claude-code"],
          settings: {
            packs: { toolkit: { source: "workspace:@acme/packs/toolkit", enabled: true } },
          },
        });

        expect(snapshot.unresolved).toEqual([]);
        expect(snapshot.lockfile.packs?.["toolkit"]).toEqual(
          expect.objectContaining({
            type: "workspace",
            owner: "@acme",
            name: "toolkit",
            version: "2.0.0",
            resolvedSkills: {},
            resolvedMcpServers: {},
            resolvedSubagents: {},
          }),
        );
      }),
    ),
  );

  it.effect("backs up invalid lockfile before materialization", () =>
    withContext(
      Effect.gen(function* () {
        const axmDir = path.join(tempDir, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "invalid: [");

        const settings: Settings = { skills: {} };

        const result = yield* runReconcileMaterializeOperation(
          {
            baseDir: tempDir,
            now: DateTime.makeUnsafe("2026-02-25T10:00:00.000Z"),
            configuredOwner: Option.some(handle("@community")),
            agents: ["claude-code"],
            settings,
          },
          axmDir,
          "invalid",
        );

        expect(result.result).toBe("success");
        expect(result.message).toMatch(/backed up invalid lockfile to .+axm-lock\.yaml/);

        const files = fs.readdirSync(axmDir);
        expect(files.every((file) => !file.startsWith("axm-lock.yaml.bak."))).toBe(true);

        const parsed = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
        expect(parsed.skills).toEqual({});
      }),
    ),
  );

  it.effect("reconstructs a workspace-sourced knowledge bundle", () =>
    withContext(
      Effect.gen(function* () {
        const knowledgeDir = path.join(tempDir, ".axm", "extensions", "@acme", "knowledge", "okf");
        fs.mkdirSync(path.join(knowledgeDir, "src"), { recursive: true });
        fs.writeFileSync(
          path.join(knowledgeDir, "knowledge.json"),
          JSON.stringify({
            owner: "@acme",
            type: "knowledge",
            name: "okf",
            version: "1.0.0",
            format: { name: "okf", version: "0.2" },
            bundleRoot: "src",
          }),
        );
        fs.writeFileSync(
          path.join(knowledgeDir, "src", "index.md"),
          '---\nokf_version: "0.2"\n---\n# Knowledge\n',
        );

        const snapshot = yield* buildReconciliationSnapshot({
          baseDir: tempDir,
          scope: "project",
          now: DateTime.makeUnsafe("2026-07-10T10:00:00.000Z"),
          configuredOwner: Option.some(handle("@acme")),
          agents: ["claude-code"],
          settings: {
            knowledge: { okf: { source: "workspace:@acme/knowledge/okf", enabled: true } },
          },
        });

        expect(snapshot.unresolved).toEqual([]);
        expect(snapshot.lockfile.knowledge?.["okf"]).toEqual(
          expect.objectContaining({
            type: "workspace",
            owner: "@acme",
            name: "okf",
            version: "1.0.0",
          }),
        );
      }),
    ),
  );

  it.effect("reconciles a missing lockfile when a registry skill is declared", () =>
    withContext(
      Effect.gen(function* () {
        const axmDir = path.join(tempDir, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const settings: Settings = {
          skills: {
            tool: { source: "@acme/skills/tool@^1", enabled: true },
          },
        };

        const result = yield* runReconcileMaterializeOperation(
          {
            baseDir: tempDir,
            now: DateTime.makeUnsafe("2026-02-25T10:00:00.000Z"),
            configuredOwner: Option.some(handle("@community")),
            agents: ["claude-code"],
            settings,
          },
          axmDir,
          "missing",
          { allowMissingDeclarations: true },
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("deferred to install");
        expect(result.message).toContain("skills/tool");

        const parsed = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
        expect(parsed.skills).toEqual({});
      }),
    ),
  );

  it.effect("defers registry rule, hook, and knowledge declarations instead of dropping them", () =>
    withContext(
      Effect.gen(function* () {
        const axmDir = path.join(tempDir, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        fs.writeFileSync(
          path.join(axmDir, "axm-lock.yaml"),
          "lockfileVersion: 12345\nskills:\n  tool:\n    installedAt: not-a-date\n",
        );

        const settings: Settings = {
          skills: {},
          rules: {
            "commit-style": { source: "@acme/rules/commit-style@^1", enabled: true },
          },
          hooks: {
            guard: { source: "@acme/hooks/guard@^1", enabled: true },
          },
          knowledge: {
            handbook: { source: "@acme/knowledge/handbook@^1", enabled: true },
          },
        };

        const result = yield* runReconcileMaterializeOperation(
          {
            baseDir: tempDir,
            now: DateTime.makeUnsafe("2026-02-25T10:00:00.000Z"),
            configuredOwner: Option.some(handle("@community")),
            agents: ["claude-code"],
            settings,
          },
          axmDir,
          "invalid",
          { allowMissingDeclarations: true },
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("deferred to install");
        expect(result.message).toContain("rules/commit-style");
        expect(result.message).toContain("hooks/guard");
        expect(result.message).toContain("knowledge/handbook");
      }),
    ),
  );

  it.effect("backs up and regenerates an invalid lockfile when a registry skill is declared", () =>
    withContext(
      Effect.gen(function* () {
        const axmDir = path.join(tempDir, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        fs.writeFileSync(
          path.join(axmDir, "axm-lock.yaml"),
          "lockfileVersion: 12345\nskills:\n  tool:\n    installedAt: not-a-date\n",
        );

        const settings: Settings = {
          skills: {
            tool: { source: "@acme/skills/tool@^1", enabled: true },
          },
        };

        const result = yield* runReconcileMaterializeOperation(
          {
            baseDir: tempDir,
            now: DateTime.makeUnsafe("2026-02-25T10:00:00.000Z"),
            configuredOwner: Option.some(handle("@community")),
            agents: ["claude-code"],
            settings,
          },
          axmDir,
          "invalid",
          { allowMissingDeclarations: true },
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("deferred to install");
        expect(result.message).toMatch(/backed up invalid lockfile to .+axm-lock\.yaml/);

        const parsed = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
        expect(parsed.lockfileVersion).toBe(3);
        expect(parsed.skills).toEqual({});
      }),
    ),
  );

  it.effect("returns unreachable-source error when unresolved declarations remain", () =>
    withContext(
      Effect.gen(function* () {
        const axmDir = path.join(tempDir, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const settings: Settings = {
          skills: {
            tool: { source: "@acme/skills/tool@^1", enabled: true },
          },
        };

        const result = yield* runReconcileMaterializeOperation(
          {
            baseDir: tempDir,
            now: DateTime.makeUnsafe("2026-02-25T10:00:00.000Z"),
            configuredOwner: Option.some(handle("@community")),
            agents: ["claude-code"],
            settings,
          },
          axmDir,
          "missing",
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("network");
        }
      }),
    ),
  );
});
