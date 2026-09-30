import type { CreateNodesV2 } from "nx/src/devkit-exports";

/** Host staging consumes the single platform producer; it never compiles again. */
export const hostCompileTarget = (platform: string, architecture: string): string => {
  const host = `${platform === "win32" ? "windows" : platform}-${architecture}`;
  if (!["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "windows-x64"].includes(host)) {
    throw new Error(`Unsupported native CLI host ${host}`);
  }
  return `compile-${host}`;
};

export const createNodesV2: CreateNodesV2 = [
  "apps/cli/project.json",
  async (files) =>
    files.map((file) => [
      file,
      {
        projects: {
          "apps/cli": {
            targets: {
              "compile-host": { dependsOn: [hostCompileTarget(process.platform, process.arch)] },
            },
          },
        },
      },
    ]),
];
