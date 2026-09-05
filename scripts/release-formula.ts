import { guardPublicationVersion } from "./release-publication.js";

const formulaArtifacts = [
  "axm-darwin-arm64",
  "axm-darwin-x64",
  "axm-linux-arm64",
  "axm-linux-x64",
] as const;

export const formulaVersion = (formula: string): string => {
  const version = /^\s*version "([^"]+)"\s*$/mu.exec(formula)?.[1];
  if (version === undefined) throw new Error("Homebrew formula does not declare a version.");
  return version;
};

export const prepareFormula = (
  formula: string,
  version: string,
  repository: string,
  checksums: ReadonlyMap<string, string>,
): { readonly content: string; readonly changed: boolean } => {
  const current = formulaVersion(formula);
  guardPublicationVersion(version, current, "Homebrew");
  let next = formula.replace(/^(\s*)version "[^"]+"/mu, `$1version "${version}"`);
  for (const artifact of formulaArtifacts) {
    const checksum = checksums.get(artifact);
    if (checksum === undefined) throw new Error(`Missing candidate checksum: ${artifact}.`);
    const lines = next.split("\n");
    const matches = lines.flatMap((line, index) =>
      /^\s*url /u.test(line) && line.endsWith(`/${artifact}"`) ? [index] : [],
    );
    const index = matches[0];
    if (
      matches.length !== 1 ||
      index === undefined ||
      !/^\s*sha256 "[^"]+"\s*$/u.test(lines[index + 1] ?? "")
    ) {
      throw new Error(`Formula must have exactly one URL/checksum pair for ${artifact}.`);
    }
    const url = `https://github.com/${repository}/releases/download/cli-v${version}/${artifact}`;
    // Resolve Homebrew's version interpolation when assessing the current formula.
    const previousUrl = (lines[index] ?? "").replace(/#\{version\}/gu, current).trim();
    const previousHash = (lines[index + 1] ?? "").trim();
    if (
      current === version &&
      (previousUrl !== `url "${url}"` || previousHash !== `sha256 "${checksum}"`)
    ) {
      throw new Error(`Homebrew same-version content integrity conflict: ${artifact}.`);
    }
    if (current !== version) {
      lines[index] = (lines[index] ?? "").replace(/url ".*"/u, `url "${url}"`);
      lines[index + 1] = (lines[index + 1] ?? "").replace(/sha256 ".*"/u, `sha256 "${checksum}"`);
    }
    next = lines.join("\n");
  }
  return { content: next, changed: next !== formula };
};
