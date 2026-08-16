import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-stubs.js";
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
        expect(rendererState.spinnerMessages).toContain("Checking extensions for deprecation");
      }),
    );
  });

  it.effect("filters the local inventory by every selected type", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      skills: { review: "@acme/skills/review" },
      hooks: { audit: { source: "@acme/hooks/audit", enabled: true } },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ type: Option.some("skill"), outdated: false, deprecated: false });
        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [expect.objectContaining({ type: "skill", name: "review" })],
        });
      }),
    );
  });

  it.effect("rejects mutually exclusive remote filters as a usage error", () => {
    const { provide } = makeWorkspaceHandlerTestContext({ machine: true });
    return provide(
      handleList({ type: Option.none(), outdated: true, deprecated: true }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error.code).toBe("usage");
            expect(error.detail).toContain("cannot be combined");
          }),
        ),
      ),
    );
  });

  const writeInstalledRegistrySkill = (
    registryIndex?: Record<string, unknown>,
    registryLocation?: string,
  ) => {
    const axmDir = path.join(tempDir, ".axm");
    const registryDir = path.join(tempDir, "registry");
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
          installedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      writeTrustFromLockfile: true,
    });
    const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "review");
    fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(skillDir, "src", "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
    );
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

  it.effect("checks the recorded named Registry for outdated disabled installations", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeInstalledRegistrySkill({});
    return provide(
      Effect.gen(function* () {
        yield* handleList({ type: Option.none(), outdated: true, deprecated: false });
        expect(rendererState.results[0]?.data).toMatchObject({
          filter: "outdated",
          count: 1,
          coverage: { eligible: 1, checked: 1, unknown: 0 },
          items: [
            expect.objectContaining({
              ref: "@acme/skills/review",
              enabled: false,
              sourceName: "company",
              assessment: expect.objectContaining({
                state: "available",
                installedVersion: "1.0.0",
                constraint: "^1.0.0",
                latestMatching: "1.1.0",
                latestAvailable: "1.1.0",
              }),
            }),
          ],
        });
      }),
    );
  });

  it.effect("reports structured Registry deprecation metadata", () => {
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
        yield* handleList({ type: Option.none(), outdated: false, deprecated: true });
        expect(rendererState.results[0]?.data).toMatchObject({
          filter: "deprecated",
          count: 1,
          items: [
            {
              assessment: {
                state: "deprecated",
                deprecation: {
                  deprecatedAt: DateTime.makeUnsafe("2026-03-01T00:00:00.000Z"),
                  message: "Use the replacement skill.",
                  replacement: { status: "available", fqn: "@acme/skills/replacement" },
                },
              },
            },
          ],
        });
      }),
    );
  });

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

  it.effect("points ordinary human list rows to full deprecation detail", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext();
    writeInstalledRegistrySkill({
      deprecation: {
        deprecatedAt: "2026-03-01T00:00:00.000Z",
        message: "Use the replacement skill.",
      },
    });
    return provide(
      Effect.gen(function* () {
        yield* handleList({ type: Option.none(), outdated: false, deprecated: false });
        expect(rendererState.results[1]?.data).toMatchObject({
          items: [
            expect.objectContaining({
              state: "deprecated",
              guidance: "axm view @acme/skills/review deprecation",
            }),
          ],
        });
      }),
    );
  });

  it.effect(
    "does not mark an installation outdated when only an incompatible version is newer",
    () => {
      const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
      writeInstalledRegistrySkill({
        versions: [
          {
            version: "2.0.0",
            published: "2026-02-01T00:00:00.000Z",
            integrity: "sha512-BBBB==",
          },
          {
            version: "1.0.0",
            published: "2026-01-01T00:00:00.000Z",
            integrity: "sha512-AAAA==",
          },
        ],
      });
      return provide(
        Effect.gen(function* () {
          yield* handleList({ type: Option.none(), outdated: true, deprecated: false });

          expect(rendererState.results[0]?.data).toMatchObject({
            filter: "outdated",
            count: 0,
            items: [],
            coverage: { eligible: 1, checked: 1, unknown: 0 },
          });
        }),
      );
    },
  );

  it.effect("keeps missing indexes out of matches and reports incomplete coverage", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeInstalledRegistrySkill();
    return provide(
      Effect.gen(function* () {
        yield* handleList({ type: Option.none(), outdated: true, deprecated: false });
        expect(rendererState.results[0]?.data).toMatchObject({
          filter: "outdated",
          count: 0,
          items: [],
          coverage: { eligible: 1, checked: 0, unknown: 1 },
        });
      }),
    );
  });

  it.effect("propagates remote Registry failures instead of reporting a clean result", () => {
    const { provide } = makeWorkspaceHandlerTestContext({ machine: true });
    writeInstalledRegistrySkill(undefined, "http://127.0.0.1:1");
    return provide(
      Effect.gen(function* () {
        const error = yield* handleList({
          type: Option.none(),
          outdated: true,
          deprecated: false,
        }).pipe(Effect.flip);

        expect(error.code).toBe("network");
      }),
    );
  });
});
