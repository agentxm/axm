/**
 * Complete local packages for the authoring transitions this package owns.
 *
 * Demotion replaces workspace authorship with an external source, so its
 * examples need a package of every authored type — written the way the
 * product writes one — in both the authored location (`<root>/<plural>/<name>`)
 * and as a replacement source under `<root>/vendor/<name>`.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import { unzipSync } from "fflate";

import { previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import {
  DEFAULT_AUTHORED_DIRECTORIES,
  SETTINGS_ENTRY_KEYS,
} from "@agentxm/workspace-kernel/workspace-state";

import { writeMinimalPackage } from "../../testing/local-packages.js";
import { DemoteToExternalSource, type DemoteRequest } from "./demote-to-external-source.js";

const authoringRow = <T extends ExtensionType>(type: T) => ({
  type,
  plural: DEFAULT_AUTHORED_DIRECTORIES[type],
  settingsKey: SETTINGS_ENTRY_KEYS[type],
  manifest: manifestFilenameForType(type),
});

/** One authored extension type, and how the workspace spells it everywhere. */
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

export const writePackageFile = (root: string, relative: string, content: string): void => {
  const target = nodePath.join(root, relative);
  fs.mkdirSync(nodePath.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};

/**
 * Write a complete package of one authored type: its minimal package with a
 * license, plus `notes.txt`. Without `parent` it lands under `vendor/<name>`
 * as an external source; with it, under the authored root the workspace owns.
 */
export const writeAuthoringPackage = (
  root: string,
  row: AuthoringType,
  name: string,
  options: { readonly parent?: string; readonly version?: string; readonly owner?: string } = {},
): string =>
  writeMinimalPackage(
    nodePath.join(root, options.parent ?? "vendor", name),
    row.type,
    {
      name,
      version: options.version ?? "1.2.3",
      owner: options.owner ?? "@acme",
      license: "MIT",
    },
    { "notes.txt": "Author notes preserved across the operation.\n" },
  );

/**
 * Expand a published version archive into a directory, so an example can
 * compare realized canonical content against the bytes the Registry serves
 * without shelling out to an archiver.
 */
export const extractArchive = (archivePath: string, destination: string): string => {
  const files = unzipSync(fs.readFileSync(archivePath));
  for (const [relative, bytes] of Object.entries(files)) {
    if (relative.endsWith("/")) continue;
    const target = nodePath.join(destination, relative);
    fs.mkdirSync(nodePath.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  return destination;
};

/** Settle a demotion and preview it: nothing is written. */
export const previewDemote = (request: DemoteRequest) =>
  Effect.gen(function* () {
    const candidate = yield* DemoteToExternalSource.prepare(request);
    return yield* DemoteToExternalSource.previewOrApply(candidate, previewPlanExecution);
  });

/** Settle a demotion and apply it. */
export const applyDemote = (request: DemoteRequest) =>
  Effect.gen(function* () {
    const candidate = yield* DemoteToExternalSource.prepare(request);
    return yield* DemoteToExternalSource.previewOrApply(candidate, preapprovedPlanExecution);
  });
