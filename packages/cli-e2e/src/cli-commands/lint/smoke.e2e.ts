/**
 * Cross-repo smoke test (Phase 7 task 7.13).
 *
 * Exercises the end-to-end CLI ↔ registry contract against a `file://`
 * registry (the local-file source backend the CLI supports), which stands
 * in for a live registry over HTTP. The HTTP publish handler's lint gate
 * is covered by `apis/registry/src/lib/publish/lint/pipeline.spec.ts` and
 * `apis/registry/src/routes/extensions/by-owner/by-type/by-name/by-version/publish.spec.ts`
 * in the registry repo; the flows here pin the CLI side:
 *
 * 1. `axm setup` seeds a workspace.
 * 2. `axm skills install <local-source>` plus `axm skills fork` round-trips
 *    a skill through a file-registry bucket.
 * 3. `axm lint` on the resulting workspace surfaces the expected extension
 *    findings (proving the Phase-5 CLI lint reaches into
 *    `.axm/extensions/` and reports accurately on real-installed content).
 * 4. The drift banner fires when a publish-gate rule is weakened locally;
 *    the publish-gate itself remains platform-canonical — proven by the
 *    registry route tests, not here.
 *
 * AXM-453 removed the `<!-- Managed by axm -->` banner that previously
 * tripped `skill/frontmatter-parseable` on every forked skill. To keep
 * the lint-reaches-the-forked-tree assertion deterministic, the test
 * induces the same class of violation directly on the post-fork
 * SKILL.md and asserts the rule fires.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { copySkillsRepoFixture, createTempDir, runCli } from "../../e2e/utils.js";

describe("Phase 7 cross-repo smoke (CLI ↔ file:// registry)", () => {
  it("install → fork → file-registry publish → axm lint surfaces expected findings → drift banner on override", async () => {
    const workspace = createTempDir("axm-phase7-smoke-ws-");
    const registryDir = createTempDir("axm-phase7-smoke-reg-");
    const sourceFixture = copySkillsRepoFixture();
    try {
      // 1. Init.
      const init = await runCli(["setup", "--yes", "--agent", "claude-code"], {
        cwd: workspace.path,
      });
      expect(init.exitCode).toBe(0);

      // 2. Wire file-registry source + publish profile.
      const settingsPath = path.join(workspace.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.sources = [
        {
          name: "local",
          type: "registry",
          location: `file://${registryDir.path}`,
        },
      ];
      settings.profile = "@phase7";
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      // 3. Install-from-local, fork-to-registry, file-registry publish.
      const install = await runCli(
        ["skills", "install", sourceFixture.path, "--skill", "my-skill", "--yes"],
        { cwd: workspace.path },
      );
      expect(install.exitCode).toBe(0);

      const fork = await runCli(["skills", "fork", "my-skill", "--yes"], {
        cwd: workspace.path,
      });
      expect(fork.exitCode).toBe(0);

      // The file-registry bucket holds the published artifacts.
      expect(
        fs.existsSync(
          path.join(registryDir.path, "extensions", "@phase7", "skills", "my-skill", "index.json"),
        ),
      ).toBe(true);

      // 4. `axm lint` on the post-fork workspace. AXM-453 removed the
      //    `<!-- Managed by axm -->` banner that previously tripped
      //    `skill/frontmatter-parseable`, so we deterministically
      //    induce a manifest violation in the forked skill (non-SemVer
      //    `version`) and assert lint surfaces the corresponding rule.
      //    This proves the lint engine reaches the forked skill tree
      //    end-to-end.
      // AXM-453 removed the `<!-- Managed by axm -->` banner that
      // previously tripped `skill/frontmatter-parseable` end-to-end. To
      // keep the cross-repo wiring assertion deterministic, we induce
      // the same class of violation directly: prepend an HTML comment
      // before the frontmatter delimiter on the forked SKILL.md. The
      // file-bytes-driven `skill/frontmatter-parseable` rule (which
      // reads from the workspace accessor, not preloaded `skillJson`)
      // surfaces the finding and proves lint reaches the forked tree.
      const forkedSkillMdPath = path.join(
        workspace.path,
        ".axm",
        "extensions",
        "@phase7",
        "skills",
        "my-skill",
        "src",
        "SKILL.md",
      );
      const original = fs.readFileSync(forkedSkillMdPath, "utf-8");
      fs.writeFileSync(forkedSkillMdPath, `<!-- Managed by axm -->\n${original}`);

      const lintResult = await runCli(["lint", "--json"], {
        cwd: workspace.path,
      });
      const lintDoc = JSON.parse(lintResult.stdout);
      const ruleIds: Array<string> = (lintDoc.result.findings ?? []).map(
        (f: { ruleId: string }) => f.ruleId,
      );
      expect(ruleIds).toContain("skill/frontmatter-parseable");

      // 5. Drift banner fires when a publish-gate rule is overridden
      //    locally. Empty before overrides.
      const settingsBefore = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const beforeOverride = await runCli(["lint", "--json"], {
        cwd: workspace.path,
      });
      const beforeDoc = JSON.parse(beforeOverride.stdout);
      expect(beforeDoc.result.driftBanner).toEqual([]);

      settingsBefore.lint = { rules: { "skill/manifest-schema-valid": "off" } };
      fs.writeFileSync(settingsPath, JSON.stringify(settingsBefore, null, 2));

      const afterOverride = await runCli(["lint", "--json"], {
        cwd: workspace.path,
      });
      const afterDoc = JSON.parse(afterOverride.stdout);
      expect(Array.isArray(afterDoc.result.driftBanner)).toBe(true);
      expect(afterDoc.result.driftBanner).toContain("skill/manifest-schema-valid");
    } finally {
      workspace.cleanup();
      registryDir.cleanup();
      sourceFixture.cleanup();
    }
  }, 60000);
});
