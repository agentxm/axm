import { describe, expect, it } from "@effect/vitest";
import { shouldReuseCanonicalInstall } from "./canonical-reuse.js";

describe("shouldReuseCanonicalInstall", () => {
  const base = {
    canonicalExists: true,
    force: false,
    hasIntegrity: true,
    refVersion: "1.2.3",
    lockedVersion: "1.2.3",
  };

  it("reuses an existing tree when the lockfile pins the requested version", () => {
    expect(shouldReuseCanonicalInstall(base)).toBe(true);
  });

  it("never reuses a missing tree", () => {
    expect(shouldReuseCanonicalInstall({ ...base, canonicalExists: false })).toBe(false);
  });

  it("force always re-materializes", () => {
    expect(shouldReuseCanonicalInstall({ ...base, force: true })).toBe(false);
    expect(shouldReuseCanonicalInstall({ ...base, force: true, hasIntegrity: false })).toBe(false);
  });

  it("re-materializes when the requested version differs from the locked version", () => {
    expect(shouldReuseCanonicalInstall({ ...base, lockedVersion: "1.0.0" })).toBe(false);
  });

  it("re-materializes when no lockfile entry exists", () => {
    expect(shouldReuseCanonicalInstall({ ...base, lockedVersion: undefined })).toBe(false);
  });

  it("re-materializes when the ref version is unknown", () => {
    expect(
      shouldReuseCanonicalInstall({ ...base, refVersion: undefined, lockedVersion: undefined }),
    ).toBe(false);
  });

  it("integrity-free refs reuse an existing tree regardless of lock state", () => {
    expect(
      shouldReuseCanonicalInstall({ ...base, hasIntegrity: false, lockedVersion: undefined }),
    ).toBe(true);
  });
});
