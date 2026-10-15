import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { McpSourceKey } from "../../workspace/mcp-source-identity.js";
import { computePackManifestContentIdentity } from "../../workspace/pack-manifest-content-identity.js";
import {
  LOCKFILE_VERSION,
  LockfileSchema,
  LockfileViewSchema,
  McpServerLockEntrySchema,
  StoredLockfileSchema,
  type Lockfile,
} from "./schema.js";
import { emitLockfileToml } from "./toml.js";
import { parseLockfileToml } from "./toml-values.js";

const tree = (character: string) => `sha256-tree-v2:${character.repeat(64)}`;
const digest = (character: string) => `sha256:${character.repeat(64)}`;

const packDependencies = {
  "@acme/skills/docs": "^0.4.0",
  "@acme/knowledge/docs": {
    source: { type: "registry", url: decodeRegistryEndpointSync("https://registry.example.com") },
    versionRange: ">=0.11.0",
  },
} as const;

const mcpEntries = [
  {
    source: { type: "registry", url: "https://registry.agentxm.ai" },
    identity: { owner: "@community", name: "sentry" },
    resolved: {
      version: "2.1.0",
      integrity:
        "sha512-9Wts3FBo3Uo/hMSsR5eSGahQBC/zwbkSIRSsOwA2KnHsMD1LOpcDGXWRha+FcjFsUBARcQAxBfStD9PZiJhRjw==",
      publisherBindingId: "hbnd_sentry",
    },
    treeIntegrity: tree("4"),
  },
  {
    source: { type: "git", url: "https://github.com/acme/tools.git", path: "mcps/search" },
    identity: { name: "search" },
    resolved: {
      commit: "238ae8e25d90fefb6a01644334c30cb1f5232efc",
      tree: "13ab38e6293145d89ff12a8478c55b32c408d262",
    },
    treeIntegrity: tree("5"),
  },
].map((entry) => Schema.decodeUnknownSync(McpServerLockEntrySchema)(entry));

/** One of every stored record and binding form. */
const fixture: Lockfile = Schema.decodeUnknownSync(LockfileViewSchema)({
  lockfileVersion: LOCKFILE_VERSION,
  skills: {
    "published-skill": {
      source: { type: "registry", url: "https://registry.agentxm.ai" },
      identity: { owner: "@acme", name: "published-skill" },
      resolved: {
        version: "1.0.0",
        integrity:
          "sha512-O7Eu2jwpjbXeJVl/VNkk8uF+eKJq2JU+2CGO5oLwu76QIeLzAJ0VLJEb8fJexoOpAnFBZnZ6+9jlvQ+wEk7Lig==",
        publisherBindingId: "hbnd_acme",
      },
      treeIntegrity: tree("0"),
    },
    "plugin-review": {
      source: {
        type: "git",
        url: "https://github.com/acme/plugins.git",
        path: "plugins/review/skills/review",
        revision: "v1.0.0",
        distribution: {
          format: "claude",
          packageRoot: "plugins/review",
          componentPath: "skills/review",
          manifestPath: ".claude-plugin/plugin.json",
          marketplace: { path: ".claude-plugin/marketplace.json", name: "acme" },
        },
      },
      identity: { name: "review" },
      resolved: {
        commit: "0123456789abcdef0123456789abcdef01234567",
        tree: "90bd1b48e958257948487b90bee080ba5ed00caa",
      },
      treeIntegrity: tree("1"),
    },
    "local-skill": {
      source: { type: "path", path: "skills/my-skill" },
      identity: { owner: "@acme", name: "local-skill" },
      resolved: { tree: tree("2") },
      treeIntegrity: tree("2"),
    },
    archived: {
      source: {
        type: "http",
        url: "https://example.com/releases/review.tar.gz",
        kind: "archive",
        path: ".",
        portable: true,
      },
      identity: { name: "archived" },
      resolved: {
        format: "tar.gz",
        url: "https://example.com/releases/review.tar.gz",
        digest: digest("a"),
      },
      treeIntegrity: tree("6"),
    },
    indexed: {
      source: {
        type: "http",
        url: "https://example.com/.well-known/agent-skills/index.json",
        kind: "index",
        entry: "indexed",
        path: ".",
        portable: true,
      },
      identity: { name: "indexed" },
      resolved: {
        format: "files",
        files: [
          {
            path: "SKILL.md",
            url: "https://example.com/.well-known/agent-skills/indexed/SKILL.md",
            digest: digest("b"),
          },
          {
            path: "references/guide.md",
            url: "https://example.com/.well-known/agent-skills/indexed/references/guide.md",
            digest: digest("c"),
          },
        ],
      },
      treeIntegrity: tree("7"),
    },
  },
  subagents: {
    researcher: {
      source: { type: "registry", url: "https://registry.agentxm.ai" },
      identity: { owner: "@acme", name: "researcher" },
      resolved: {
        version: "0.3.0",
        integrity:
          "sha512-PikWkvvGjDDmtg897iD/vhH2uZVbxq2K8tn/CB9QHYSt4zgLTYFTGzMVxpMjpJDCyqDplb3fOkrDOOWVAxAZdg==",
        publisherBindingId: "hbnd_acme",
      },
      treeIntegrity: tree("8"),
    },
  },
  packs: {
    docs: {
      source: { type: "registry", url: "https://registry.agentxm.ai" },
      identity: { owner: "@acme", name: "docs" },
      resolved: {
        version: "0.7.0",
        integrity:
          "sha512-iJXdUHP75dmGt0Y5cqwMavC+/vtsV24JulL0BDheDdWOLEmBV+Rt+6x2z122uJN0J1xH44nhG7RO5Ps7LECRsg==",
        publisherBindingId: "hbnd_acme",
      },
      treeIntegrity: tree("9"),
      manifestVersion: "0.7.0",
      manifestContentIdentity: computePackManifestContentIdentity({
        owner: "@acme",
        type: "pack",
        name: "docs",
        version: "0.7.0",
        dependencies: packDependencies,
      }),
      dependencies: {
        "@acme/skills/docs": "^0.4.0",
        "@acme/knowledge/docs": {
          source: { type: "registry", url: "https://registry.example.com" },
          versionRange: ">=0.11.0",
        },
      },
    },
  },
  projections: {
    rules: {
      contract: 1,
      units: { "AGENTS.md": { gen: digest("a"), output: digest("b") } },
    },
    instructions: {
      contract: 1,
      units: {
        "CLAUDE.md": { gen: digest("b"), output: digest("a") },
        ".gitignore": { output: digest("0") },
      },
    },
  },
});
const view: Lockfile = {
  ...fixture,
  mcpServers: Object.fromEntries(
    mcpEntries.map((entry) => [McpSourceKey.fromLockEntry(entry), entry]),
  ),
};

const tool = parseLockfileToml(`[tool.example]
anything = "preserved verbatim, never read"
nested = { z = [1, 2], a = true }
`).tool;

const encode = Schema.encodeSync(LockfileSchema);
const decode = Schema.decodeUnknownSync(LockfileSchema);
const emit = (lockfile: Lockfile) => emitLockfileToml(encode(lockfile), tool);

describe("canonical lockfile TOML", () => {
  it("keeps mixed binding and MCP component tables attached to their own records", () => {
    const component = (path: string) => ({
      format: "claude",
      root: "plugins/review",
      path,
      manifest: ".claude-plugin/plugin.json",
      marketplace: { path: ".claude-plugin/marketplace.json", name: "acme" },
    });
    const binding = { package: "github.com/acme/toolbox", name: "review", spec: "main" };
    const document = Schema.decodeUnknownSync(StoredLockfileSchema)({
      version: 1,
      skills: {
        zebra: binding,
        alpha: { ...binding, component: component("skills/alpha") },
        beta: binding,
        omega: { ...binding, component: component("skills/omega") },
      },
      mcp: [
        { ...binding, name: "alpha", component: component("mcps/alpha") },
        { ...binding, name: "beta", component: component("mcps/beta") },
      ],
      projections: {
        rules: {
          contract: 1,
          units: { 'docs/"review".md': { gen: digest("a"), output: digest("b") } },
        },
        instructions: { contract: 1, units: { "hook with spaces.json": { output: digest("c") } } },
      },
    });
    const bytes = emitLockfileToml(Schema.encodeSync(StoredLockfileSchema)(document));
    const parsed = parseLockfileToml(bytes).document;
    expect(parsed).toEqual(document);
    expect(
      emitLockfileToml(
        Schema.encodeSync(StoredLockfileSchema)(
          Schema.decodeUnknownSync(StoredLockfileSchema)(parsed),
        ),
      ),
    ).toBe(bytes);
    expect(bytes.indexOf("beta = {")).toBeLessThan(bytes.indexOf("zebra = {"));
    expect(bytes.indexOf("zebra = {")).toBeLessThan(bytes.indexOf("[skills.alpha]"));
    expect(bytes.indexOf("[skills.alpha]")).toBeLessThan(bytes.indexOf("[skills.omega]"));
    expect(bytes).toContain(
      '[mcp.component]\nformat = "claude"\nroot = "plugins/review"\npath = "mcps/alpha"',
    );
    expect(bytes).toContain(
      'marketplace = { path = ".claude-plugin/marketplace.json", name = "acme" }',
    );
    expect(bytes).toContain(
      `[projections.instructions.units."hook with spaces.json"]\noutput = "${digest("c")}"`,
    );
  });

  it("round-trips the view through bytes", () => {
    const bytes = emit(view);
    expect(decode(parseLockfileToml(bytes).document, { onExcessProperty: "error" })).toEqual(view);
  });

  it("re-emits parsed bytes byte for byte, tool tables included", () => {
    const bytes = emit(view);
    const stored = Schema.decodeUnknownSync(StoredLockfileSchema)(
      parseLockfileToml(bytes).document,
      {
        onExcessProperty: "error",
      },
    );
    expect(
      emitLockfileToml(
        Schema.encodeSync(StoredLockfileSchema)(stored),
        parseLockfileToml(bytes).tool,
      ),
    ).toBe(bytes);
  });

  it("emits identical bytes for identical content in any insertion order", () => {
    const reordered: Lockfile = {
      ...view,
      skills: Object.fromEntries(Object.entries(view.skills).reverse()),
      mcpServers: Object.fromEntries(Object.entries(view.mcpServers ?? {}).reverse()),
    };
    expect(emit(reordered)).toBe(emit(view));
  });

  it("lays out records, bindings, projections, and tool tables canonically", () => {
    const identity = view.packs?.["docs"]?.manifestContentIdentity ?? "";
    const bytes = emit(view).replace(identity, "<identity>");
    expect(bytes).toMatchInlineSnapshot(`
      "#:schema https://axm.sh/schemas/axm-lock.schema.json
      # Generated by axm; do not edit by hand. See: axm help workspace-state
      version = 1

      [[package]]
      id = "_local/project/skills/my-skill"
      source = { path = "skills/my-skill", format = "native" }
      tree = "sha256-tree-v2:2222222222222222222222222222222222222222222222222222222222222222"

      [[package]]
      id = "example.com/.well-known/agent-skills/index.json/indexed"
      source = { http = "https://example.com/.well-known/agent-skills/index.json", kind = "index", entry = "indexed", path = ".", portable = true, format = "native" }
      artifact = { format = "files", files = [
        { path = "SKILL.md", url = "https://example.com/.well-known/agent-skills/indexed/SKILL.md", digest = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
        { path = "references/guide.md", url = "https://example.com/.well-known/agent-skills/indexed/references/guide.md", digest = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" },
      ] }
      tree = "sha256-tree-v2:7777777777777777777777777777777777777777777777777777777777777777"

      [[package]]
      id = "example.com/releases/review.tar.gz"
      source = { http = "https://example.com/releases/review.tar.gz", kind = "archive", path = ".", portable = true, format = "native" }
      artifact = { format = "tar.gz", url = "https://example.com/releases/review.tar.gz", digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
      tree = "sha256-tree-v2:6666666666666666666666666666666666666666666666666666666666666666"

      [[package]]
      id = "github.com/acme/plugins/plugins/review"
      source = { git = "https://github.com/acme/plugins.git", path = "plugins/review", format = "claude" }
      commit = "0123456789abcdef0123456789abcdef01234567"
      git-tree = "90bd1b48e958257948487b90bee080ba5ed00caa"
      tree = "sha256-tree-v2:1111111111111111111111111111111111111111111111111111111111111111"

      [[package]]
      id = "github.com/acme/tools/mcps/search"
      source = { git = "https://github.com/acme/tools.git", path = "mcps/search", format = "native" }
      commit = "238ae8e25d90fefb6a01644334c30cb1f5232efc"
      git-tree = "13ab38e6293145d89ff12a8478c55b32c408d262"
      tree = "sha256-tree-v2:5555555555555555555555555555555555555555555555555555555555555555"

      [[package]]
      id = "registry.agentxm.ai/@acme/packs/docs"
      source = { registry = "https://registry.agentxm.ai" }
      version = "0.7.0"
      archive = "sha512-iJXdUHP75dmGt0Y5cqwMavC+/vtsV24JulL0BDheDdWOLEmBV+Rt+6x2z122uJN0J1xH44nhG7RO5Ps7LECRsg=="
      publisher = "hbnd_acme"
      tree = "sha256-tree-v2:9999999999999999999999999999999999999999999999999999999999999999"
      manifest-version = "0.7.0"
      manifest-identity = "<identity>"
      dependencies = [
        { name = "@acme/knowledge/docs", range = ">=0.11.0", registry = "https://registry.example.com" },
        { name = "@acme/skills/docs", range = "^0.4.0" },
      ]

      [[package]]
      id = "registry.agentxm.ai/@acme/skills/published-skill"
      source = { registry = "https://registry.agentxm.ai" }
      version = "1.0.0"
      archive = "sha512-O7Eu2jwpjbXeJVl/VNkk8uF+eKJq2JU+2CGO5oLwu76QIeLzAJ0VLJEb8fJexoOpAnFBZnZ6+9jlvQ+wEk7Lig=="
      publisher = "hbnd_acme"
      tree = "sha256-tree-v2:0000000000000000000000000000000000000000000000000000000000000000"

      [[package]]
      id = "registry.agentxm.ai/@acme/subagents/researcher"
      source = { registry = "https://registry.agentxm.ai" }
      version = "0.3.0"
      archive = "sha512-PikWkvvGjDDmtg897iD/vhH2uZVbxq2K8tn/CB9QHYSt4zgLTYFTGzMVxpMjpJDCyqDplb3fOkrDOOWVAxAZdg=="
      publisher = "hbnd_acme"
      tree = "sha256-tree-v2:8888888888888888888888888888888888888888888888888888888888888888"

      [[package]]
      id = "registry.agentxm.ai/@community/mcps/sentry"
      source = { registry = "https://registry.agentxm.ai" }
      version = "2.1.0"
      archive = "sha512-9Wts3FBo3Uo/hMSsR5eSGahQBC/zwbkSIRSsOwA2KnHsMD1LOpcDGXWRha+FcjFsUBARcQAxBfStD9PZiJhRjw=="
      publisher = "hbnd_sentry"
      tree = "sha256-tree-v2:4444444444444444444444444444444444444444444444444444444444444444"

      [skills]
      archived = { package = "example.com/releases/review.tar.gz", name = "archived" }
      indexed = { package = "example.com/.well-known/agent-skills/index.json/indexed", name = "indexed" }
      local-skill = { package = "_local/project/skills/my-skill", name = "@acme/skills/local-skill" }
      published-skill = { package = "registry.agentxm.ai/@acme/skills/published-skill", name = "@acme/skills/published-skill" }

      [skills.plugin-review]
      package = "github.com/acme/plugins/plugins/review"
      name = "review"
      spec = "v1.0.0"

      [skills.plugin-review.component]
      format = "claude"
      root = "plugins/review"
      path = "skills/review"
      manifest = ".claude-plugin/plugin.json"
      marketplace = { path = ".claude-plugin/marketplace.json", name = "acme" }

      [[mcp]]
      package = "github.com/acme/tools/mcps/search"
      name = "search"

      [[mcp]]
      package = "registry.agentxm.ai/@community/mcps/sentry"
      name = "@community/mcps/sentry"

      [subagents]
      researcher = { package = "registry.agentxm.ai/@acme/subagents/researcher", name = "@acme/subagents/researcher" }

      [packs]
      docs = { package = "registry.agentxm.ai/@acme/packs/docs", name = "@acme/packs/docs" }

      [projections.rules]
      contract = 1

      [projections.rules.units."AGENTS.md"]
      gen = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      output = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

      [projections.instructions]
      contract = 1

      [projections.instructions.units.".gitignore"]
      output = "sha256:0000000000000000000000000000000000000000000000000000000000000000"

      [projections.instructions.units."CLAUDE.md"]
      gen = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      output = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

      [tool.example]
      anything = "preserved verbatim, never read"
      nested = { a = true, z = [1, 2] }
      "
    `);
  });

  it("writes only basic strings and quotes keys that are not bare", () => {
    const toolText = [
      '[tool."my tool"]',
      String.raw`"quote\"and\\slash" = "tab\tline\nfeed\u0001bell\u007f"`,
      "list = []",
      "table = {}",
    ].join("\n");
    const parsed = parseLockfileToml(toolText);
    const bytes = emitLockfileToml({ version: LOCKFILE_VERSION }, parsed.tool);
    expect(bytes.split("\n").slice(3).join("\n")).toBe(
      [
        "",
        '[tool."my tool"]',
        "list = []",
        '"quote\\"and\\\\slash" = "tab\\tline\\nfeed\\u0001bell\\u007f"',
        "table = {}",
        "",
      ].join("\n"),
    );
    expect(parseLockfileToml(bytes).tool).toEqual(parsed.tool);
  });

  it("carries every TOML value kind under tool tables through a rewrite", () => {
    const stored = [
      "version = 1",
      "",
      "[tool.other]",
      "ratio = 1.5",
      "whole = 2.0",
      "huge = 1e+21",
      "nothing = nan",
      "endless = -inf",
      "day = 2026-10-15",
      "moment = 2026-10-15T06:30:00.000Z",
      "shifted = 2026-10-15T06:30:00.000+02:00",
      "local = 2026-10-15T06:30:00.000",
      "clock = 06:30:00.000",
      "",
    ].join("\n");
    const { document: parsed, tool: preserved } = parseLockfileToml(stored);
    const decoded = Schema.decodeUnknownSync(StoredLockfileSchema)(parsed, {
      onExcessProperty: "error",
    });
    expect(decode(parsed, { onExcessProperty: "error" })).toEqual({
      lockfileVersion: LOCKFILE_VERSION,
      skills: {},
    });
    const rewritten = emitLockfileToml(Schema.encodeSync(StoredLockfileSchema)(decoded), preserved);
    expect(rewritten.split("\n").slice(3).join("\n")).toBe(
      [
        "",
        "[tool.other]",
        "clock = 06:30:00.000",
        "day = 2026-10-15",
        "endless = -inf",
        "huge = 1e+21",
        "local = 2026-10-15T06:30:00.000",
        "moment = 2026-10-15T06:30:00.000Z",
        "nothing = nan",
        "ratio = 1.5",
        "shifted = 2026-10-15T06:30:00.000+02:00",
        "whole = 2.0",
        "",
      ].join("\n"),
    );
    expect(emitLockfileToml(Schema.encodeSync(StoredLockfileSchema)(decoded), preserved)).toBe(
      rewritten,
    );
  });

  it("refuses a date in a field AXM owns", () => {
    expect(() =>
      decode(parseLockfileToml("version = 2026-10-15\n").document, { onExcessProperty: "error" }),
    ).toThrow();
  });

  it("refuses a Pack field on a record that no Pack binding selects", () => {
    const stored = [
      "version = 1",
      "",
      "[[package]]",
      'id = "github.com/acme/tools/mcps/search"',
      'source = { git = "https://github.com/acme/tools.git", path = "mcps/search", format = "native" }',
      'commit = "238ae8e25d90fefb6a01644334c30cb1f5232efc"',
      'git-tree = "13ab38e6293145d89ff12a8478c55b32c408d262"',
      `tree = "${tree("5")}"`,
      'source-root = "docs"',
      "",
      "[skills]",
      'search = { package = "github.com/acme/tools/mcps/search", name = "search" }',
      "",
    ].join("\n");
    expect(() => decode(parseLockfileToml(stored).document, { onExcessProperty: "error" })).toThrow(
      /Only a Pack's retained package may carry a Pack declaration/u,
    );
  });

  it("emits an empty lockfile as its header and version alone", () => {
    expect(emitLockfileToml(encode({ lockfileVersion: LOCKFILE_VERSION, skills: {} }))).toBe(
      [
        "#:schema https://axm.sh/schemas/axm-lock.schema.json",
        "# Generated by axm; do not edit by hand. See: axm help workspace-state",
        "version = 1",
        "",
      ].join("\n"),
    );
  });
});
