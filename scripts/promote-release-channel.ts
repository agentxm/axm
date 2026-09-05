import { fail } from "./release-shared.js";
import { promoteStableRelease } from "./release-channel-promotion.js";

const args = process.argv.slice(2);
if (args.length !== 3) {
  fail("Usage: pnpm exec nx run axm:promote-release-channel -- <version> <tag> <commit>");
}

const requireArgument = (index: number): string =>
  args[index] ??
  fail("Usage: pnpm exec nx run axm:promote-release-channel -- <version> <tag> <commit>");

const version = requireArgument(0);
const tag = requireArgument(1);
const commit = requireArgument(2);

const requireSecret = (name: string): string => {
  const value = process.env[name];
  return value === undefined || value === "" ? fail(`${name} is required.`) : value;
};

const result = await promoteStableRelease({
  version,
  tag,
  commit,
  bearerToken: requireSecret("AXM_RELEASE_CONTROL_TOKEN"),
  accessClientId: requireSecret("AXM_CONTROL_ACCESS_CLIENT_ID"),
  accessClientSecret: requireSecret("AXM_CONTROL_ACCESS_CLIENT_SECRET"),
});

console.log(
  `${result.outcome}: stable=${result.document.version} revision=${String(result.document.revision)} etag=${result.etag}`,
);
