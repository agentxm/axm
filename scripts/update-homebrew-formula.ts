import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseChecksumManifest, validateReleaseAssets } from "./release-checksums.js";
import { captureIn, runIn } from "./release-command.js";
import { guardPublicationVersion } from "./release-publication.js";
import { prepareFormula, formulaVersion } from "./release-formula.js";

const version = process.argv[2];
if (version === undefined) throw new Error("Expected release version.");
const tap = resolve(process.env["HOMEBREW_TAP_DIR"] ?? "../homebrew-tap");
const assets = resolve(process.env["RELEASE_ASSET_DIR"] ?? "release-assets");
const repository = process.env["GITHUB_REPO"] ?? "agentxm/axm";
validateReleaseAssets(assets);
const formulaPath = join(tap, "Formula/axm.rb");
const original = readFileSync(formulaPath, "utf8");
const candidate = prepareFormula(
  original,
  version,
  repository,
  parseChecksumManifest(readFileSync(join(assets, "SHA256SUMS"), "utf8")),
);
if (!candidate.changed) {
  console.log(`Verified identical Homebrew formula ${version}.`);
} else {
  // Fetch immediately before changing the local formula. Concurrent pushes still
  // fail normally; neither the fetch nor a rejected push permits a blind retry.
  runIn(tap, "git", ["fetch", "origin", "main"]);
  const remoteFormula = captureIn(tap, "git", ["show", "FETCH_HEAD:Formula/axm.rb"]);
  guardPublicationVersion(version, formulaVersion(remoteFormula), "Homebrew");
  if (remoteFormula.trim() !== original.trim())
    throw new Error("Homebrew tap changed concurrently; rerun publication preflight.");
  writeFileSync(formulaPath, candidate.content);
  if (process.env["DRY_RUN"] === "1") {
    runIn(tap, "git", ["diff", "--", "Formula/axm.rb"]);
  } else {
    runIn(tap, "git", ["add", "Formula/axm.rb"]);
    runIn(tap, "git", [
      "-c",
      "user.name=github-actions[bot]",
      "-c",
      "user.email=41898282+github-actions[bot]@users.noreply.github.com",
      "commit",
      "-m",
      `axm ${version}`,
    ]);
    runIn(tap, "git", ["push", "origin", "HEAD:main"]);
  }
}
