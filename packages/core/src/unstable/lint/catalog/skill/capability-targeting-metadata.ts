/** Keep `enhances` metadata aligned with the source's `when` condition union. */

import * as Effect from "effect/Effect";
import YAML from "yaml";

import { renderCapabilityTargetedMarkdown } from "../../../capability-targeting/render.js";
import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "skill/capability-targeting-metadata";
const SKILL_MD = "SKILL.md";
const decoder = new TextDecoder();

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringArray = (value: unknown): ReadonlyArray<string> | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;

const manifestEnhances = (value: unknown): ReadonlyArray<string> | undefined =>
  isRecord(value) ? stringArray(value["enhances"]) : undefined;

const frontmatterEnhances = (content: string): ReadonlyArray<string> | undefined => {
  if (!content.startsWith("---")) return undefined;
  const openingEnd = content.indexOf("\n");
  const closing = content.indexOf("\n---", openingEnd + 1);
  if (openingEnd === -1 || closing === -1) return undefined;
  try {
    const parsed: unknown = YAML.parse(content.slice(openingEnd + 1, closing));
    if (!isRecord(parsed)) return undefined;
    const metadata = parsed["metadata"];
    if (!isRecord(metadata)) return undefined;
    const axm = metadata["axm"];
    return isRecord(axm) ? stringArray(axm["enhances"]) : undefined;
  } catch {
    return undefined;
  }
};

const arraysEqual = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);

export const capabilityTargetingMetadataRule: AdvisoryRule<SkillRuleContext> = {
  id: RULE_ID,
  description: "Capability targeting metadata equals the union of source when conditions.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      if (!(yield* context.files.exists(SKILL_MD))) return [];
      const bytes = yield* context.files.readBytes(SKILL_MD).pipe(Effect.option);
      if (bytes._tag === "None") return [];
      const content = decoder.decode(bytes.value);
      const rendered = renderCapabilityTargetedMarkdown(content, {
        agentId: "universal",
        inheritedAgentIds: [],
        capabilities: {},
        tokens: {},
      });
      if (rendered.referencedConditions.length === 0) return [];

      const declared =
        manifestEnhances(context.subject.skillJson) ?? frontmatterEnhances(content) ?? [];
      const expected = [...rendered.referencedConditions].sort();
      const actual = [...declared].sort();
      if (arraysEqual(actual, expected)) return [];

      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "warning",
          message: `Declared enhances [${actual.join(", ")}] must equal source conditions [${expected.join(", ")}].`,
          location: {
            file: context.subject.isNative ? "skill.json" : SKILL_MD,
          },
        } satisfies AdvisoryFinding,
      ];
    }),
};
