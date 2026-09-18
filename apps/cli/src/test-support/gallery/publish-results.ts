import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  normalizePublishResult,
  type PublishResultInput,
  type PublishResultItem,
} from "@agentxm/workspace/publishing";

import type { VerbosityLevel } from "../../cli-flags/index.js";
import { publishDoc } from "../../root/publish/view.js";
import type { Doc } from "../../screen/doc.js";
import { exactVersion, extensionName, handle } from "../test-stubs.js";

type Kind = "skill" | "subagent" | "pack";

const plural: Record<Kind, string> = { skill: "skills", subagent: "subagents", pack: "packs" };

/** One extension the canvas's publish boards carry, before the run decides its outcome. */
export const candidate = (
  kind: Kind,
  name: string,
  version: string,
  archive: { readonly files: number; readonly zipBytes: number },
): PublishResultItem => ({
  id: `@acme/${plural[kind]}/${name}`,
  owner: handle("@acme"),
  type: kind,
  name: extensionName(name),
  version: exactVersion(version),
  action: "publish",
  phase: "authoritative_preflight",
  reason: "selected",
  status: "pending",
  visibility: { value: "public", disposition: "establish", source: "manifest" },
  sourceState: {
    basis: "git-head",
    status: "matches-head",
    revision: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    directory: `${plural[kind]}/${name}`,
    differences: [],
    differenceCount: 0,
    truncated: false,
  },
  archive: {
    included: [{ path: "SKILL.md", size: 2_048, matchedPatterns: [] }],
    excluded: [],
    patterns: [],
    warnings: [],
    includedCount: archive.files,
    excludedCount: 0,
    uncompressedBytes: archive.zipBytes * 2,
    zipBytes: archive.zipBytes,
    integrity: "sha256-canvas",
  },
});

export const codeReview = candidate("skill", "code-review", "1.4.0", {
  files: 42,
  zipBytes: 380_000,
});
export const reviewer = candidate("subagent", "reviewer", "0.9.0", { files: 3, zipBytes: 4_000 });
export const reviewKit = candidate("pack", "review-kit", "2.1.0", { files: 1, zipBytes: 900 });

/** A version the registry already holds, verified as an exact archive match. */
export const triage: PublishResultItem = {
  ...candidate("skill", "triage", "2.0.1", { files: 6, zipBytes: 12_000 }),
  action: "skip",
  reason: "version_already_published",
  status: "success",
  visibility: { value: "public", disposition: "preserve", source: "existing" },
};

/**
 * The publication set the registry admitted: the pack is published after the
 * two members it contains, and the existing version is verified in place.
 */
export const admittedSet = (
  items: ReadonlyArray<PublishResultItem>,
): NonNullable<PublishResultInput["publicationSet"]> => ({
  status: "admitted",
  findings: [],
  items: items.map((item, index) => ({
    id: item.id,
    owner: item.owner,
    type: item.type,
    name: item.name,
    version: exactVersion(item.version ?? "0.0.0"),
    participation: item.reason === "version_already_published" ? "verified-existing" : "publish",
    dependencyIds: item.type === "pack" ? [codeReview.id, reviewer.id] : [],
    dependencyResolutions: [],
    selectionOrder: index,
    dependencyOrder: item.type === "pack" ? 1 : 0,
  })),
});

export const selection = {
  mode: "authored",
  scope: "project",
  owners: [handle("@acme")],
  types: [],
  registry: "agentxm",
  decisions: [],
} satisfies PublishResultInput["selection"];

/** A publish result as the view receives it, painted the way the command prints it. */
export const publishFrame = (
  input: Omit<PublishResultInput, "selection">,
  options: {
    readonly verbosity?: VerbosityLevel;
    readonly exitCode?: number;
    readonly elapsedMs?: number;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
  } = {},
): Doc =>
  publishDoc(normalizePublishResult({ selection, ...input }), {
    verbosity: options.verbosity ?? "normal",
    exitCode: options.exitCode ?? 0,
    suggestions: options.suggestions ?? [],
    ...(options.elapsedMs === undefined ? {} : { elapsedMs: options.elapsedMs }),
  });
