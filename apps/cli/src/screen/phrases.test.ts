import { describe, expect, it } from "vitest";

import {
  interruptionPhrase,
  publishDisposition,
  publishParticipation,
  publishReason,
  remainingTime,
} from "./phrases.js";

describe("human vocabulary", () => {
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

  it("keeps interruption outcomes distinct", () => {
    expect(interruptionPhrase("SIGINT", "restored")).toBe("Interrupted - changes rolled back");
    expect(interruptionPhrase("SIGTERM", "retained")).toBe("Terminated - partial work retained");
  });

  it("says how long is left as minutes and zero-padded seconds", () => {
    expect(remainingTime(292_000)).toBe("4:52 left");
    expect(remainingTime(600_000)).toBe("10:00 left");
    expect(remainingTime(45_000)).toBe("0:45 left");
    expect(remainingTime(1)).toBe("0:01 left");
    expect(remainingTime(0)).toBe("expired");
  });
});
