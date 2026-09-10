import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LEDGER_PATH, checkParityLedger, countSeedRows } from "./parity-ledger-check-lib.js";

const tempRoots: string[] = [];

const fixtureGitEnvironment = { ...process.env };
for (const name of Object.keys(fixtureGitEnvironment)) {
  if (name.startsWith("GIT_")) {
    delete fixtureGitEnvironment[name];
  }
}

const git = (repoRoot: string, args: ReadonlyArray<string>): void => {
  execFileSync("git", [...args], {
    cwd: repoRoot,
    env: fixtureGitEnvironment,
    stdio: "ignore",
  });
};

/** A git repo whose `main` carries `baseline` and whose worktree carries `head`. */
const createRepoFixture = (baseline: string | null, head: string): string => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axm-parity-ledger-"));
  tempRoots.push(repoRoot);

  git(repoRoot, ["init", "--initial-branch", "main"]);
  git(repoRoot, ["config", "user.email", "test@example.com"]);
  git(repoRoot, ["config", "user.name", "Test"]);
  git(repoRoot, ["config", "commit.gpgSign", "false"]);

  const ledgerPath = path.join(repoRoot, LEDGER_PATH);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });

  fs.writeFileSync(path.join(repoRoot, "README.md"), "fixture\n");
  if (baseline !== null) {
    fs.writeFileSync(ledgerPath, baseline);
  }
  git(repoRoot, ["add", "-A"]);
  git(repoRoot, ["commit", "-m", "baseline"]);

  fs.writeFileSync(ledgerPath, head);
  return repoRoot;
};

/** A ledger shaped the way prettier formats the real one. */
const ledgerWith = (seedRows: number): string =>
  `export const PARITY_EXEMPTIONS = {\n  skill: [\n${Array.from(
    { length: seedRows },
    () =>
      `    {\n      obligation: "8.6-entity-key",\n      reason: "y",\n      trackedBy: "AXM-985",\n      seed: true,\n    },\n`,
  ).join("")}  ],\n};\n`;

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe("countSeedRows", () => {
  it("counts only rows flagged as seeded", () => {
    const source = `
      {
        obligation: "a",
        seed: true,
      },
      {
        obligation: "b",
      },
      {
        obligation: "c",
        seed: true,
      },
    `;

    expect(countSeedRows(source)).toBe(2);
  });

  it("ignores prose that mentions the flag", () => {
    const source = "/** `seed: true` marks a pre-existing row. */\nexport const X = {};\n";

    expect(countSeedRows(source)).toBe(0);
  });

  it("counts nothing in an empty ledger", () => {
    expect(countSeedRows(ledgerWith(0))).toBe(0);
  });
});

describe("checkParityLedger", () => {
  it("passes when the seeded count is unchanged", () => {
    const result = checkParityLedger(createRepoFixture(ledgerWith(3), ledgerWith(3)));

    expect(result.ok).toBe(true);
    expect(result.comparison).toMatchObject({ baseline: 3, current: 3 });
  });

  it("passes when the ledger shrinks", () => {
    const result = checkParityLedger(createRepoFixture(ledgerWith(3), ledgerWith(1)));

    expect(result.ok).toBe(true);
    expect(result.message).toContain("shrank");
  });

  it("fails when the seeded count rises", () => {
    const result = checkParityLedger(createRepoFixture(ledgerWith(1), ledgerWith(2)));

    expect(result.ok).toBe(false);
    expect(result.message).toContain("grew");
  });

  it("passes on the ledger's first landing", () => {
    const result = checkParityLedger(createRepoFixture(null, ledgerWith(5)));

    expect(result.ok).toBe(true);
    expect(result.comparison).toMatchObject({ baseline: null, current: 5 });
  });

  it("fails when the ledger is missing from the worktree", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axm-parity-ledger-"));
    tempRoots.push(repoRoot);

    const result = checkParityLedger(repoRoot);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("not found");
  });
});
