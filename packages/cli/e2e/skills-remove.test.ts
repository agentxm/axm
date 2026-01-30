/**
 * E2E tests for the `axm skills remove` command.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "./utils.js";

describe("axm skills remove", () => {
  it("outputs 'Hello Alex' and exits with code 0", async () => {
    const result = await runCli(["skills", "remove"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Hello Alex");
  });
});
