import { describe, expect, it } from "@effect/vitest";

import { publishAuthenticationPreconditions } from "./authorization.js";

describe("publish authentication preconditions", () => {
  it("reports authentication as a human-blocked preview precondition only when needed", () => {
    expect(
      publishAuthenticationPreconditions({
        preview: true,
        remoteRegistry: true,
        authenticated: false,
        hasPublishCandidates: true,
      }),
    ).toEqual([
      {
        id: "authentication",
        label: "Sign-in",
        status: "unmet",
        detail: "Publishing requires you to be signed in. Run `axm login`, then publish.",
        blockedOn: "human",
      },
    ]);

    expect(
      [
        { preview: false, remoteRegistry: true, authenticated: false },
        { preview: true, remoteRegistry: false, authenticated: false },
        { preview: true, remoteRegistry: true, authenticated: true },
      ].map((options) =>
        publishAuthenticationPreconditions({ ...options, hasPublishCandidates: true }),
      ),
    ).toEqual([[], [], []]);
  });
});
