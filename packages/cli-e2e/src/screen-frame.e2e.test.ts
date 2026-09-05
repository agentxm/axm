import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturePath = fileURLToPath(new URL("./fixtures/screen-log-frame.mjs", import.meta.url));

describe("interactive screen frame", () => {
  it("keeps an Effect warning whole above a running frame", () => {
    const result = spawnSync("bun", ["run", fixturePath], {
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("warning stayed whole\n");
    expect(result.stderr).toContain("\u001b[?25l");
    expect(result.stderr).toContain("\u001b[?25h");
    expect(result.stderr.indexOf("warning stayed whole\n")).toBeLessThan(
      result.stderr.lastIndexOf("Running frame task"),
    );
    expect(result.stderr).toMatch(/✔ Frame task {2}\d+ms\n/u);
  });
});
