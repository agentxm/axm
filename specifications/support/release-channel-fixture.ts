export const stableChannelDocument = (version = "2.0.0", revision = 3) => {
  const tag = `cli-v${version}`;
  const assetUrl = (name: string) =>
    `https://github.com/agentxm/axm/releases/download/${tag}/${name}`;
  const digest = "a".repeat(64);
  return {
    schema: "axm.release-channel/v1",
    channel: "stable",
    revision,
    version,
    release: {
      repository: "agentxm/axm",
      tag,
      commit: "b".repeat(40),
      publishedAt: "2026-09-03T17:00:00Z",
    },
    artifacts: {
      checksumManifest: {
        name: "SHA256SUMS",
        url: assetUrl("SHA256SUMS"),
        sha256: digest,
      },
      binaries: [
        ["darwin-arm64", "axm-darwin-arm64"],
        ["darwin-x64", "axm-darwin-x64"],
        ["linux-arm64", "axm-linux-arm64"],
        ["linux-x64", "axm-linux-x64"],
        ["windows-x64", "axm-windows-x64.exe"],
      ].map(([target, name]) => ({ target, name, url: assetUrl(name ?? ""), sha256: digest })),
    },
    promotedAt: "2026-09-03T17:01:00Z",
  };
};
