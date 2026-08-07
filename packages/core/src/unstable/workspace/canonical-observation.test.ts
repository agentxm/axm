import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach } from "vitest";
import { computeSkillSourceHash } from "../skills/index.js";
import { computePackageContentHash } from "../extensions/index.js";
import type { ExtensionTrustRecord } from "../trust/index.js";
import { observeCanonicalExtension } from "./canonical-observation.js";
import type { DesiredExtensionNode } from "./desired-state-graph.js";

const desiredSkill = (source = "github:acme/tools//skills/review@main"): DesiredExtensionNode => ({
  type: "skill",
  name: "review",
  identity: source,
  source,
  enabled: true,
  constraints: [],
  origins: [{ type: "settings", source, enabled: true }],
});

const skillTrust = (
  sourceIdentity = "github:acme/tools//skills/review@main",
): ExtensionTrustRecord => ({
  extensionType: "skill",
  name: "review",
  authority: "github",
  sourceIdentity,
  immutableRevision: "tree-abc",
});

layer(NodeServices.layer, { excludeTestServices: true })("canonical observation", (it) => {
  let root: string;

  beforeEach(() => {
    root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-canonical-observation-"));
  });

  afterEach(() => {
    nodeFs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("accepts a usable Git skill when trust matches its configured source", () =>
    Effect.gen(function* () {
      const canonical = nodePath.join(root, ".axm", "extensions", "external", "skills", "review");
      nodeFs.mkdirSync(canonical, { recursive: true });
      nodeFs.writeFileSync(nodePath.join(canonical, "SKILL.md"), "# Review\n");
      const contentIdentity = yield* computeSkillSourceHash(canonical);

      const observed = yield* observeCanonicalExtension({
        baseDir: root,
        desired: desiredSkill(),
        trust: { ...skillTrust(), contentIdentity },
      });

      expect(observed.status).toBe("usable");
      expect(observed.path).toBe(canonical);
    }),
  );

  it.effect("does not reuse canonical content without a trusted content identity", () =>
    Effect.gen(function* () {
      const canonical = nodePath.join(root, ".axm", "extensions", "external", "skills", "review");
      nodeFs.mkdirSync(canonical, { recursive: true });
      nodeFs.writeFileSync(nodePath.join(canonical, "SKILL.md"), "# Review\n");

      const observed = yield* observeCanonicalExtension({
        baseDir: root,
        desired: desiredSkill(),
        trust: skillTrust(),
      });

      expect(observed).toMatchObject({
        status: "wrong-origin",
        path: canonical,
      });
      expect(observed.contentIdentity).toBeDefined();
    }),
  );

  it.effect("rejects same-name canonical content after the configured locator changes", () =>
    Effect.gen(function* () {
      const canonical = nodePath.join(root, ".axm", "extensions", "external", "skills", "review");
      nodeFs.mkdirSync(canonical, { recursive: true });
      nodeFs.writeFileSync(nodePath.join(canonical, "SKILL.md"), "# Review\n");

      const observed = yield* observeCanonicalExtension({
        baseDir: root,
        desired: desiredSkill("github:other/tools//skills/review@main"),
        trust: skillTrust(),
      });

      expect(observed.status).toBe("wrong-origin");
    }),
  );

  it.effect("distinguishes missing trust from a mismatched trusted origin", () =>
    Effect.gen(function* () {
      const observed = yield* observeCanonicalExtension({
        baseDir: root,
        desired: desiredSkill(),
        trust: undefined,
      });

      expect(observed.status).toBe("missing-trust");
    }),
  );

  it.effect("does not reuse a trusted Registry version outside desired constraints", () =>
    Effect.gen(function* () {
      const desired: DesiredExtensionNode = {
        type: "rule",
        name: "release",
        identity: "@acme/rules/release",
        source: "@acme/rules/release@^2.0.0",
        enabled: true,
        constraints: ["^2.0.0"],
        origins: [
          {
            type: "settings",
            source: "@acme/rules/release@^2.0.0",
            enabled: true,
          },
        ],
      };
      const trust: ExtensionTrustRecord = {
        extensionType: "rule",
        name: "release",
        authority: "registry",
        sourceIdentity: "@acme/rules/release",
        resolvedVersion: "1.9.0",
        publisherBindingId: "hbnd_one",
        contentIdentity: "unreached",
      };

      const observed = yield* observeCanonicalExtension({
        baseDir: root,
        desired,
        trust,
      });

      expect(observed.status).toBe("wrong-origin");
    }),
  );

  it.effect("distinguishes corrupt and incomplete packages", () =>
    Effect.gen(function* () {
      const canonical = nodePath.join(root, ".axm", "extensions", "@acme", "rules", "release");
      nodeFs.mkdirSync(canonical, { recursive: true });
      nodeFs.writeFileSync(nodePath.join(canonical, "rule.json"), "{");
      const desired: DesiredExtensionNode = {
        type: "rule",
        name: "release",
        identity: "@acme/rules/release",
        source: "@acme/rules/release@^1.0.0",
        enabled: true,
        constraints: ["^1.0.0"],
        origins: [
          {
            type: "settings",
            source: "@acme/rules/release@^1.0.0",
            enabled: true,
          },
        ],
      };
      const trust: ExtensionTrustRecord = {
        extensionType: "rule",
        name: "release",
        authority: "registry",
        sourceIdentity: "@acme/rules/release",
        resolvedVersion: "1.2.0",
        publisherBindingId: "hbnd_one",
        integrity: "sha512-one",
      };

      expect(
        (yield* observeCanonicalExtension({
          baseDir: root,
          desired,
          trust,
        })).status,
      ).toBe("corrupt");

      nodeFs.writeFileSync(
        nodePath.join(canonical, "rule.json"),
        JSON.stringify({
          owner: "@acme",
          type: "rule",
          name: "release",
          version: "1.2.0",
        }),
      );
      expect(
        (yield* observeCanonicalExtension({
          baseDir: root,
          desired,
          trust,
        })).status,
      ).toBe("incomplete");
    }),
  );

  it.effect("reports local edits against the trusted content identity", () =>
    Effect.gen(function* () {
      const canonical = nodePath.join(root, ".axm", "extensions", "external", "skills", "review");
      nodeFs.mkdirSync(canonical, { recursive: true });
      nodeFs.writeFileSync(nodePath.join(canonical, "SKILL.md"), "# Review\n");
      const contentIdentity = yield* computeSkillSourceHash(canonical);
      nodeFs.writeFileSync(nodePath.join(canonical, "SKILL.md"), "# Locally edited\n");

      const observed = yield* observeCanonicalExtension({
        baseDir: root,
        desired: desiredSkill(),
        trust: { ...skillTrust(), contentIdentity },
      });

      expect(observed.status).toBe("locally-modified");
    }),
  );

  it.effect("includes behavior-bearing rule content in content identity", () =>
    Effect.gen(function* () {
      const canonical = nodePath.join(root, ".axm", "extensions", "@acme", "rules", "release");
      nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(canonical, "rule.json"),
        JSON.stringify({
          owner: "@acme",
          type: "rule",
          name: "release",
          version: "1.2.0",
        }),
      );
      const contentPath = nodePath.join(canonical, "src", "release.md");
      nodeFs.writeFileSync(contentPath, "---\ndescription: Safe\n---\n\nRun release\n");
      const contentIdentity = yield* computePackageContentHash(canonical);
      const desired: DesiredExtensionNode = {
        type: "rule",
        name: "release",
        identity: "@acme/rules/release",
        source: "@acme/rules/release@^1.0.0",
        enabled: true,
        constraints: ["^1.0.0"],
        origins: [
          {
            type: "settings",
            source: "@acme/rules/release@^1.0.0",
            enabled: true,
          },
        ],
      };
      const trust: ExtensionTrustRecord = {
        extensionType: "rule",
        name: "release",
        authority: "registry",
        sourceIdentity: "@acme/rules/release",
        resolvedVersion: "1.2.0",
        publisherBindingId: "hbnd_one",
        contentIdentity,
      };

      expect(
        (yield* observeCanonicalExtension({
          baseDir: root,
          desired,
          trust,
        })).status,
      ).toBe("usable");

      nodeFs.writeFileSync(contentPath, "---\ndescription: Hijacked\n---\n\nRun release\n");

      expect(
        (yield* observeCanonicalExtension({
          baseDir: root,
          desired,
          trust,
        })).status,
      ).toBe("locally-modified");
    }),
  );
});
