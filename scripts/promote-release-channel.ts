import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fail } from "./release-shared.js";
import { validateReleaseAssets, parseChecksumManifest } from "./release-checksums.js";
import { promoteStableRelease } from "./release-channel-promotion.js";

const [version, tag, commit, directory = "release-assets"] = process.argv.slice(2);
if (version === undefined || tag === undefined || commit === undefined)
  throw new Error("Expected <version> <tag> <commit> [asset-directory].");
validateReleaseAssets(directory);
const manifest = readFileSync(join(directory, "SHA256SUMS"));
const checksums = parseChecksumManifest(manifest.toString("utf8"));
const assetUrl = (name: string) =>
  `https://github.com/agentxm/axm/releases/download/${tag}/${name}`;
const binary = <Target extends string, Name extends string>(target: Target, name: Name) => ({
  target,
  name,
  url: assetUrl(name),
  sha256: checksums.get(name) ?? fail(`Missing checksum for ${name}.`),
});
const requireSecret = (name: string): string => {
  const value = process.env[name];
  return value === undefined || value === "" ? fail(`${name} is required.`) : value;
};
const result = await promoteStableRelease({
  version,
  tag,
  commit,
  artifacts: {
    checksumManifest: {
      name: "SHA256SUMS",
      url: assetUrl("SHA256SUMS"),
      sha256: createHash("sha256").update(manifest).digest("hex"),
    },
    binaries: [
      binary("darwin-arm64", "axm-darwin-arm64"),
      binary("darwin-x64", "axm-darwin-x64"),
      binary("linux-arm64", "axm-linux-arm64"),
      binary("linux-x64", "axm-linux-x64"),
      binary("windows-x64", "axm-windows-x64.exe"),
    ],
  },
  credentials: () => ({
    bearerToken: requireSecret("AXM_RELEASE_CONTROL_TOKEN"),
    accessClientId: requireSecret("AXM_CONTROL_ACCESS_CLIENT_ID"),
    accessClientSecret: requireSecret("AXM_CONTROL_ACCESS_CLIENT_SECRET"),
  }),
});
if (process.env["GITHUB_OUTPUT"] !== undefined)
  appendFileSync(process.env["GITHUB_OUTPUT"], `outcome=${result.outcome}\n`);
console.log(
  `${result.outcome}: stable=${result.document.version} revision=${String(result.document.revision)} etag=${result.etag}`,
);
if (result.confirmation === "public-readback")
  console.log(
    `Submission failed (${result.submissionFailure}); public readback confirms the candidate channel state. This does not independently verify its audit event.`,
  );
