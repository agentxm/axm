import { describe, expect, it } from "vitest";
import { parseSyscallSummary } from "../benchmarks/cli-operations/diagnostics.js";

describe("compiled CLI syscall evidence", () => {
  it("distinguishes failed syscalls from successful reads without treating totals as another operation", () => {
    expect(
      parseSyscallSummary(`% time     seconds  usecs/call     calls    errors syscall
 52.80    0.000340           7        48         4 openat
 16.93    0.000109           2        46           read
100.00    0.000644           4       137        23 total
`),
    ).toEqual({ openat: { calls: 48, errors: 4 }, read: { calls: 46, errors: 0 } });
  });

  it("refuses empty or malformed diagnostic evidence", () => {
    expect(() => parseSyscallSummary("strace: permission denied")).toThrow("No syscall evidence");
    expect(() => parseSyscallSummary("1.0 0.01 5 1 2 openat")).toThrow("Invalid syscall summary");
  });
});
