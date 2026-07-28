/**
 * `workspace/recommended-packs-retained` — an installed extension that opts
 * out of standalone use keeps at least one of its recommended packs installed.
 *
 * `standalone: false` says the extension is meaningless on its own. When none
 * of its `recommendedPacks` are installed, the workspace is in exactly the
 * state the manifest author warned about. This rule is what gives `standalone`
 * a reason to exist at install time; publish-time coherence of the same two
 * fields is `<type>/standalone-declaration-valid`'s job.
 *
 * **Naming.** The authoring guide type-shards install rules, but
 * `workspace/packs-members-retained` sets the precedent for a single workspace
 * rule walking every member type in one body — the invariant is identical
 * across types and the finding text differs only by a label. This rule follows
 * that precedent: one rule, no fan-out.
 *
 * **Advisory, not autofixing.** Two of the five autofix criteria fail. Several
 * `recommendedPacks` entries mean several viable installs, so there is no
 * mechanical XOR; and installing a pack pulls in its whole dependency set, so
 * the blast radius is unbounded.
 *
 * One finding per affected extension. Advisory, warning.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { InstalledExtensionManifest, WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import type { Lockfile } from "../../../lockfile/schema.js";
import { splitPackSpec } from "../shared/recommended-packs-rules.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/recommended-packs-retained";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * FQNs of every registry pack the lockfile records as installed. Non-registry
 * pack entries carry no owner, so they cannot match an `@owner/packs/<name>`
 * recommendation and are skipped.
 */
const installedPackFqns = (lockfile: Lockfile): ReadonlySet<string> => {
  const fqns = new Set<string>();
  for (const entry of Object.values(lockfile.packs ?? {})) {
    if (entry.type === "registry") {
      fqns.add(`${entry.owner}/packs/${entry.name}`);
    }
  }
  return fqns;
};

/** Bare pack FQNs a manifest recommends, with any version range stripped. */
const recommendedPackFqns = (manifestJson: unknown): ReadonlyArray<string> => {
  if (!isRecord(manifestJson) || manifestJson["standalone"] !== false) {
    return [];
  }
  const recommended = manifestJson["recommendedPacks"];
  if (!Array.isArray(recommended)) {
    return [];
  }
  return recommended
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => splitPackSpec(entry).fqn);
};

const typeLabel = (extensionType: InstalledExtensionManifest["extensionType"]): string => {
  switch (extensionType) {
    case "skill":
      return "skill";
    case "command":
      return "command";
    case "subagent":
      return "subagent";
    case "mcp-server":
      return "MCP server";
    case "files":
      return "context package";
  }
};

const missingPackFinding = (
  manifest: InstalledExtensionManifest,
  candidates: ReadonlyArray<string>,
): AdvisoryFinding => {
  const label = typeLabel(manifest.extensionType);
  const installPaths =
    candidates.length === 1
      ? `run \`axm packs install ${candidates[0]}\``
      : `run \`axm packs install\` with one of: ${candidates.join(", ")}`;
  return {
    kind: "advisory",
    ruleId: RULE_ID,
    severity: "warning",
    message:
      `${label} '${manifest.name}' is marked as not standalone, so it only works alongside one of its recommended packs, but none of those packs are installed. ` +
      `To complete the setup, ${installPaths}. ` +
      `If this ${label} does work on its own, remove the \`standalone\` key from its manifest.`,
    location: { file: manifest.manifestPath },
  };
};

export const recommendedPacksRetainedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Extensions that are not standalone keep a recommended pack installed.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      const accessor = context.installedExtensions;
      if (accessor === undefined) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const lockfileResult = yield* Effect.result(context.workspace.state.lockfile);
      if (Result.isFailure(lockfileResult) || Option.isNone(lockfileResult.success)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const installed = installedPackFqns(lockfileResult.success.value);

      const findings: Array<AdvisoryFinding> = [];
      for (const manifest of yield* accessor.manifests) {
        const recommended = recommendedPackFqns(manifest.manifestJson);
        // An empty list is `<type>/standalone-declaration-valid`'s finding to
        // make, not this rule's — there is no pack to tell the user to install.
        if (recommended.length === 0) {
          continue;
        }
        if (recommended.some((fqn) => installed.has(fqn))) {
          continue;
        }
        findings.push(missingPackFinding(manifest, recommended));
      }
      return findings;
    }),
};
