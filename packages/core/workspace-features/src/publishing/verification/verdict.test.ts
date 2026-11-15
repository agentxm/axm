import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "@effect/vitest";

import {
  assessArchive,
  assessIdentity,
  assessPresence,
  type CapturedFailure,
  type PresenceEvidence,
} from "./verdict.js";

const failure: CapturedFailure = { category: "network", message: "The Registry is unreachable." };

const listed: PresenceEvidence = {
  kind: "listed",
  observed: {
    integrity: "sha512-recorded",
    publisherBindingId: "binding-1",
    published: DateTime.makeUnsafe("2026-11-14T10:02:11Z"),
    yanked: false,
  },
};

const unobserved: ReadonlyArray<readonly [string, PresenceEvidence, string]> = [
  [
    "the extension returns no metadata",
    { kind: "extension-unavailable" },
    "because the Registry returned no extension metadata.",
  ],
  [
    "the version is not listed",
    { kind: "version-missing" },
    "because the selected version is not listed.",
  ],
  [
    "selection metadata failed",
    { kind: "failed", failure },
    "because Registry selection metadata is unavailable.",
  ],
];

/**
 * Coverage reasons are shared verbatim by every release that has them, so a
 * renderer can state one reason once for many releases. Each reason therefore
 * reads correctly without naming or pointing at a single release.
 */
describe("Release verification coverage reasons", () => {
  it("states a presence failure without pointing at one release", () => {
    expect(assessPresence({ kind: "failed", failure })).toEqual({
      coverage: {
        state: "incomplete",
        reasons: ["The Registry did not return selection metadata."],
      },
      conclusion: "unknown",
      failure,
    });
  });

  it.each(unobserved)(
    "states why identity and archive are unknown when %s",
    (_, presence, cause) => {
      expect(assessIdentity(presence, { integrity: "sha512-expected" })).toEqual({
        coverage: { state: "incomplete", reasons: [`No recorded integrity was observed ${cause}`] },
        conclusion: "unknown",
      });
      expect(assessArchive(presence, undefined)).toEqual({
        coverage: { state: "incomplete", reasons: [`No archive was read ${cause}`] },
        conclusion: "unknown",
      });
    },
  );

  it.each([
    ["none-supplied", "No expected integrity was supplied."],
    ["not-prepared", "The publish result records no prepared archive."],
  ] as const)(
    "states why identity is not assessed when the expectation is %s",
    (absence, reason) => {
      expect(assessIdentity(listed, absence)).toEqual({
        coverage: { state: "not-applicable", reason },
        conclusion: "not-applicable",
      });
    },
  );

  it("states archive reads that were not attempted or did not succeed", () => {
    expect(assessArchive(listed, undefined)).toEqual({
      coverage: {
        state: "incomplete",
        reasons: ["No archive was read because no admitted read was attempted."],
      },
      conclusion: "unknown",
    });
    expect(assessArchive(listed, { kind: "failed", failure })).toEqual({
      coverage: {
        state: "incomplete",
        reasons: [
          "No archive matching the recorded integrity was obtained through an admitted read.",
        ],
      },
      conclusion: "unknown",
      failure,
    });
  });
});
