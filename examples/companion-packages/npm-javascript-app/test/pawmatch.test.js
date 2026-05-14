// @ts-check

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const entry = fileURLToPath(new URL("../src/index.js", import.meta.url));

describe("pawmatch CLI", () => {
  it("runs 'fees' and exits 0", () => {
    const result = spawnSync(process.execPath, [entry, "fees"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /Adoption fees/);
  });
});
