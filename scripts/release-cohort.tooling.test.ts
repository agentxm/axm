import { describe, expect, it } from "vitest";

import { type CohortSnapshot, gitRefSnapshot, resolveReleaseCohort } from "./release-cohort.js";

type FileTree = Readonly<Record<string, string>>;

const snapshotOf = (files: FileTree, describeAs = "fixture"): CohortSnapshot => ({
  describe: describeAs,
  listProjectFiles: () => Object.keys(files).filter((path) => path.endsWith("project.json")),
  read: (path) => {
    const content = files[path];
    if (content === undefined) throw new Error(`Missing ${path} in ${describeAs}.`);
    return content;
  },
});

const project = (name: string, tags: readonly string[]) => JSON.stringify({ name, tags });
const manifest = (name: string, dependencies: Readonly<Record<string, string>> = {}) =>
  JSON.stringify({ name, dependencies });

describe("release cohort derivation", () => {
  it("selects only the projects the release tag declares", () => {
    const cohort = resolveReleaseCohort(
      snapshotOf({
        "packages/model/project.json": project("model", ["release:cli"]),
        "packages/model/package.json": manifest("@scope/model"),
        "packages/tool/project.json": project("tool", ["internal"]),
        "packages/tool/package.json": manifest("@scope/tool"),
      }),
    );

    expect(cohort.map(({ name }) => name)).toEqual(["@scope/model"]);
    expect(cohort[0]).toEqual({
      name: "@scope/model",
      path: "packages/model/package.json",
      project: "model",
      tarballPrefix: "scope-model-",
    });
  });

  it("orders every member after the cohort members it depends on", () => {
    const cohort = resolveReleaseCohort(
      snapshotOf({
        // Declared consumer-first so the order cannot come from input order.
        "packages/cli/project.json": project("cli", ["release:cli"]),
        "packages/cli/package.json": manifest("axm.sh", {
          "@scope/client": "workspace:*",
          "external-dep": "^1.0.0",
        }),
        "packages/client/project.json": project("client", ["release:cli"]),
        "packages/client/package.json": manifest("@scope/client", {
          "@scope/model": "workspace:*",
        }),
        "packages/model/project.json": project("model", ["release:cli"]),
        "packages/model/package.json": manifest("@scope/model"),
      }),
    );

    expect(cohort.map(({ name }) => name)).toEqual(["@scope/model", "@scope/client", "axm.sh"]);
  });

  it("flattens scoped names and preserves unscoped names in tarball prefixes", () => {
    const cohort = resolveReleaseCohort(
      snapshotOf({
        "packages/cli/project.json": project("cli", ["release:cli"]),
        "packages/cli/package.json": manifest("axm.sh"),
        "packages/model/project.json": project("model", ["release:cli"]),
        "packages/model/package.json": manifest("@agentxm/extension-model"),
      }),
    );

    expect(Object.fromEntries(cohort.map((pkg) => [pkg.name, pkg.tarballPrefix]))).toEqual({
      "axm.sh": "axm.sh-",
      "@agentxm/extension-model": "agentxm-extension-model-",
    });
  });

  it("refuses a snapshot that declares no release cohort", () => {
    expect(() =>
      resolveReleaseCohort(
        snapshotOf(
          {
            "packages/tool/project.json": project("tool", ["internal"]),
            "packages/tool/package.json": manifest("@scope/tool"),
          },
          "abc1234",
        ),
      ),
    ).toThrow("No release:cli projects declared in abc1234.");
  });

  it("refuses a cyclic cohort instead of emitting an unpublishable order", () => {
    expect(() =>
      resolveReleaseCohort(
        snapshotOf({
          "packages/a/project.json": project("a", ["release:cli"]),
          "packages/a/package.json": manifest("@scope/a", { "@scope/b": "workspace:*" }),
          "packages/b/project.json": project("b", ["release:cli"]),
          "packages/b/package.json": manifest("@scope/b", { "@scope/a": "workspace:*" }),
        }),
      ),
    ).toThrow("Cyclic release cohort dependency");
  });

  it("refuses two projects that publish the same package name", () => {
    expect(() =>
      resolveReleaseCohort(
        snapshotOf({
          "packages/a/project.json": project("a", ["release:cli"]),
          "packages/a/package.json": manifest("@scope/duplicate"),
          "packages/b/project.json": project("b", ["release:cli"]),
          "packages/b/package.json": manifest("@scope/duplicate"),
        }),
      ),
    ).toThrow("Duplicate release cohort package @scope/duplicate");
  });

  it("resolves a cohort from a named ref through Git rather than the checkout", () => {
    const atHead = resolveReleaseCohort(gitRefSnapshot("HEAD"));

    expect(atHead.length).toBeGreaterThan(0);
    // The published CLI consumes the rest of the cohort, so it publishes last.
    expect(atHead.at(-1)?.name).toBe("axm.sh");
    expect(atHead.every(({ path }) => path.endsWith("/package.json"))).toBe(true);
  });
});
