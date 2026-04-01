/**
 * Install metadata module.
 *
 * Reads and writes `install-meta.json` which records the installation method
 * and timestamp for the axm binary.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export type { InstallMetaData, InstallMetaService } from "./install-meta.js";
export {
  InstallMeta,
  InstallMetaDataSchema,
  InstallMetaLive,
  InstallMetaTest,
  readInstallMeta,
  writeInstallMeta,
} from "./install-meta.js";
