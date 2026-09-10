import { startedUnits } from "../../screen/index.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { computeMaterializedTreeIntegritySync, writeWorkspaceFiles } from "../../test-stubs.js";
import { makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleList } from "./command.js";

describe("root list", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-list-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("returns a deterministic cross-type inventory with lifecycle summaries", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      skills: { review: { source: "@acme/skills/review", enabled: false } },
      hooks: { audit: { source: "@acme/hooks/audit", enabled: true } },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ type: Option.none(), outdated: false, deprecated: false });
        expect(rendererState.results[0]?.data).toMatchObject({
          filter: "all",
          count: 2,
          totalCount: 2,
          items: [
            expect.objectContaining({ type: "hook", name: "audit", management: "configured" }),
            expect.objectContaining({
              type: "skill",
              name: "review",
              management: "configured",
              enabled: false,
            }),
          ],
        });
        expect(startedUnits(rendererState)).toContain("deprecation status");
      }),
    );
  });

  const writeInstalledRegistrySkill = (
    registryIndex?: Record<string, unknown>,
    registryLocation?: string,
  ) => {
    const axmDir = path.join(tempDir, ".axm");
    const registryDir = path.join(tempDir, "registry");
    const skillDir = path.join(tempDir, "agent_extensions", "agentxm", "@acme", "skills", "review");
    fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(skillDir, "src", "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
    );
    writeWorkspaceFiles(axmDir, {
      skills: { review: { source: "@acme/skills/review@^1.0.0", enabled: false } },
      sources: [
        {
          name: "company",
          type: "registry",
          location: registryLocation ?? pathToFileURL(registryDir).href,
        },
      ],
      lockfileSkills: {
        review: {
          type: "registry",
          owner: "@acme",
          name: "review",
          resolvedVersion: "1.0.0",
          integrity: "sha512-AAAA==",
          sourceName: "company",
          publisherBindingId: "hbnd_test",
          treeIntegrity: computeMaterializedTreeIntegritySync(skillDir),
          installedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    if (registryIndex !== undefined) {
      const indexDir = path.join(registryDir, "extensions", "@acme", "skills", "review");
      fs.mkdirSync(indexDir, { recursive: true });
      fs.writeFileSync(
        path.join(indexDir, "index.json"),
        JSON.stringify({
          owner: "@acme",
          type: "skill",
          name: "review",
          publisherBindingId: "hbnd_test",
          deprecation: null,
          versions: [
            {
              version: "1.1.0",
              published: "2026-02-01T00:00:00.000Z",
              integrity: "sha512-BBBB==",
            },
            {
              version: "1.0.0",
              published: "2026-01-01T00:00:00.000Z",
              integrity: "sha512-AAAA==",
            },
          ],
          ...registryIndex,
        }),
      );
    }
  };

  it.effect("summarizes deprecation in the ordinary machine list without full guidance", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeInstalledRegistrySkill({
      deprecation: {
        deprecatedAt: "2026-03-01T00:00:00.000Z",
        message: "Use the replacement skill.",
        replacement: { status: "available", fqn: "@acme/skills/replacement" },
      },
    });
    return provide(
      Effect.gen(function* () {
        yield* handleList({ type: Option.none(), outdated: false, deprecated: false });
        const result = rendererState.results[0]?.data;
        expect(result).toMatchObject({
          filter: "all",
          count: 1,
          items: [{ assessment: { state: "deprecated" } }],
        });
        const item =
          typeof result === "object" && result !== null && "items" in result
            ? result.items
            : undefined;
        expect(item).toEqual([
          expect.objectContaining({
            assessment: { state: "deprecated" },
          }),
        ]);
      }),
    );
  });
});
