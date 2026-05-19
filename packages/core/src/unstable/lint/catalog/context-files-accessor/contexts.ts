import type { ContextFilesAccessor, ContextFilesRuleContext } from "../../context.js";

export interface InstalledContextFilesInfo {
  readonly contextFilesJson: unknown;
  readonly displayRoot: string;
  readonly files: ContextFilesAccessor;
}

export const buildContextFilesRuleContexts = (input: {
  readonly installedContextFiles: ReadonlyArray<InstalledContextFilesInfo>;
}): ReadonlyArray<ContextFilesRuleContext> =>
  input.installedContextFiles.map(
    (info): ContextFilesRuleContext => ({
      subject: {
        contextFilesJson: info.contextFilesJson,
      },
      files: info.files,
      displayRoot: info.displayRoot,
    }),
  );
