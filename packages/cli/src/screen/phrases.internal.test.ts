import { describe, expect, it } from "vitest";

import {
  blockingHeadline,
  interruptionPhrase,
  publishDisposition,
  publishParticipation,
  publishReason,
} from "./phrases.js";

describe("human vocabulary", () => {
  it("uses human phrases for publish decisions", () => {
    expect(publishParticipation("verified-existing")).toBe("already published and verified");
    expect(publishDisposition("not-authored")).toBe("not authored here");
    expect(publishReason("unmatched_selector")).toBe("selector did not match");
    expect(publishReason("settlement_unresolved")).toBe(
      "registry settlement could not be verified",
    );
  });

  it("keeps interruption and blocking outcomes distinct", () => {
    expect(interruptionPhrase("SIGINT", "restored")).toBe("Interrupted — changes rolled back");
    expect(interruptionPhrase("SIGTERM", "retained")).toBe("Terminated — partial work retained");
    expect(blockingHeadline("resource-conflict")).toBe("Workspace is busy");
  });
});
