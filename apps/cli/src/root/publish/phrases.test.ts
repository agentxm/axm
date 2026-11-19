import { describe, expect, it } from "vitest";

import { publishDisposition, publishParticipation, publishReason } from "./phrases.js";

describe("publish vocabulary", () => {
  it("uses human phrases for publish decisions", () => {
    expect(publishParticipation("verified-existing")).toBe("skip");
    expect(publishDisposition("not-authored")).toBe("not authored here");
    expect(publishReason("version_already_published")).toBe("version already published");
    expect(publishReason("unmatched_selector")).toBe("selector did not match");
    expect(publishReason("archived")).toBe("extension is archived");
    expect(publishReason("settlement_unresolved")).toBe(
      "registry settlement could not be verified",
    );
  });
});
