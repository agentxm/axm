import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * The merge queue rebases every pull-request commit onto `main` unchanged, so
 * each commit message is permanent public history. Joined at runtime so this
 * script never matches itself.
 */
const PRIVATE_CONTEXT_MARKERS = [
  ["linear.app", "agentxm"].join("/"),
  ["github.com", "agentxm", "agentxm-internal"].join("/"),
];
const TRACKER_IDENTIFIER = new RegExp(`\\b${["A", "XM"].join("")}-[0-9]+\\b`, "u");
const AUTOSQUASH_SUBJECT = /^(?:fixup|squash|amend)! /u;
const WORK_IN_PROGRESS_SUBJECT = /^(?:wip|tmp|temp)\b/iu;

export interface HistoryCommit {
  readonly sha: string;
  readonly parents: number;
  readonly message: string;
}

export const commitHistoryFindings = (commits: readonly HistoryCommit[]): readonly string[] =>
  commits.flatMap((commit) => {
    const subject = commit.message.split("\n", 1)[0]?.trim() ?? "";
    const label = `${commit.sha.slice(0, 12)} ${subject}`;
    const findings: string[] = [];
    if (commit.parents > 1) findings.push(`${label}: merge commit; rebase onto main instead`);
    if (subject.length === 0) findings.push(`${label}: empty subject`);
    if (AUTOSQUASH_SUBJECT.test(subject))
      findings.push(`${label}: autosquash marker; run git rebase --autosquash`);
    if (WORK_IN_PROGRESS_SUBJECT.test(subject))
      findings.push(`${label}: work-in-progress subject; reword or squash it`);
    if (
      TRACKER_IDENTIFIER.test(commit.message) ||
      PRIVATE_CONTEXT_MARKERS.some((marker) => commit.message.includes(marker))
    )
      findings.push(`${label}: message references private coordination context`);
    return findings;
  });

export const parseHistory = (log: string): readonly HistoryCommit[] =>
  log
    .split("\0")
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const [sha = "", parents = "", ...message] = record.replace(/^\n/u, "").split("\n");
      return {
        sha,
        parents: parents.split(" ").filter((parent) => parent.length > 0).length,
        message: message.join("\n"),
      };
    });

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (value === undefined || !/^[0-9a-f]{40}$/u.test(value))
    throw new Error(`${name} must be a full commit SHA`);
  return value;
};

const main = () => {
  const base = argument("--base");
  const head = argument("--head");
  const commits = parseHistory(
    execFileSync("git", ["log", "--format=%H%n%P%n%B%x00", `${base}..${head}`], {
      encoding: "utf8",
    }),
  );
  const findings = commitHistoryFindings(commits);
  for (const finding of findings) console.error(`::error title=Commit history::${finding}`);
  if (findings.length > 0) process.exit(1);
  console.log(`${String(commits.length)} commit(s) are ready to land on main`);
};

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) main();
