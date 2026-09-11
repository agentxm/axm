/**
 * Workspace-slice fixtures.
 *
 * Adds two controls the workspace specifications need beyond the shared
 * install harness: a pinned user-scope AXM home (so user settings become a
 * controllable input instead of the developer's real `~/.axm`), and exact
 * content snapshots for proving that a failed or gated invocation changed
 * nothing.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface PinnedUserHome {
  /** Absolute path of the pinned user home directory. */
  readonly home: string;
  /** Absolute path of the user-scope workspace settings file. */
  readonly settingsPath: string;
  /** Removes the user `.axm` subtree so tests do not leak state. */
  readonly reset: () => void;
  /** Removes the home directory and restores the previous pin. */
  readonly cleanup: () => void;
}

/**
 * Pins the AXM user home to a fresh temporary directory via `AXM_USER_HOME`.
 *
 * The resolved user home is captured by the first project-workspace
 * construction in a process, so call this at module scope — before any test
 * constructs a workspace — and keep one pinned home per specification file.
 * Per-test variation happens through the files inside the pinned home, which
 * are re-read on every construction.
 */
export const pinSpecUserHome = (): PinnedUserHome => {
  const previous = process.env["AXM_USER_HOME"];
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-user-home-"));
  process.env["AXM_USER_HOME"] = home;
  return {
    home,
    settingsPath: path.join(home, ".axm", "workspace", "axm.json"),
    reset: () => {
      fs.rmSync(path.join(home, ".axm"), { recursive: true, force: true });
    },
    cleanup: () => {
      fs.rmSync(home, { recursive: true, force: true });
      if (previous === undefined) {
        delete process.env["AXM_USER_HOME"];
      } else {
        process.env["AXM_USER_HOME"] = previous;
      }
    },
  };
};

/**
 * Exact content snapshot of a directory tree: relative path mapped to
 * `"directory"`, `"symlink:<target>"`, or `"file:<base64 bytes>"`. Two
 * snapshots are equal only when every path and every byte is unchanged. A
 * missing root snapshots as empty.
 */
export const snapshotWorkspaceContent = (root: string): Readonly<Record<string, string>> => {
  const snapshot: Record<string, string> = {};
  if (!fs.existsSync(root)) {
    return snapshot;
  }
  const visit = (directory: string): void => {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isSymbolicLink()) {
        snapshot[relative] = `symlink:${fs.readlinkSync(absolute)}`;
      } else if (entry.isDirectory()) {
        snapshot[relative] = "directory";
        visit(absolute);
      } else {
        snapshot[relative] = `file:${fs.readFileSync(absolute).toString("base64")}`;
      }
    }
  };
  visit(root);
  return snapshot;
};
