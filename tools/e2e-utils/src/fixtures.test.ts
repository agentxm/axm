import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";

import { copyFixture } from "./fixtures.js";
import { createTempDir } from "./temp-dir.js";

describe("fixture directory lifetime", () => {
  it("copies independent bytes and removes only the acquired copy", () => {
    const source = createTempDir();
    onTestFinished(source.cleanup);
    const bytes = Uint8Array.from([0, 255, 13, 10]);
    fs.writeFileSync(path.join(source.path, "binary"), bytes);

    const fixture = copyFixture(source.path);
    onTestFinished(fixture.cleanup);
    expect(fs.readFileSync(path.join(fixture.path, "binary"))).toEqual(Buffer.from(bytes));
    fs.writeFileSync(path.join(fixture.path, "binary"), "changed");
    expect(fs.readFileSync(path.join(source.path, "binary"))).toEqual(Buffer.from(bytes));

    fixture.cleanup();
    expect(fs.existsSync(fixture.path)).toBe(false);
    expect(fs.existsSync(source.path)).toBe(true);
    expect(fixture.cleanup).not.toThrow();
  });

  it("releases the acquired directory when the source cannot be copied", () => {
    const prefix = `axm-failed-copy-${randomUUID()}-`;
    const source = path.join(os.tmpdir(), `${prefix}absent`);
    // Retain cleanup even when the regression assertion discovers a leak.
    onTestFinished(() => {
      for (const entry of fs.readdirSync(os.tmpdir())) {
        if (entry.startsWith(prefix)) {
          fs.rmSync(path.join(os.tmpdir(), entry), { recursive: true, force: true });
        }
      }
    });

    expect(() => copyFixture(source, prefix)).toThrow();
    expect(fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith(prefix))).toEqual([]);
  });
});
