import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";
import { repoRoot } from "./distribution-targets.js";

/**
 * Verifies that each install script contains logic to write install-meta.json
 * after binary placement. These are script-content tests that do not require
 * compiled binaries or a network — they parse the scripts as text.
 */
describe("install-meta.json script content", () => {
  it("install.sh writes install-meta.json with method and timestamp", () => {
    const script = fs.readFileSync(path.join(repoRoot, "install.sh"), "utf-8");

    expect(script).toContain("install-meta.json");
    expect(script).toContain('"method": "script"');
    expect(script).toContain('"installedAt":');
    expect(script).toMatch(/date -u \+["%].*Y.*m.*d.*T.*H.*M.*S.*Z/);
  });

  it("install.ps1 writes install-meta.json with method and timestamp", () => {
    const script = fs.readFileSync(path.join(repoRoot, "install.ps1"), "utf-8");

    expect(script).toContain("install-meta.json");
    expect(script).toContain("method");
    expect(script).toContain("script");
    expect(script).toContain("installedAt");
    expect(script).toMatch(/UtcNow/);
  });

  it("install.cmd writes install-meta.json with method and timestamp", () => {
    const script = fs.readFileSync(path.join(repoRoot, "install.cmd"), "utf-8");

    expect(script).toContain("install-meta.json");
    expect(script).toContain('"method": "script"');
    expect(script).toContain('"installedAt":');
    expect(script).toContain("powershell -NoProfile -Command");
    expect(script).not.toContain("wmic os get localdatetime");
  });
});
