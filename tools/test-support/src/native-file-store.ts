import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { FileStore } from "./memory-file-system.js";

export const makeNativeFileStore = (): FileStore => ({
  exists: fs.existsSync,
  makeDirectory: (target) => void fs.mkdirSync(target, { recursive: true }),
  makeTempDirectory: (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))),
  readDirectory: (target) =>
    fs.readdirSync(target, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      type: entry.isSymbolicLink() ? "symlink" : entry.isDirectory() ? "directory" : "file",
    })),
  readFile: (target) => new Uint8Array(fs.readFileSync(target)),
  readFileString: (target) => fs.readFileSync(target, "utf8"),
  readLink: fs.readlinkSync,
  realPath: fs.realpathSync,
  remove: (target) => void fs.rmSync(target, { recursive: true, force: true }),
  type: (target) => {
    try {
      const entry = fs.lstatSync(target);
      if (entry.isSymbolicLink()) return "symlink";
      return entry.isDirectory() ? "directory" : "file";
    } catch {
      return undefined;
    }
  },
  writeFile: fs.writeFileSync,
});
