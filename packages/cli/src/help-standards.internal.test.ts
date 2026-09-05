/**
 * Standard citations in prose help topics.
 *
 * A spec-tracked extension type is one the catalog grounds in an open standard.
 * Its topic is where a reader decides whether a package will be portable, so
 * the topic has to name the standard by URL rather than describe it. Deriving
 * the cases from the catalog means adding a standard-bearing type fails here
 * until its topic cites the standard, and changing a standard's URL in
 * `standards.ts` fails here until the topic follows.
 */

import { CATALOG_EXTENSION_TYPES } from "@agentxm/extension-model/unstable/extension-types";
import { getStandardForExtensionType } from "@agentxm/extension-workspace";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions";
import { describe, expect, it } from "vitest";

import { HELP_TOPICS, HELP_TOPIC_NAMES } from "./__generated__/help-topics.js";

const topicSource: ReadonlyMap<string, string> = new Map(
  HELP_TOPIC_NAMES.map((name) => [name, HELP_TOPICS[name]]),
);

const citationCases = CATALOG_EXTENSION_TYPES.flatMap((type) => {
  const standard = getStandardForExtensionType(type);
  return standard === null
    ? []
    : [[toExtensionTypePlural(type), standard.name, standard.url] as const];
});

describe("help topic standard citations", () => {
  it.each(citationCases)("axm help %s links the %s standard", (plural, _name, url) => {
    expect(topicSource.get(plural) ?? "").toContain(url);
  });
});
