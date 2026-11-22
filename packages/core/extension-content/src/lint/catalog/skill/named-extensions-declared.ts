/**
 * `skill/named-extensions-declared` — a skill names another extension only
 * when its manifest declares the relationship.
 *
 * A boundary written as another extension's identity holds only in
 * workspaces that install that extension under that identity. The rule
 * reads `SKILL.md` for qualified identities (`@owner/type-plural/name`) and
 * compares each with what `skill.json` declares:
 *
 * - the skill's own identity is always allowed;
 * - a pack identity must appear in `recommendedPacks`;
 * - any other identity needs at least one recommended pack, because only a
 *   pack declares a member relationship. Pack membership itself is not
 *   checked: the lint run may not hold the recommended pack's manifest.
 *
 * Opt-in at `warning`: it enforces engineering guidance for authors, not a
 * management obligation. Bare local names collide with ordinary words and are
 * not checked.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import {
  parseExtensionFqnParts,
  splitExtensionReference,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { isManifestJsonParseFailure } from "../shared/manifest-json.js";

const RULE_ID = "skill/named-extensions-declared";
const SKILL_MD = "SKILL.md";

const candidateIdentity = /@[a-z0-9][a-z0-9-]*\/[a-z]+\/[a-z0-9][a-z0-9-]*/g;

const manifestRecord = (input: unknown): Readonly<Record<string, unknown>> | undefined =>
  input === undefined || isManifestJsonParseFailure(input) || !Predicate.isReadonlyObject(input)
    ? undefined
    : input;

const recommendedPacks = (manifest: Readonly<Record<string, unknown>>): ReadonlySet<string> => {
  const value = manifest["recommendedPacks"];
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value.flatMap((entry: unknown) =>
      typeof entry === "string" ? [splitExtensionReference(entry).name] : [],
    ),
  );
};

/** Distinct qualified extension identities named in `text`, in first-seen order. */
const namedExtensionIdentities = (text: string): ReadonlyArray<string> => {
  const seen = new Set<string>();
  for (const [match] of text.matchAll(candidateIdentity)) {
    if (parseExtensionFqnParts(match) !== undefined) seen.add(match);
  }
  return [...seen];
};

const undeclaredFinding = (identity: string, reason: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "warning",
  message:
    `SKILL.md names '${identity}', but ${reason}. ` +
    "Declare the relationship in skill.json, or describe the boundary by the work that differs instead of by another extension's name.",
  location: { file: SKILL_MD },
});

export const namedExtensionsDeclaredRule: AdvisoryRule<SkillRuleContext> = {
  id: RULE_ID,
  description: "Skills name other extensions only when the manifest declares the relationship.",
  kind: "advisory",
  enabledByDefault: false,
  severity: "warning",
  check: (context) => {
    const manifest = manifestRecord(context.subject.skillJson);
    const owner = manifest?.["owner"];
    const name = manifest?.["name"];
    if (manifest === undefined || typeof owner !== "string" || typeof name !== "string") {
      return Effect.succeed([]);
    }
    const self = `${owner}/skills/${name}`;
    const packs = recommendedPacks(manifest);
    return context.files.readBytes(SKILL_MD).pipe(
      Effect.map((bytes): ReadonlyArray<AdvisoryFinding> =>
        namedExtensionIdentities(new TextDecoder().decode(bytes)).flatMap(
          (identity): ReadonlyArray<AdvisoryFinding> => {
            if (identity === self || packs.has(identity)) return [];
            if (parseExtensionFqnParts(identity)?.type === "pack") {
              return [undeclaredFinding(identity, "it is not listed in `recommendedPacks`")];
            }
            return packs.size > 0
              ? []
              : [undeclaredFinding(identity, "skill.json declares no `recommendedPacks`")];
          },
        ),
      ),
      Effect.orElseSucceed((): ReadonlyArray<AdvisoryFinding> => []),
    );
  },
};
