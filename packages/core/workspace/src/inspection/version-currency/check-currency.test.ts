import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { checkCurrency } from "./check-currency.js";
import { makeExtensionIndex } from "./test-stubs.js";

const v = decodeVersionSync;

const makeIndex = (versions: ReadonlyArray<string>) =>
  makeExtensionIndex("test-ext", "skill", versions);

describe("checkCurrency", () => {
  it("returns current when installed version matches latest", () => {
    const index = makeIndex(["1.2.0", "1.1.0", "1.0.0"]);
    const result = checkCurrency(v("1.2.0"), Option.none(), index);

    expect(result.status).toBe("current");
    expect(result.installedVersion).toBe("1.2.0");
    expect(Option.getOrThrow(result.latestMatching)).toBe("1.2.0");
    expect(result.latestAvailable).toBe("1.2.0");
  });

  it("returns update-available when a newer minor/patch version exists", () => {
    const index = makeIndex(["1.3.0", "1.2.0", "1.1.0"]);
    const result = checkCurrency(v("1.2.0"), Option.some("^1.0.0"), index);

    expect(result.status).toBe("update-available");
    expect(result.installedVersion).toBe("1.2.0");
    expect(Option.getOrThrow(result.latestMatching)).toBe("1.3.0");
    expect(result.latestAvailable).toBe("1.3.0");
  });

  it("returns major-update-available when latest has a higher major version", () => {
    const index = makeIndex(["2.0.0", "1.2.0", "1.1.0"]);
    const result = checkCurrency(v("1.2.0"), Option.some("^1.0.0"), index);

    expect(result.status).toBe("major-update-available");
    expect(result.installedVersion).toBe("1.2.0");
    expect(Option.getOrThrow(result.latestMatching)).toBe("1.2.0");
    expect(result.latestAvailable).toBe("2.0.0");
  });

  it("returns major-update-available when installed is current within constraint but major exists", () => {
    const index = makeIndex(["3.0.0", "2.1.0", "2.0.0", "1.0.0"]);
    const result = checkCurrency(v("2.1.0"), Option.some("^2.0.0"), index);

    expect(result.status).toBe("major-update-available");
    expect(result.installedVersion).toBe("2.1.0");
    expect(Option.getOrThrow(result.latestMatching)).toBe("2.1.0");
    expect(result.latestAvailable).toBe("3.0.0");
  });

  it("returns update-available with no constraint when newer version exists", () => {
    const index = makeIndex(["1.5.0", "1.2.0", "1.0.0"]);
    const result = checkCurrency(v("1.2.0"), Option.none(), index);

    expect(result.status).toBe("update-available");
    expect(Option.getOrThrow(result.latestMatching)).toBe("1.5.0");
    expect(result.latestAvailable).toBe("1.5.0");
  });

  it("returns current when the installed version is newer than the registry latest", () => {
    const index = makeIndex(["0.2.2", "0.2.1"]);
    const result = checkCurrency(v("0.2.3"), Option.none(), index);

    expect(result.status).toBe("current");
    expect(Option.getOrThrow(result.latestMatching)).toBe("0.2.2");
    expect(result.latestAvailable).toBe("0.2.2");
  });

  it("handles latestMatching as none when no version satisfies constraint", () => {
    const index = makeIndex(["2.0.0", "1.0.0"]);
    const result = checkCurrency(v("0.9.0"), Option.some("^0.9.0"), index);

    expect(result.status).toBe("major-update-available");
    expect(Option.isNone(result.latestMatching)).toBe(true);
    expect(result.latestAvailable).toBe("2.0.0");
  });

  it("handles single-version index where installed is current", () => {
    const index = makeIndex(["1.0.0"]);
    const result = checkCurrency(v("1.0.0"), Option.none(), index);

    expect(result.status).toBe("current");
    expect(Option.getOrThrow(result.latestMatching)).toBe("1.0.0");
    expect(result.latestAvailable).toBe("1.0.0");
  });

  it("handles single-version index where installed is behind", () => {
    const index = makeIndex(["2.0.0"]);
    const result = checkCurrency(v("1.0.0"), Option.none(), index);

    expect(result.status).toBe("major-update-available");
    expect(Option.getOrThrow(result.latestMatching)).toBe("2.0.0");
    expect(result.latestAvailable).toBe("2.0.0");
  });
});
