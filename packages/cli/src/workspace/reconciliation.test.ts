import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import YAML from "yaml";
import type { Settings } from "../settings/index.js";
import {
  buildReconciliationSnapshot,
  dedupeDeclarations,
  runReconcileMaterializeOperation,
} from "./reconciliation.js";

describe("reconciliation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-reconcile-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withContext = <A, E>(effect: Effect.Effect<A, E, NodeContext.NodeContext>) =>
    effect.pipe(Effect.provide(NodeContext.layer));

  it("dedupes declarations by deterministic key and warns on conflicts", () => {
    const result = dedupeDeclarations([
      {
        extensionType: "skills",
        namespace: "@acme",
        name: "tool",
        source: "@acme/skills/tool@^1",
        declarationSourceOrConstraint: "^1",
        order: 0,
        origin: "settings",
      },
      {
        extensionType: "skills",
        namespace: "@acme",
        name: "tool",
        source: "@acme/skills/tool@~2",
        declarationSourceOrConstraint: "~2",
        order: 1,
        origin: "pack",
      },
      {
        extensionType: "skills",
        namespace: "@acme",
        name: "tool",
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
        extensionType: "commands",
        namespace: "@acme",
        name: "zeta",
        source: "@acme/commands/zeta@^1",
        declarationSourceOrConstraint: "^1",
        order: 0,
        origin: "settings",
      },
      {
        extensionType: "skills",
        namespace: "@acme",
        name: "beta",
        source: "@acme/skills/beta@^1",
        declarationSourceOrConstraint: "^1",
        order: 5,
        origin: "settings",
      },
      {
        extensionType: "skills",
        namespace: "@acme",
        name: "alpha",
        source: "@acme/skills/alpha@^1",
        declarationSourceOrConstraint: "^1",
        order: 9,
        origin: "settings",
      },
    ]);

    expect(result.declarations.map((d) => `${d.extensionType}:${d.name}`)).toEqual([
      "skills:alpha",
      "skills:beta",
      "commands:zeta",
    ]);
  });

  it.effect("reconstructs compatible skill declaration from disk", () =>
    withContext(
      Effect.gen(function* () {
        const canonical = path.join(tempDir, ".axm", "extensions", "@acme", "skills", "tool");
        fs.mkdirSync(canonical, { recursive: true });
        fs.writeFileSync(
          path.join(canonical, "axm-skill.json"),
          JSON.stringify({ namespace: "@acme", type: "skill", name: "tool", version: "1.2.3" }),
        );

        const settings: Settings = {
          skills: {
            tool: "@acme/skills/tool@^1",
          },
        };

        const snapshot = yield* buildReconciliationSnapshot({
          baseDir: tempDir,
          now: new Date("2026-02-25T10:00:00.000Z"),
          defaultNamespace: "@community",
          agents: ["claude-code"],
          settings,
        });

        expect(Object.keys(snapshot.lockfile.skills)).toEqual(["tool"]);
        expect(snapshot.unresolved).toEqual([]);
      }),
    ),
  );

  it.effect("backs up invalid lockfile before materialization", () =>
    withContext(
      Effect.gen(function* () {
        const axmDir = path.join(tempDir, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "invalid: [");

        const canonical = path.join(tempDir, ".axm", "extensions", "@acme", "skills", "tool");
        fs.mkdirSync(canonical, { recursive: true });
        fs.writeFileSync(
          path.join(canonical, "axm-skill.json"),
          JSON.stringify({ namespace: "@acme", type: "skill", name: "tool", version: "1.2.3" }),
        );

        const settings: Settings = {
          skills: {
            tool: "@acme/skills/tool@^1",
          },
        };

        const result = yield* runReconcileMaterializeOperation(
          {
            baseDir: tempDir,
            now: new Date("2026-02-25T10:00:00.000Z"),
            defaultNamespace: "@community",
            agents: ["claude-code"],
            settings,
          },
          axmDir,
          "invalid",
        );

        expect(result.result).toBe("success");

        const files = fs.readdirSync(axmDir);
        expect(files.some((file) => file.startsWith("axm-lock.yaml.bak."))).toBe(true);

        const parsed = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
        expect(parsed.skills.tool).toBeDefined();
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
            tool: "@acme/skills/tool@^1",
          },
        };

        const result = yield* runReconcileMaterializeOperation(
          {
            baseDir: tempDir,
            now: new Date("2026-02-25T10:00:00.000Z"),
            defaultNamespace: "@community",
            agents: ["claude-code"],
            settings,
          },
          axmDir,
          "missing",
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("LOCKFILE_RECONCILE_SOURCE_UNREACHABLE");
        }
      }),
    ),
  );
});
