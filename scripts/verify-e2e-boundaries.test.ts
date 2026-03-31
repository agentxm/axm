import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  findBoundaryViolations,
  formatViolation,
  type BoundaryRule,
} from "./verify-e2e-boundaries-lib.js";

const tempRoots: string[] = [];

const writeFile = (root: string, relativePath: string, content: string) => {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
};

const createRepoFixture = (files: Readonly<Record<string, string>>): string => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axm-e2e-boundaries-"));
  tempRoots.push(repoRoot);

  for (const [relativePath, content] of Object.entries(files)) {
    writeFile(repoRoot, relativePath, content);
  }

  return repoRoot;
};

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe("findBoundaryViolations", () => {
  const rules: ReadonlyArray<BoundaryRule> = [
    {
      projectRoot: "packages/example-e2e",
      forbiddenPackageNames: ["@axm.sh/core", "@axm.sh/cli"],
      forbiddenProjectRoots: ["packages/core", "packages/cli"],
    },
  ];

  it("allows utils and e2e-utils dependencies", () => {
    const repoRoot = createRepoFixture({
      "packages/example-e2e/package.json": JSON.stringify({
        devDependencies: {
          "@axm.sh/e2e-utils": "workspace:*",
          "@axm.sh/utils": "workspace:*",
        },
      }),
      "packages/example-e2e/tsconfig.json": JSON.stringify({
        references: [
          { path: "../utils/tsconfig.lib.json" },
          { path: "../e2e-utils/tsconfig.json" },
        ],
      }),
    });

    expect(findBoundaryViolations(repoRoot, rules)).toEqual([]);
  });

  it("reports forbidden internal package dependencies", () => {
    const repoRoot = createRepoFixture({
      "packages/example-e2e/package.json": JSON.stringify({
        dependencies: { "@axm.sh/core": "workspace:*" },
      }),
      "packages/example-e2e/tsconfig.json": JSON.stringify({}),
    });

    const violations = findBoundaryViolations(repoRoot, rules);
    const violation = violations[0];

    expect(violations).toHaveLength(1);
    expect(violation).toBeDefined();

    if (violation === undefined) {
      throw new Error("Expected a package dependency violation");
    }

    expect(formatViolation(violation)).toBe(
      "packages/example-e2e/package.json: dependencies must not include @axm.sh/core",
    );
  });

  it("reports forbidden tsconfig references", () => {
    const repoRoot = createRepoFixture({
      "packages/example-e2e/package.json": JSON.stringify({}),
      "packages/example-e2e/tsconfig.json": JSON.stringify({
        references: [{ path: "../core/tsconfig.lib.json" }],
      }),
    });

    const violations = findBoundaryViolations(repoRoot, rules);
    const violation = violations[0];

    expect(violations).toHaveLength(1);
    expect(violation).toBeDefined();

    if (violation === undefined) {
      throw new Error("Expected a tsconfig reference violation");
    }

    expect(formatViolation(violation)).toBe(
      'packages/example-e2e/tsconfig.json: reference "../core/tsconfig.lib.json" resolves to forbidden project packages/core',
    );
  });
});
