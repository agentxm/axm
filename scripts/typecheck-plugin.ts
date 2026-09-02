import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createNodesFromFiles } from "nx/src/devkit-exports";
import type { CreateNodesResultV2, CreateNodesV2 } from "nx/src/devkit-exports";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const projectHasBuildTarget = (configFile: string): boolean => {
  const projectFile: unknown = JSON.parse(
    readFileSync(join(dirname(configFile), "project.json"), "utf8"),
  );
  if (!isRecord(projectFile)) return false;
  const targets = projectFile["targets"];
  return isRecord(targets) && Object.hasOwn(targets, "build");
};

export const typecheckTargetGlob = "{packages/*,specifications}/tsconfig.spec.json";

export const createNodesV2: CreateNodesV2 = [
  typecheckTargetGlob,
  (configFiles, options, context): Promise<CreateNodesResultV2> =>
    createNodesFromFiles(
      (configFile) => {
        const projectRoot = dirname(configFile);
        return {
          projects: {
            [projectRoot]: {
              targets: {
                typecheck: {
                  executor: "nx:run-commands",
                  cache: true,
                  dependsOn: [
                    ...(projectHasBuildTarget(configFile) ? ["build"] : []),
                    "^typecheck",
                  ],
                  inputs: [
                    "{projectRoot}/package.json",
                    "{projectRoot}/tsconfig*.json",
                    "{projectRoot}/**/*.ts",
                    "!{projectRoot}/dist/**",
                    "!{projectRoot}/out-tsc/**",
                    "sharedGlobals",
                    "^production",
                    { externalDependencies: ["@typescript/native"] },
                  ],
                  outputs: ["{projectRoot}/out-tsc/typecheck"],
                  syncGenerators: ["@nx/js:typescript-sync"],
                  options: {
                    command:
                      "tsc -p tsconfig.spec.json --noEmit --tsBuildInfoFile out-tsc/typecheck/tsconfig.spec.tsbuildinfo",
                    cwd: projectRoot,
                  },
                  metadata: {
                    description:
                      "Typecheck project tests against the built library without sharing build outputs",
                  },
                },
              },
            },
          },
        };
      },
      configFiles,
      options,
      context,
    ),
];
