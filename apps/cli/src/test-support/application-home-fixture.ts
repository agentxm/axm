/**
 * Disposable platform and application homes.
 *
 * `AXM_USER_HOME` selects where AXM keeps user resources; an example that
 * proves the selection needs both homes to exist and be observable, and needs
 * the platform one populated as an adversarial input.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface ApplicationHomeFixture {
  readonly root: string;
  readonly platformHome: string;
  readonly applicationHome: string;
  readonly invoking: string;
  readonly cleanup: () => void;
}

export const makeApplicationHomeFixture = (): ApplicationHomeFixture => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-application-home-")));
  const platformHome = path.join(root, "platform-home");
  const applicationHome = path.join(root, "application-home");
  const invoking = path.join(root, "invoking");
  for (const directory of [platformHome, applicationHome, invoking]) fs.mkdirSync(directory);
  return {
    root,
    platformHome,
    applicationHome,
    invoking,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};
