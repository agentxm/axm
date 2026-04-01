import { describe, expect, it } from "vitest";

import { extractReleaseNotesForVersion } from "./release-notes.js";

describe("extractReleaseNotesForVersion", () => {
  it("returns the matching release section", () => {
    const changelog = `## 0.2.0 (2026-04-02)

### Features

- Add release note extraction

## 0.1.0 (2026-04-01)

### Fixes

- Keep changelog as source of truth
`;

    expect(extractReleaseNotesForVersion(changelog, "0.2.0")).toBe(`## 0.2.0 (2026-04-02)

### Features

- Add release note extraction`);
  });

  it("throws when the requested version is missing", () => {
    expect(() => extractReleaseNotesForVersion("## 0.1.0 (2026-04-01)", "0.2.0")).toThrow(
      "Could not find CHANGELOG entry for version 0.2.0.",
    );
  });
});
