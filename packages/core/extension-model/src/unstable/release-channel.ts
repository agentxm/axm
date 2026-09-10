import * as Schema from "effect/Schema";
import * as semver from "semver";

/** @experimental This API is unstable and may change without notice. */
export const STABLE_CHANNEL_SCHEMA = "axm.release-channel/v1";

/** @experimental This API is unstable and may change without notice. */
export const STABLE_CHANNEL_URL = "https://releases.axm.sh/v1/channels/stable.json";

/** @experimental This API is unstable and may change without notice. */
export const STABLE_CHANNEL_REPOSITORY = "agentxm/axm";

const Sha256Schema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[0-9a-f]{64}$/u, {
      message: "Expected a lowercase SHA-256 digest",
    }),
  ),
);

const UtcInstantSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => {
      if (!value.endsWith("Z") || Number.isNaN(Date.parse(value))) {
        return "Expected a valid UTC RFC 3339 instant";
      }
      return undefined;
    }),
  ),
);

const StableVersionSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => {
      const normalized = semver.valid(value);
      return normalized === value && semver.prerelease(value) === null
        ? undefined
        : "Expected a normalized stable semantic version without a leading v";
    }),
  ),
);

const ReleaseBinarySchema = <Target extends string, Name extends string>(
  target: Target,
  name: Name,
) =>
  Schema.Struct({
    target: Schema.Literal(target),
    name: Schema.Literal(name),
    url: Schema.String,
    sha256: Sha256Schema,
  });

const StableChannelDocumentShape = Schema.Struct({
  schema: Schema.Literal(STABLE_CHANNEL_SCHEMA),
  channel: Schema.Literal("stable"),
  revision: Schema.Int.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(1, { message: "Expected a positive revision" })),
  ),
  version: StableVersionSchema,
  release: Schema.Struct({
    repository: Schema.Literal(STABLE_CHANNEL_REPOSITORY),
    tag: Schema.String,
    commit: Schema.String.pipe(
      Schema.check(
        Schema.isPattern(/^[0-9a-f]{40}$/u, {
          message: "Expected a lowercase 40-character Git object ID",
        }),
      ),
    ),
    publishedAt: UtcInstantSchema,
  }),
  artifacts: Schema.Struct({
    checksumManifest: Schema.Struct({
      name: Schema.Literal("SHA256SUMS"),
      url: Schema.String,
      sha256: Sha256Schema,
    }),
    binaries: Schema.Tuple([
      ReleaseBinarySchema("darwin-arm64", "axm-darwin-arm64"),
      ReleaseBinarySchema("darwin-x64", "axm-darwin-x64"),
      ReleaseBinarySchema("linux-arm64", "axm-linux-arm64"),
      ReleaseBinarySchema("linux-x64", "axm-linux-x64"),
      ReleaseBinarySchema("windows-x64", "axm-windows-x64.exe"),
    ]),
  }),
  promotedAt: UtcInstantSchema,
});

type StableChannelDocumentShape = typeof StableChannelDocumentShape.Type;

const expectedAssetUrl = (tag: string, name: string): string =>
  `https://github.com/${STABLE_CHANNEL_REPOSITORY}/releases/download/${tag}/${name}`;

const validateStableChannelDocument = (
  document: StableChannelDocumentShape,
): ReadonlyArray<Schema.FilterIssue> => {
  const issues: Array<Schema.FilterIssue> = [];
  const expectedTag = `cli-v${document.version}`;
  if (document.release.tag !== expectedTag) {
    issues.push(`release.tag must equal ${expectedTag}`);
  }

  const checksumUrl = expectedAssetUrl(expectedTag, document.artifacts.checksumManifest.name);
  if (document.artifacts.checksumManifest.url !== checksumUrl) {
    issues.push(`artifacts.checksumManifest.url must equal ${checksumUrl}`);
  }

  for (const binary of document.artifacts.binaries) {
    const url = expectedAssetUrl(expectedTag, binary.name);
    if (binary.url !== url) {
      issues.push(`artifact URL for ${binary.name} must equal ${url}`);
    }
  }

  if (Date.parse(document.promotedAt) < Date.parse(document.release.publishedAt)) {
    issues.push("promotedAt must not be earlier than release.publishedAt");
  }
  return issues;
};

/**
 * Public stable-channel document. Exact-version artifacts remain hosted by the
 * immutable GitHub Release coordinate contained in this validated document.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const StableChannelDocumentV1Schema = StableChannelDocumentShape.pipe(
  Schema.check(Schema.makeFilter(validateStableChannelDocument)),
);

/** @experimental This API is unstable and may change without notice. */
export type StableChannelDocumentV1 = typeof StableChannelDocumentV1Schema.Type;

/** @experimental This API is unstable and may change without notice. */
export const decodeStableChannelDocument = Schema.decodeUnknownEffect(
  StableChannelDocumentV1Schema,
);

/** @experimental This API is unstable and may change without notice. */
export const decodeStableChannelDocumentSync = Schema.decodeUnknownSync(
  StableChannelDocumentV1Schema,
);
