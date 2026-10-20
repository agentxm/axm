/**
 * Complete, valid packages of every extension type, written into a real
 * directory.
 *
 * Fork, adoption, and native import all read content a person already has, so
 * their specifications need real packages on disk rather than doubles: a
 * manifest the content schemas accept plus the canonical body each type
 * carries, and one extra file whose bytes prove the operation copied or moved
 * the whole package rather than a manifest.
 *
 * @internal Test-only. Not part of the package's public API.
 */

import * as nodePath from "node:path";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import {
  DEFAULT_AUTHORED_DIRECTORIES,
  SETTINGS_ENTRY_KEYS,
} from "@agentxm/workspace-kernel/workspace-state";

import { writeMinimalPackage } from "../../testing/local-packages.js";

const authoringRow = <T extends ExtensionType>(type: T) => ({
  type,
  plural: DEFAULT_AUTHORED_DIRECTORIES[type],
  settingsKey: SETTINGS_ENTRY_KEYS[type],
  manifest: manifestFilenameForType(type),
});

/** The seven types, with the names their settings and manifests use. */
export const authoringTypes = [
  authoringRow("skill"),
  authoringRow("subagent"),
  authoringRow("mcp-server"),
  authoringRow("rule"),
  authoringRow("hook"),
  authoringRow("knowledge"),
  authoringRow("pack"),
] as const;

export type AuthoringType = (typeof authoringTypes)[number];

/** The row for one extension type. */
export const authoringTypeFor = (type: AuthoringType["type"]): AuthoringType => {
  const row = authoringTypes.find((candidate) => candidate.type === type);
  if (row === undefined) throw new Error(`No authoring row for ${type}`);
  return row;
};

/**
 * Write a complete package of one type under `root`: the type's minimal
 * package with a license, plus `notes.txt`, whose bytes prove an operation
 * carried the whole package rather than its manifest.
 *
 * By default it lands in `vendor/<name>`, the shape a fork or import reads
 * from; `parent` relocates it, which is how an adoption's acquired copy is
 * placed under the workspace's own acquired root.
 */
export const writeAuthoringPackage = (
  root: string,
  row: AuthoringType,
  name: string,
  options: {
    readonly parent?: string;
    readonly version?: string;
    readonly owner?: string;
    readonly description?: string;
  } = {},
): string =>
  writeMinimalPackage(
    nodePath.join(root, options.parent ?? "vendor", name),
    row.type,
    {
      name,
      owner: options.owner ?? "@acme",
      version: options.version ?? "1.2.3",
      ...(options.description === undefined ? {} : { description: options.description }),
      license: "MIT",
    },
    { "notes.txt": "Author notes preserved across the operation.\n" },
  );
