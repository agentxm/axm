import { describe, expect, it } from "@effect/vitest";
import { decodeStableChannelDocumentSync } from "@agentxm/extension-model/unstable/release-channel";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";
import { stableChannelDocument } from "../testing.js";
import {
  availableStartupUpdate,
  isChannelCacheStale,
  shouldSkipStartupCheck,
  type StartupCheckContext,
} from "./startup-check.js";

const now = DateTime.makeUnsafe("2026-09-12T12:00:00Z");
const context: StartupCheckContext = {
  isJsonOutput: false,
  noUpdateCheckEnv: false,
  isUpgradeCommand: false,
  isNonInteractive: false,
  isStderrTTY: true,
  isAgentSession: false,
};

describe("startup update policy", () => {
  it("keeps the sixty-minute freshness boundary with an explicit clock observation", () => {
    expect(isChannelCacheStale(DateTime.subtractDuration(now, Duration.minutes(59)), now)).toBe(
      false,
    );
    expect(isChannelCacheStale(DateTime.subtractDuration(now, Duration.minutes(60)), now)).toBe(
      false,
    );
    expect(isChannelCacheStale(DateTime.subtractDuration(now, Duration.minutes(61)), now)).toBe(
      true,
    );
  });

  it("suppresses declared contexts and preserves the existing agent-session exception", () => {
    expect(shouldSkipStartupCheck(context)).toBe(false);
    for (const overrides of [
      { isJsonOutput: true },
      { noUpdateCheckEnv: true },
      { isUpgradeCommand: true },
      { isNonInteractive: true },
      { isStderrTTY: false },
    ])
      expect(shouldSkipStartupCheck({ ...context, ...overrides })).toBe(true);
    expect(
      shouldSkipStartupCheck({
        ...context,
        isNonInteractive: true,
        isStderrTTY: false,
        isAgentSession: true,
      }),
    ).toBe(false);
    expect(
      shouldSkipStartupCheck({ ...context, noUpdateCheckEnv: true, isAgentSession: true }),
    ).toBe(true);
  });

  it("offers only a newer validated version from a fresh snapshot", () => {
    const cache = {
      document: decodeStableChannelDocumentSync(stableChannelDocument("2.0.0")),
      etag: null,
      validatedAt: now,
    };
    expect(availableStartupUpdate("1.0.0", cache, now)).toEqual(
      Option.some({ current: "1.0.0", latest: "2.0.0" }),
    );
    for (const local of ["invalid", "2.0.0", "3.0.0"]) {
      expect(availableStartupUpdate(local, cache, now)).toEqual(Option.none());
    }
    expect(
      availableStartupUpdate(
        "1.0.0",
        {
          ...cache,
          validatedAt: DateTime.subtractDuration(now, Duration.minutes(61)),
        },
        now,
      ),
    ).toEqual(Option.none());
  });
});
