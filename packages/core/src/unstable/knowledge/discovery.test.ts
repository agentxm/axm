import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { reconcileKnowledgeDiscovery, type KnowledgeDiscoveryBundle } from "./discovery.js";

const makeBundle = (
  root: string,
  owner: string,
  name: string,
  description?: string,
): KnowledgeDiscoveryBundle => {
  const sourceDir = nodePath.join(root, ".axm", "extensions", owner, "knowledge", name, "src");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(nodePath.join(sourceDir, "index.md"), `# ${name}\n`);
  return { owner, name, sourceDir, ...(description === undefined ? {} : { description }) };
};

const run = (
  root: string,
  bundles: ReadonlyArray<KnowledgeDiscoveryBundle>,
  options?: {
    readonly instructions?: false;
    readonly management?: boolean;
    readonly dryRun?: boolean;
  },
) =>
  reconcileKnowledgeDiscovery({
    scopeRoot: root,
    config: { instructions: options?.instructions !== false },
    bundles,
    instructionsPath: nodePath.join(root, "AGENTS.md"),
    instructionManagementEnabled: options?.management ?? true,
    ...(options?.dryRun === undefined ? {} : { dryRun: options.dryRun }),
  }).pipe(Effect.provide(NodeServices.layer));

describe("reconcileKnowledgeDiscovery", () => {
  it.effect("renders one deterministic, escaped Knowledge Bundles table with canonical links", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-table-"));
      try {
        const zeta = makeBundle(root, "@zeta", "platform", undefined);
        const acmePlatform = makeBundle(root, "@acme", "platform", "Line one\nline | two \\ ok");
        const acmeRunbook = makeBundle(root, "@acme", "runbook", "Operations");

        const first = yield* run(root, [zeta, acmeRunbook, acmePlatform]);
        const second = yield* run(root, [acmePlatform, zeta, acmeRunbook]);
        const instructions = readFileSync(nodePath.join(root, "AGENTS.md"), "utf8");

        expect(first.changed).toBe(true);
        expect(second.changed).toBe(false);
        expect(instructions).toContain("region=knowledge");
        const routing =
          "Use `axm knowledge concepts --help` to search, read, and explore these bundles.";
        expect(instructions.split(routing)).toHaveLength(2);
        expect(instructions).toContain(`## Knowledge Bundles\n\n${routing}\n\n### @acme`);
        expect(instructions).toContain(
          "### @acme\n\n| Bundle | Description |\n| --- | --- |\n" +
            "| [platform](.axm/extensions/@acme/knowledge/platform/src/index.md) | Line one line \\| two \\\\ ok |\n" +
            "| [runbook](.axm/extensions/@acme/knowledge/runbook/src/index.md) | Operations |",
        );
        expect(instructions).toContain(
          "### @zeta\n\n| Bundle | Description |\n| --- | --- |\n" +
            "| [platform](.axm/extensions/@zeta/knowledge/platform/src/index.md) | — |",
        );
        expect(instructions.indexOf("### @acme")).toBeLessThan(instructions.indexOf("### @zeta"));
        expect(existsSync(nodePath.join(root, ".agents", "knowledge"))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("removes its region without creating an otherwise empty instruction file", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-table-"));
      try {
        yield* run(root, [makeBundle(root, "@acme", "platform")]);
        yield* run(root, []);
        expect(existsSync(nodePath.join(root, "AGENTS.md"))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("honors the Knowledge toggle while preserving unrelated instruction content", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-table-"));
      try {
        writeFileSync(nodePath.join(root, "AGENTS.md"), "# Team instructions\n");
        const bundle = makeBundle(root, "@acme", "platform");
        yield* run(root, [bundle]);
        yield* run(root, [bundle], { instructions: false });
        expect(readFileSync(nodePath.join(root, "AGENTS.md"), "utf8")).toBe(
          "# Team instructions\n",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("does not mutate instructions when global instruction management is disabled", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-table-"));
      try {
        const instructions = nodePath.join(root, "AGENTS.md");
        writeFileSync(instructions, "# Hand maintained\n");
        const bundle = makeBundle(root, "@acme", "platform");
        yield* run(root, [bundle]);
        const managed = readFileSync(instructions, "utf8");

        const result = yield* run(root, [], { management: false });

        expect(result.changed).toBe(false);
        expect(readFileSync(instructions, "utf8")).toBe(managed);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );
});
