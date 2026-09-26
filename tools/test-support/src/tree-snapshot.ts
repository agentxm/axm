import * as path from "node:path";

import type { FileStore } from "./memory-file-system.js";
import { makeNativeFileStore } from "./native-file-store.js";

const encode = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

/** Exact content of a directory tree, including empty directories and links. */
export const snapshotTree = (
  root: string,
  files: FileStore = makeNativeFileStore(),
): Readonly<Record<string, string>> => {
  if (files.type(root) !== "directory") return {};
  const entries: Array<readonly [string, string]> = [];
  const walk = (directory: string, parent: string): void => {
    for (const entry of files.readDirectory(directory)) {
      const relative = parent.length === 0 ? entry.name : `${parent}/${entry.name}`;
      const absolute = path.join(directory, entry.name);
      if (entry.type === "directory") {
        entries.push([relative, "directory"]);
        walk(absolute, relative);
      } else if (entry.type === "symlink") {
        entries.push([relative, `symlink:${files.readLink(absolute)}`]);
      } else {
        entries.push([relative, `file:${encode(files.readFile(absolute))}`]);
      }
    }
  };
  walk(root, "");
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right, "en")));
};

/** Exact content at one path, with a missing path represented by an empty record. */
export const snapshotPath = (
  absolute: string,
  files: FileStore = makeNativeFileStore(),
): Readonly<Record<string, string>> => {
  const type = files.type(absolute);
  if (type === undefined) return {};
  if (type === "directory") return snapshotTree(absolute, files);
  return {
    ".":
      type === "symlink"
        ? `symlink:${files.readLink(absolute)}`
        : `file:${encode(files.readFile(absolute))}`,
  };
};
