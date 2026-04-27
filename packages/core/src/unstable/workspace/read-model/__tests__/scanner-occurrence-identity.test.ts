/**
 * Scanner occurrence identity:
 *
 * (a) Two scanner paths observing the same physical occurrence collapse to
 *     one entry with one stable identity (`(scope, type | agentId, origin,
 *     contentLocation)`).
 * (b) Two distinct physical paths under the same name produce two entries
 *     with different identities.
 *
 * The identity contract lives in `scanners/types.ts`:
 * `occurrenceIdentity(occurrence)` returns the four-tuple, and
 * `occurrenceIdentityKey(id)` serializes it into a stable string key.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { buildFixture } from "../__fixtures__/builder.js";
import {
  makeAgentDirOccurrence,
  makeAgentMcpConfigOccurrence,
  makeAgentSettingsOccurrence,
  makeCanonicalOccurrence,
  makeWorkspaceMcpConfigOccurrence,
} from "../__fixtures__/occurrences.js";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeAgentDirScanner } from "../scanners/agent-dir.js";
import { makeAgentSettingsScanner } from "../scanners/agent-settings.js";
import { makeCanonicalExtensionsScanner } from "../scanners/canonical-extensions.js";
import { makeMcpConfigScanner } from "../scanners/mcp-config.js";
import {
  dedupeByIdentity,
  occurrenceIdentity,
  occurrenceIdentityKey,
  type AgentDirOccurrence,
  type CanonicalExtensionOccurrence,
  type ScannerOccurrence,
} from "../scanners/types.js";

const WORKSPACE_ROOT = "/ws";
const USER_HOME = "/home/user";

describe("scanner occurrence identity", () => {
  describe("identity tuple", () => {
    it("canonical-extension identity carries (scope, type, origin, contentLocation)", () => {
      const occ = makeCanonicalOccurrence({
        scope: "project",
        type: "skill",
        origin: "canonical-axm",
        name: "some-skill",
        owner: "@owner",
        contentLocation: "/ws/.axm/extensions/@owner/skills/src/some-skill",
      });
      const id = occurrenceIdentity(occ);
      expect(id.scope).toBe("project");
      expect(id.subjectKey).toBe("skill");
      expect(id.origin).toBe("canonical-axm");
      expect(id.contentLocation).toBe("/ws/.axm/extensions/@owner/skills/src/some-skill");
    });

    it("agent-dir identity includes agentId in subjectKey and origin", () => {
      const occ = makeAgentDirOccurrence({
        scope: "project",
        type: "skill",
        agentId: "claude-code",
        name: "some-skill",
        contentLocation: "/ws/.claude/skills/some-skill",
      });
      const id = occurrenceIdentity(occ);
      expect(id.subjectKey).toBe("skill:claude-code");
      expect(id.origin).toBe("agent-dir:claude-code");
    });

    it("mcp-config workspace and agent identities differ at the origin tier", () => {
      const workspace = makeWorkspaceMcpConfigOccurrence({
        scope: "project",
        name: "srv",
        contentLocation: "/ws/.mcp.json",
      });
      const agent = makeAgentMcpConfigOccurrence({
        scope: "project",
        agentId: "claude-code",
        name: "srv",
        contentLocation: "/ws/.claude/mcp.json",
      });
      const wId = occurrenceIdentity(workspace);
      const aId = occurrenceIdentity(agent);
      expect(wId.origin).toBe("workspace-mcp-config");
      expect(aId.origin).toBe("agent-mcp-config:claude-code");
      expect(occurrenceIdentityKey(wId)).not.toBe(occurrenceIdentityKey(aId));
    });

    it("agent-settings identity is keyed by agentId", () => {
      const occ = makeAgentSettingsOccurrence({
        scope: "project",
        agentId: "claude-code",
        contentLocation: "/ws/.claude/settings.json",
      });
      const id = occurrenceIdentity(occ);
      expect(id.subjectKey).toBe("agent-settings:claude-code");
      expect(id.origin).toBe("agent-settings:claude-code");
    });
  });

  describe("identity key serialization", () => {
    it("two structurally identical occurrences produce equal keys", () => {
      const a = makeCanonicalOccurrence({
        scope: "project",
        type: "skill",
        origin: "canonical-axm",
        name: "x",
        owner: "@o",
        contentLocation: "/ws/.axm/extensions/@o/skills/src/x",
      });
      const b: CanonicalExtensionOccurrence = { ...a };
      expect(occurrenceIdentityKey(occurrenceIdentity(a))).toBe(
        occurrenceIdentityKey(occurrenceIdentity(b)),
      );
    });

    it("differing contentLocation produces different keys", () => {
      const a = makeAgentDirOccurrence({
        scope: "project",
        type: "skill",
        agentId: "claude-code",
        name: "x",
        contentLocation: "/ws/.claude/skills/x",
      });
      const b = makeAgentDirOccurrence({
        scope: "project",
        type: "skill",
        agentId: "codex",
        name: "x",
        contentLocation: "/ws/.codex/skills/x",
      });
      expect(occurrenceIdentityKey(occurrenceIdentity(a))).not.toBe(
        occurrenceIdentityKey(occurrenceIdentity(b)),
      );
    });
  });

  describe("dedupeByIdentity collapses duplicates", () => {
    it("two observations of the same physical occurrence collapse to one", () => {
      const occ = makeCanonicalOccurrence({
        scope: "project",
        type: "skill",
        origin: "canonical-axm",
        name: "x",
        owner: "@o",
        contentLocation: "/ws/.axm/extensions/@o/skills/src/x",
      });
      const collapsed = dedupeByIdentity<CanonicalExtensionOccurrence>([occ, { ...occ }]);
      expect(collapsed).toHaveLength(1);
    });

    it("distinct physical paths under the same name remain two entries", () => {
      const a = makeAgentDirOccurrence({
        scope: "project",
        type: "skill",
        agentId: "claude-code",
        name: "x",
        contentLocation: "/ws/.claude/skills/x",
      });
      const b = makeAgentDirOccurrence({
        scope: "project",
        type: "skill",
        agentId: "codex",
        name: "x",
        contentLocation: "/ws/.codex/skills/x",
      });
      const collapsed = dedupeByIdentity<AgentDirOccurrence>([a, b]);
      expect(collapsed).toHaveLength(2);
    });
  });

  describe("identity against the spec multi-origin scenarios", () => {
    it("same skill in two agent dirs and canonical AXM yields three distinct identities", () =>
      Effect.gen(function* () {
        const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
        const diag = makeDiagnostics(ref);
        const deps = yield* buildFixture({
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project: {
            agentDirs: {
              "claude-code": {
                "skills/some-skill/SKILL.md": "# claude\n",
              },
              codex: {
                "skills/some-skill/SKILL.md": "# codex\n",
              },
            },
            axmExtensions: {
              "@owner/skills/src/some-skill/SKILL.md": "# canonical\n",
            },
          },
        });
        const canonical = yield* makeCanonicalExtensionsScanner({
          fs: deps.fs,
          path: deps.path,
          workspaceRoot: WORKSPACE_ROOT,
          scope: "project",
          diagnostics: diag,
        });
        const agentDir = yield* makeAgentDirScanner({
          fs: deps.fs,
          path: deps.path,
          workspaceRoot: WORKSPACE_ROOT,
          scope: "project",
          diagnostics: diag,
        });
        const all: ReadonlyArray<ScannerOccurrence> = [...canonical, ...agentDir];
        const someSkillOccurrences = all.filter((occ) => {
          if (occ._tag === "canonical-extension")
            return occ.type === "skill" && occ.name === "some-skill";
          if (occ._tag === "agent-dir") return occ.type === "skill" && occ.name === "some-skill";
          return false;
        });
        expect(someSkillOccurrences).toHaveLength(3);
        const identityKeys = new Set(
          someSkillOccurrences.map((o) => occurrenceIdentityKey(occurrenceIdentity(o))),
        );
        expect(identityKeys.size).toBe(3);
        // De-duplicating across the array does not collapse them.
        const collapsed = dedupeByIdentity(someSkillOccurrences);
        expect(collapsed).toHaveLength(3);
      }).pipe(Effect.provide(Path.layer)));

    it("same skill in two agent dirs and external AXM yields three distinct identities", () =>
      Effect.gen(function* () {
        const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
        const diag = makeDiagnostics(ref);
        const deps = yield* buildFixture({
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project: {
            agentDirs: {
              "claude-code": {
                "skills/some-skill/SKILL.md": "# claude\n",
              },
              codex: {
                "skills/some-skill/SKILL.md": "# codex\n",
              },
            },
            axmExtensions: {
              "external/skills/some-skill/SKILL.md": "# external\n",
            },
          },
        });
        const canonical = yield* makeCanonicalExtensionsScanner({
          fs: deps.fs,
          path: deps.path,
          workspaceRoot: WORKSPACE_ROOT,
          scope: "project",
          diagnostics: diag,
        });
        const agentDir = yield* makeAgentDirScanner({
          fs: deps.fs,
          path: deps.path,
          workspaceRoot: WORKSPACE_ROOT,
          scope: "project",
          diagnostics: diag,
        });
        const all: ReadonlyArray<ScannerOccurrence> = [...canonical, ...agentDir];
        const someSkillOccurrences = all.filter((occ) => {
          if (occ._tag === "canonical-extension")
            return occ.type === "skill" && occ.name === "some-skill";
          if (occ._tag === "agent-dir") return occ.type === "skill" && occ.name === "some-skill";
          return false;
        });
        expect(someSkillOccurrences).toHaveLength(3);
        const identityKeys = new Set(
          someSkillOccurrences.map((o) => occurrenceIdentityKey(occurrenceIdentity(o))),
        );
        expect(identityKeys.size).toBe(3);
      }).pipe(Effect.provide(Path.layer)));

    it("workspace and agent MCP servers with the same name yield distinct identities", () =>
      Effect.gen(function* () {
        const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
        const diag = makeDiagnostics(ref);
        const deps = yield* buildFixture({
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project: {
            mcpJson: {
              _tag: "valid",
              contents: { mcpServers: { shared: { command: "ws" } } },
            },
            agentDirs: {
              "claude-code": {
                "mcp.json": JSON.stringify({
                  mcpServers: { shared: { command: "agent" } },
                }),
              },
            },
          },
        });
        const occurrences = yield* makeMcpConfigScanner({
          fs: deps.fs,
          path: deps.path,
          workspaceRoot: WORKSPACE_ROOT,
          scope: "project",
          diagnostics: diag,
        });
        const sharedOccurrences = occurrences.filter((o) => o.name === "shared");
        expect(sharedOccurrences).toHaveLength(2);
        const identityKeys = new Set(
          sharedOccurrences.map((o) => occurrenceIdentityKey(occurrenceIdentity(o))),
        );
        expect(identityKeys.size).toBe(2);
      }).pipe(Effect.provide(Path.layer)));
  });

  // Reference imports the linter would otherwise flag as unused.
  void makeAgentSettingsScanner;
});
