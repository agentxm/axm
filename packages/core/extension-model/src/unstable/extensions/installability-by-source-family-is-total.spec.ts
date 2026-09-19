import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  extensionSourceFamilies,
  extensionTypes,
  extensionTypesInstallableFrom,
  isInstallableFrom,
} from "./common.js";

export const specification = defineSpecification({
  requirement: "extension-installability/source-family-policy-is-total",
  title: "Every extension type decides installability for every source family",
  statement:
    "Installability by source family shall be a total policy over every extension type, and every extension type shall be installable from Git, registry, path, and workspace sources.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Installability by source family", () => {
  it.each(extensionSourceFamilies)("makes every extension type installable from %s", (family) => {
    expect(extensionTypesInstallableFrom(family)).toEqual(extensionTypes);
    expect(extensionTypes.every((type) => isInstallableFrom(type, family))).toBe(true);
  });
});
