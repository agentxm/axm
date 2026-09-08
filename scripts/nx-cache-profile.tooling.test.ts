import { describe, expect, it } from "vitest";
import { classifyCacheOutcome, taskRecordsFromProfile } from "./nx-cache-profile.js";

describe("Nx cache profile reporting", () => {
  it.each([
    [false, "success", false, "noncacheable"],
    [true, "success", true, "bypass"],
    [true, "local-cache", false, "local-hit"],
    [true, "remote-cache", false, "remote-hit"],
    [true, "success", false, "miss"],
    [true, "skipped", false, "skipped"],
    [undefined, "success", false, "unknown"],
  ])("classifies cache=%s status=%s bypass=%s as %s", (cache, status, bypass, expected) => {
    expect(classifyCacheOutcome(cache, status, bypass)).toBe(expected);
  });

  it("retains identity, status, timing, and cache timing limitations", () => {
    const records = taskRecordsFromProfile(
      [
        {
          name: "client:build",
          ph: "X",
          dur: 12_000,
          args: { target: { project: "client", target: "build" }, status: "local-cache" },
        },
      ],
      {
        graph: { nodes: { client: { data: { targets: { build: { cache: true } } } } } },
      },
      false,
    );
    expect(records).toEqual([
      expect.objectContaining({
        task: "client:build",
        taskHash: null,
        cacheOutcome: "local-hit",
        timing: { durationMs: 12, unavailableReason: null },
        cacheRead: expect.objectContaining({ lookupDurationMs: null, restoreDurationMs: 12 }),
      }),
    ]);
  });

  it("preserves partial and failed task outcomes instead of dropping the profile", () => {
    const records = taskRecordsFromProfile(
      [
        {
          name: "client:build",
          ph: "X",
          dur: 5_000,
          args: { target: { project: "client", target: "build" }, status: "failure" },
        },
        { name: "incomplete", ph: "B", args: {} },
      ],
      { graph: { nodes: { client: { data: { targets: { build: { cache: true } } } } } } },
      false,
    );
    expect(records).toEqual([
      expect.objectContaining({ task: "client:build", status: "failure", cacheOutcome: "miss" }),
    ]);
  });
});
