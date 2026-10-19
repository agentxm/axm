import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";

import { resolveAxmCacheRootPure } from "./cache-root.js";

describe("resolveAxmCacheRootPure", () => {
  it("resolves the platform-native cache root", () => {
    expect(resolveAxmCacheRootPure(nodePath.join, "darwin", "/Users/test", {})).toBe(
      nodePath.join("/Users/test", "Library", "Caches", "axm"),
    );
    expect(
      resolveAxmCacheRootPure(nodePath.join, "linux", "/home/test", {
        xdgCacheHome: "/var/cache/test",
      }),
    ).toBe(nodePath.join("/var/cache/test", "axm"));
    expect(
      resolveAxmCacheRootPure(nodePath.win32.join, "win32", "C:\\Users\\test", {
        localAppData: "D:\\LocalData",
      }),
    ).toBe(nodePath.win32.join("D:\\LocalData", "axm", "cache"));
  });

  it("uses AXM_USER_HOME as a hermetic cache-home override", () => {
    expect(
      resolveAxmCacheRootPure(nodePath.join, "linux", "/home/test", {
        axmUserHome: "/tmp/axm-home",
        xdgCacheHome: "/var/cache/test",
      }),
    ).toBe(nodePath.join("/tmp/axm-home", ".cache", "axm"));
  });
});
