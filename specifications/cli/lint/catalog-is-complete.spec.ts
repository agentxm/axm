import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { allCatalogRuleMetadata } from "axm.sh/specification-harness";
import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "cli/lint/catalog-is-complete",
  title: "Every supported lint rule has a stable default and input scope",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "workspace-intent-fidelity"],
  methods: ["contract", "decision-table"],
});

type ExpectedRule = readonly [
  id: string,
  defaultSeverity: "error" | "warning" | "info",
  views: ReadonlyArray<"workspace" | "git-index">,
];

const bothViews = ["workspace", "git-index"] as const;
const workspaceView = ["workspace"] as const;

/**
 * Accepted lint-rule inventory. This is intentionally independent of the
 * implementation catalog: changing a rule id, default, or input scope is a
 * product-contract change that must update this specification deliberately.
 */
const expectedRules: ReadonlyArray<ExpectedRule> = [
  ["skill/skill-md-present", "error", bothViews],
  ["skill/manifest-present", "error", bothViews],
  ["skill/frontmatter-parseable", "error", bothViews],
  ["skill/frontmatter-standard-valid", "error", bothViews],
  ["skill/manifest-schema-valid", "error", bothViews],
  ["skill/manifest-keys-recognized", "error", bothViews],
  ["skill/standalone-declaration-valid", "warning", bothViews],
  ["skill/recommended-packs-valid", "warning", bothViews],
  ["pack/manifest-present", "error", bothViews],
  ["pack/manifest-schema-valid", "error", bothViews],
  ["pack/manifest-keys-recognized", "error", bothViews],
  ["subagent/manifest-present", "error", bothViews],
  ["subagent/manifest-schema-valid", "error", bothViews],
  ["subagent/manifest-keys-recognized", "error", bothViews],
  ["subagent/standalone-declaration-valid", "warning", bothViews],
  ["subagent/recommended-packs-valid", "warning", bothViews],
  ["mcp-server/manifest-present", "error", bothViews],
  ["mcp-server/manifest-schema-valid", "error", bothViews],
  ["mcp-server/manifest-keys-recognized", "error", bothViews],
  ["mcp-server/standalone-declaration-valid", "warning", bothViews],
  ["mcp-server/recommended-packs-valid", "warning", bothViews],
  ["hook/manifest-present", "error", bothViews],
  ["hook/manifest-schema-valid", "error", bothViews],
  ["hook/manifest-keys-recognized", "error", bothViews],
  ["hook/decision-portability", "warning", bothViews],
  ["hook/matcher-raw-portability", "warning", bothViews],
  ["hook/entrypoint-exists", "error", bothViews],
  ["hook/standalone-declaration-valid", "warning", bothViews],
  ["hook/recommended-packs-valid", "warning", bothViews],
  ["rule/manifest-present", "error", bothViews],
  ["rule/manifest-schema-valid", "error", bothViews],
  ["rule/manifest-keys-recognized", "error", bothViews],
  ["rule/standalone-declaration-valid", "warning", bothViews],
  ["rule/recommended-packs-valid", "warning", bothViews],
  ["knowledge/manifest-present", "error", bothViews],
  ["knowledge/manifest-schema-valid", "error", bothViews],
  ["knowledge/manifest-keys-recognized", "error", bothViews],
  ["knowledge/standalone-declaration-valid", "warning", bothViews],
  ["knowledge/recommended-packs-valid", "warning", bothViews],
  ["knowledge/bundle-too-large", "error", bothViews],
  ["knowledge/file-too-large", "error", bothViews],
  ["knowledge/invalid-tags", "error", bothViews],
  ["knowledge/missing-root-index", "error", bothViews],
  ["knowledge/missing-okf-version", "error", bothViews],
  ["knowledge/missing-title", "warning", bothViews],
  ["knowledge/missing-description", "warning", bothViews],
  ["knowledge/missing-manifest-description", "warning", bothViews],
  ["knowledge/empty-bundle", "warning", bothViews],
  ["knowledge/missing-tags", "warning", bothViews],
  ["knowledge/symbolic-link", "error", bothViews],
  ["knowledge/too-many-files", "error", bothViews],
  ["knowledge/unsupported-okf-version", "error", bothViews],
  ["knowledge/missing-type", "error", bothViews],
  ["knowledge/invalid-frontmatter", "error", bothViews],
  ["knowledge/case-collision", "error", bothViews],
  ["knowledge/dangerous-uri", "error", bothViews],
  ["knowledge/detected-secret", "error", bothViews],
  ["knowledge/unsafe-path", "error", bothViews],
  ["knowledge/invalid-index", "error", bothViews],
  ["knowledge/invalid-log", "error", bothViews],
  ["knowledge/invalid-resource", "error", bothViews],
  ["knowledge/escaping-resource", "error", bothViews],
  ["knowledge/unresolved-resource", "warning", bothViews],
  ["knowledge/broken-internal-link", "warning", bothViews],
  ["knowledge/escaping-link", "warning", bothViews],
  ["knowledge/unreachable-concept", "warning", bothViews],
  ["knowledge/missing-index-entry", "warning", bothViews],
  ["knowledge/stale-index-entry", "warning", bothViews],
  ["knowledge/embedded-html", "warning", bothViews],
  ["knowledge/duplicate-resource", "warning", bothViews],
  ["knowledge/inconsistent-type", "warning", bothViews],
  ["knowledge/large-concept", "warning", bothViews],
  ["knowledge/large-index", "warning", bothViews],
  ["knowledge/unreferenced-asset", "warning", bothViews],
  ["knowledge/invalid-sources", "error", bothViews],
  ["knowledge/invalid-generated", "error", bothViews],
  ["knowledge/invalid-verified", "error", bothViews],
  ["knowledge/invalid-status", "error", bothViews],
  ["knowledge/invalid-stale-after", "error", bothViews],
  ["knowledge/invalid-attestation", "error", bothViews],
  ["workspace/initialized", "error", bothViews],
  ["workspace/settings-schema-valid", "error", bothViews],
  ["workspace/settings-keys-recognized", "error", bothViews],
  ["workspace/lockfile-valid", "error", bothViews],
  ["workspace/source-endpoints-aligned", "error", bothViews],
  ["workspace/desired-state-reconcilable", "error", bothViews],
  ["workspace/axm-skill-compatible", "error", bothViews],
  ["workspace/agents-recognized", "error", bothViews],
  ["workspace/agents-detected-declared", "warning", workspaceView],
  ["workspace/agents-projections-stale", "warning", workspaceView],
  ["workspace/instructions-source-present", "error", bothViews],
  ["workspace/instructions-target-current", "warning", workspaceView],
  ["workspace/instructions-target-unowned", "warning", workspaceView],
  ["workspace/instructions-target-stale", "warning", workspaceView],
  ["workspace/instructions-agent-supported", "warning", bothViews],
  ["workspace/instructions-gitignore-current", "info", bothViews],
  ["workspace/projections-current", "error", workspaceView],
  ["workspace/hook-ownership-ambiguous", "warning", workspaceView],
  ["workspace/managed-file-unowned", "warning", workspaceView],
  ["workspace/skills-declarations-valid", "error", bothViews],
  ["workspace/packs-declarations-valid", "error", bothViews],
  ["workspace/configured-but-not-installed", "error", bothViews],
  ["workspace/knowledge-state-valid", "error", bothViews],
  ["workspace/mcps-transport-exclusivity", "warning", bothViews],
  ["workspace/mcps-no-secret-literal", "warning", bothViews],
  ["workspace/mcps-shared-target-compatible", "error", bothViews],
  ["workspace/mcps-agent-drift", "warning", workspaceView],
  ["workspace/mcps-agent-orphaned", "warning", workspaceView],
  ["workspace/skills-lockfile-aligned", "error", bothViews],
  ["workspace/skills-integrity-valid", "error", bothViews],
  ["workspace/skills-artifacts-correct", "error", workspaceView],
  ["workspace/packs-dependencies-resolved", "error", bothViews],
];

describe("Lint rule catalog", () => {
  it.effect("contains exactly the accepted rule identities in reporting order", () =>
    Effect.sync(() => {
      expect(allCatalogRuleMetadata.map((entry) => entry.id)).toEqual(
        expectedRules.map(([id]) => id),
      );
    }),
  );

  it.effect.each(expectedRules)("$0 has its accepted default severity and input scope", (row) =>
    Effect.sync(() => {
      const [id, defaultSeverity, views] = row;
      const separator = id.indexOf("/");
      const group = id.slice(0, separator);
      expect(allCatalogRuleMetadata.find((entry) => entry.id === id)).toEqual({
        id,
        defaultSeverity,
        group,
        views,
      });
    }),
  );
});
