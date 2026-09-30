import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, it } from "vitest";

import { startBoundaryClaimProcess } from "./boundary-claim-process.js";

it("reports a refused worker's typed cause without exposing its private paths", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-boundary-diagnostic-")));
  const owner = path.join(root, "private-owner");
  const namespace = path.join(root, "private-namespace");
  const file = path.join(owner, "config.json");
  fs.mkdirSync(path.join(owner, ".axm"), { recursive: true });
  fs.writeFileSync(path.join(owner, "axm.json"), "original settings");
  fs.writeFileSync(file, "original");
  // A file cannot provide the coordination directory; no process timeout is needed.
  fs.writeFileSync(namespace, "private namespace contents");
  const worker = startBoundaryClaimProcess({
    owner,
    namespace,
    nativeRoot: owner,
    target: file,
    file,
    label: "changed",
  });
  try {
    const rejected = await worker.waitFor("written").then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(await worker.completion).toBe(0);
    expect(rejected).toBeInstanceOf(Error);
    if (!(rejected instanceof Error)) throw new Error("Expected the refused worker diagnostic");
    expect(rejected.message).toContain('"_tag":"WorkspaceSnapshotError"');
    expect(rejected.message).toContain('"step":"inspect-target"');
    expect(rejected.message).toContain('"cause":');
    expect(rejected.message).toContain('"_tag":"NativeLocationError"');
    expect(rejected.message).toContain('"reason":"unreadable"');
    expect(rejected.message).not.toContain("private-owner");
    expect(rejected.message).not.toContain("private-namespace");
    expect(rejected.message).not.toContain("private namespace contents");
    expect(worker.events).not.toContain("read-entered");
    expect(fs.readFileSync(file, "utf8")).toBe("original");
    expect(fs.readFileSync(path.join(owner, "axm.json"), "utf8")).toBe("original settings");
  } finally {
    worker.stop();
    await worker.completion;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
