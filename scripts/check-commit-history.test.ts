import { describe, expect, it } from "vitest";

import { commitHistoryFindings, parseHistory } from "./check-commit-history.js";

const sha = "a".repeat(40);
const commit = (message: string, parents = 1) => ({ sha, parents, message });

describe("commit history", () => {
  it("accepts reviewed commits that can land on main unchanged", () => {
    expect(
      commitHistoryFindings([
        commit("Show whether a password is set\n\nExplains why."),
        commit("release: cli-v0.36.0"),
      ]),
    ).toEqual([]);
  });

  it("rejects commits that must be cleaned up before rebase integration", () => {
    const findings = commitHistoryFindings([
      commit("Merge branch 'main' into feature", 2),
      commit("fixup! Show whether a password is set"),
      commit("WIP settings"),
      commit(""),
    ]);
    expect(findings).toHaveLength(4);
    expect(findings[0]).toContain("merge commit");
    expect(findings[1]).toContain("autosquash");
    expect(findings[2]).toContain("work-in-progress");
    expect(findings[3]).toContain("empty subject");
  });

  it("keeps private coordination context out of every public commit message", () => {
    const tracker = ["A", "XM"].join("");
    const privateRepository = ["github.com", "agentxm", "agentxm-internal"].join("/");
    expect(commitHistoryFindings([commit(`Fix sync (${tracker}-12)`)])).toHaveLength(1);
    expect(commitHistoryFindings([commit(`Fix sync\n\nSee ${privateRepository}`)])).toHaveLength(1);
    expect(commitHistoryFindings([commit("Upgrade the axm-cli package")])).toEqual([]);
  });

  it("parses git log records with parents and multi-line bodies", () => {
    const other = "b".repeat(40);
    expect(
      parseHistory(`${sha}\n${other}\nSubject\n\nBody\n\0\n${other}\n${sha} ${other}\nMerge\n\0`),
    ).toEqual([
      { sha, parents: 1, message: "Subject\n\nBody\n" },
      { sha: other, parents: 2, message: "Merge\n" },
    ]);
  });
});
