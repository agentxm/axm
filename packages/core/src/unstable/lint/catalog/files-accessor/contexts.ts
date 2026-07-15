import type { FilesAccessor, FilesRuleContext } from "../../context.js";

export interface InstalledFilesInfo {
  readonly filesJson: unknown;
  readonly displayRoot: string;
  readonly files: FilesAccessor;
}

export const buildFilesRuleContexts = (input: {
  readonly installedFiles: ReadonlyArray<InstalledFilesInfo>;
}): ReadonlyArray<FilesRuleContext> =>
  input.installedFiles.map((info): FilesRuleContext => ({
    subject: {
      filesJson: info.filesJson,
    },
    files: info.files,
    displayRoot: info.displayRoot,
  }));
