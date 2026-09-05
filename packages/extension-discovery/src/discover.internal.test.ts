import { describe, expect, it } from "@effect/vitest";

import type { PackageUrlParts } from "@agentxm/extension-model/unstable/packaging/package-url";
import { purlMatch } from "@agentxm/registry-client";
import { packageType } from "./test-helpers.js";

// -----------------------------------------------------------------------------
// purlMatch in discover context
// -----------------------------------------------------------------------------

const makeParts = (overrides?: {
  readonly type?: string;
  readonly namespace?: string;
  readonly name?: string;
  readonly version?: string;
}): PackageUrlParts => ({
  type: packageType(overrides?.type ?? "npm"),
  name: overrides?.name ?? "react",
  ...(overrides?.namespace ? { namespace: overrides.namespace } : {}),
  ...(overrides?.version ? { version: overrides.version } : {}),
});

describe("purlMatch in discover context", () => {
  it("matches exact type, name, and version", () => {
    const detected = makeParts({ version: "18.2.0" });
    const declared = makeParts({ version: "18.2.0" });
    expect(purlMatch(detected, declared)).toBe(true);
  });

  it("matches scoped (namespaced) packages", () => {
    const detected = makeParts({ namespace: "@scope", name: "package", version: "2.0.0" });
    const declared = makeParts({ namespace: "@scope", name: "package", version: "2.0.0" });
    expect(purlMatch(detected, declared)).toBe(true);
  });

  it("matches when declared version is absent (compatible with any detected version)", () => {
    // A versionless declaration means "compatible with any version".
    // This is the typical discover scenario: the registry declares a package
    // type and name, and the user's project has a specific version installed.
    const detected = makeParts({ version: "18.2.0" });
    const declared = makeParts(); // no version
    expect(purlMatch(detected, declared)).toBe(true);
  });

  it("does not match when identity differs", () => {
    const detected = makeParts({ type: "npm", name: "react", version: "18.2.0" });
    const declared = makeParts({ type: "pypi", name: "flask", version: "3.0.0" });
    expect(purlMatch(detected, declared)).toBe(false);
  });
});
