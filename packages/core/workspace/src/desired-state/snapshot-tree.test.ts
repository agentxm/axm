import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { expect, it } from "vitest";

import { snapshotPath, snapshotTree } from "./testing.js";

it("snapshots directories, binary files, and broken links without losing bytes", () => {
  const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-snapshot-tree-"));
  try {
    fs.mkdirSync(nodePath.join(root, "nested"));
    fs.writeFileSync(nodePath.join(root, "nested", "binary"), Buffer.from([0, 255, 10]));
    fs.symlinkSync("missing", nodePath.join(root, "link"));

    expect(snapshotTree(root)).toEqual({
      link: "symlink:missing",
      nested: "directory",
      [nodePath.join("nested", "binary")]: "file:AP8K",
    });
    expect(snapshotPath(nodePath.join(root, "link"))).toBe("symlink:missing");
    expect(snapshotPath(nodePath.join(root, "nested", "binary"))).toBe("file:AP8K");
    expect(snapshotPath(nodePath.join(root, "missing"))).toBeUndefined();
    expect(snapshotTree(nodePath.join(root, "missing"))).toEqual({});
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
