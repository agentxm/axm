import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturePath = fileURLToPath(new URL("./fixtures/screen-log-frame.mjs", import.meta.url));

const runFixture = (...args: ReadonlyArray<string>) =>
  spawnSync("bun", ["run", fixturePath, ...args], {
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });

/** Settlement erases the live region and hands the cursor back. */
const HANDBACK = "\u001b[0J\u001b[?25h";

describe("interactive screen frame", () => {
  it("keeps an Effect warning whole above a running frame", () => {
    const result = runFixture();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("warning stayed whole\n");
    expect(result.stderr).toContain("\u001b[?25l");
    expect(result.stderr).toContain("\u001b[?25h");
    expect(result.stderr.indexOf("warning stayed whole\n")).toBeLessThan(
      result.stderr.lastIndexOf("Running frame task"),
    );
    // Progress lives in the live ledger, which carries the operation's counts
    // beneath its rows.
    expect(result.stderr).toContain("Frame task 1 of 1 done in ");
    expect(result.stderr.slice(-HANDBACK.length)).toBe(HANDBACK);
  });

  it("narrates the settlement where nothing can animate", () => {
    const result = runFixture("plain");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("warning stayed whole\n");
    // No live region, so no cursor to hide and no rows to erase.
    expect(result.stderr).not.toContain("\u001b");
    // The settled line is painted through the gutter: the mark, the name, and
    // the elapsed time at the value column.
    expect(result.stderr).toMatch(/✔ {3}Frame task {2,}\d+ms\n/u);
  });
});
