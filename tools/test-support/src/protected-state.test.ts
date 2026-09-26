import { expect, it } from "vitest";

import { makeMemoryFileSystem } from "./memory-file-system.js";
import { WORKSPACE_PROTECTED_STATE, snapshotProtectedState } from "./protected-state.js";

it("includes all protected workspace paths and their exact content", () => {
  const memory = makeMemoryFileSystem();
  memory.files.makeDirectory("/tmp/world");
  memory.files.writeFile("/tmp/world/axm.json", "{}\n");
  memory.files.makeDirectory("/tmp/world/.cursor");
  memory.files.writeFile("/tmp/world/.cursor/settings.json", "{}\n");

  const snapshot = snapshotProtectedState("/tmp/world", WORKSPACE_PROTECTED_STATE, memory.files);
  expect(WORKSPACE_PROTECTED_STATE).toHaveLength(20);
  expect(snapshot["axm.json"]).toEqual({ ".": "file:e30K" });
  expect(snapshot[".cursor"]).toEqual({ "settings.json": "file:e30K" });
  expect(snapshot[".gitignore"]).toEqual({});
  expect(Object.keys(snapshot)).toEqual(WORKSPACE_PROTECTED_STATE);
});
