import { describe, expect, it, vi } from "vitest";
import {
  contentIntegrity,
  readNpmPublication,
  distributeRelease,
  guardPublicationVersion,
  publishImmutable,
  SupersededRelease,
  type PublicationStates,
} from "./release-publication.js";
import { prepareFormula } from "./release-formula.js";

const bytes = new TextEncoder().encode("candidate");
const integrity = contentIntegrity(bytes);

describe("immutable release publication", () => {
  it("publishes an absent output once and verifies its readback", async () => {
    let stored: string | null = null;
    const publish = vi.fn(async () => {
      stored = integrity;
    });
    const read = async () => stored;
    await expect(publishImmutable({ name: "candidate", integrity, read, publish })).resolves.toBe(
      "published",
    );
    await expect(publishImmutable({ name: "candidate", integrity, read, publish })).resolves.toBe(
      "reused",
    );
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it("rejects different content without overwriting it", async () => {
    const publish = vi.fn(async () => undefined);
    await expect(
      publishImmutable({ name: "candidate", integrity, read: async () => "different", publish }),
    ).rejects.toThrow("integrity conflict");
    expect(publish).not.toHaveBeenCalled();
  });
  it.each(["network", "authorization"])(
    "preserves %s existence failures without mutation",
    async (failure) => {
      const publish = vi.fn(async () => undefined);
      await expect(
        publishImmutable({
          name: "candidate",
          integrity,
          read: async () => {
            throw new Error(failure);
          },
          publish,
        }),
      ).rejects.toThrow(failure);
      expect(publish).not.toHaveBeenCalled();
    },
  );
  it("does not treat an unverified write as complete", async () => {
    await expect(
      publishImmutable({
        name: "candidate",
        integrity,
        read: async () => null,
        publish: async () => undefined,
      }),
    ).rejects.toThrow("readback failed");
  });
});

describe("distribution ordering and recovery", () => {
  it.each(["artifacts", "npm", "tap"] as const)(
    "records %s failure and permits a rerun to reuse prior outputs",
    async (failed) => {
      const completed = new Set<string>();
      const writes: string[] = [];
      const records: PublicationStates[] = [];
      let failure = true;
      const boundaries = (["artifacts", "npm", "tap"] as const).map((name) => ({
        name,
        publish: async () => {
          if (name === failed && failure) throw new Error("publisher failed");
          if (!completed.has(name)) {
            writes.push(name);
            completed.add(name);
          }
        },
      }));
      await expect(
        distributeRelease(
          async () => undefined,
          boundaries,
          (state) => records.push(state),
        ),
      ).rejects.toThrow("publisher failed");
      expect(records.at(-1)?.[failed]).toBe("failed");
      failure = false;
      await expect(
        distributeRelease(
          async () => undefined,
          boundaries,
          (state) => records.push(state),
        ),
      ).resolves.toBe("distributed");
      expect(writes).toEqual(["artifacts", "npm", "tap"]);
      expect(records.at(-1)).toEqual({
        artifacts: "succeeded",
        npm: "succeeded",
        tap: "succeeded",
      });
    },
  );
  it("stops a superseded candidate before any historical publication repair", async () => {
    const publish = vi.fn(async () => undefined);
    await expect(
      distributeRelease(
        async () => {
          guardPublicationVersion("1.2.3", "1.2.4", "npm");
        },
        [{ name: "artifacts", publish }],
        () => undefined,
      ),
    ).resolves.toBe("superseded");
    expect(publish).not.toHaveBeenCalled();
  });
  it.each(["npm", "Homebrew", "stable"])(
    "guards an older candidate at the %s write boundary",
    (owner) => {
      expect(() => guardPublicationVersion("1.2.3", "1.3.0", owner)).toThrow(SupersededRelease);
      expect(() => guardPublicationVersion("1.3.0", "1.2.3", owner)).not.toThrow();
      expect(() => guardPublicationVersion("1.3.0", "1.3.0", owner)).not.toThrow();
    },
  );
});

const assets = ["axm-darwin-arm64", "axm-darwin-x64", "axm-linux-arm64", "axm-linux-x64"];
const hashes = new Map(assets.map((name) => [name, "a".repeat(64)]));
const formula = (version: string) =>
  `class Axm < Formula\n  version "${version}"\n${assets.map((name) => `  url "https://github.com/agentxm/axm/releases/download/cli-v${version}/${name}"\n  sha256 "${"a".repeat(64)}"`).join("\n")}\nend\n`;

describe("Homebrew formula identity", () => {
  it("reuses an identical coordinate and all four descriptors", () => {
    expect(prepareFormula(formula("1.2.3"), "1.2.3", "agentxm/axm", hashes).changed).toBe(false);
  });
  it("updates all four immutable URLs with their checksums", () => {
    expect(prepareFormula(formula("1.2.2"), "1.2.3", "agentxm/axm", hashes).content).toBe(
      formula("1.2.3"),
    );
  });
  it.each(assets)("rejects equal-version wrong bytes for %s", (name) => {
    const changed = new Map(hashes).set(name, "b".repeat(64));
    expect(() => prepareFormula(formula("1.2.3"), "1.2.3", "agentxm/axm", changed)).toThrow(
      "integrity conflict",
    );
  });
  it("rejects equal-version wrong artifact coordinates", () => {
    expect(() =>
      prepareFormula(
        formula("1.2.3").replace("github.com/agentxm/", "github.com/other/"),
        "1.2.3",
        "agentxm/axm",
        hashes,
      ),
    ).toThrow("integrity conflict");
  });
  it("retains a newer formula", () => {
    expect(() => prepareFormula(formula("1.3.0"), "1.2.3", "agentxm/axm", hashes)).toThrow(
      SupersededRelease,
    );
  });
});

describe("npm publication observations", () => {
  it.each([401, 403, 429, 503])("does not interpret HTTP %i as absence", async (status) => {
    await expect(
      readNpmPublication("axm.sh", "1.2.3", async () => new Response(null, { status })),
    ).rejects.toThrow(`HTTP ${status}`);
  });
  it("distinguishes a missing coordinate from an invalid published descriptor", async () => {
    const response = (versions: unknown) => async () =>
      new Response(JSON.stringify({ "dist-tags": { latest: "1.2.4" }, versions }));
    await expect(readNpmPublication("axm.sh", "1.2.3", response({}))).resolves.toEqual({
      latest: "1.2.4",
      integrity: null,
    });
    await expect(
      readNpmPublication("axm.sh", "1.2.3", response({ "1.2.3": {} })),
    ).rejects.toThrow();
    await expect(
      readNpmPublication(
        "axm.sh",
        "1.2.3",
        response({ "0.1.0": {}, "1.2.3": { dist: { integrity } } }),
      ),
    ).resolves.toEqual({ latest: "1.2.4", integrity });
  });
});
