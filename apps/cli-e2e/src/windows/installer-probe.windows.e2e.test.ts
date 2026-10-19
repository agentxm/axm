import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createTempDir, runCommand } from "@agentxm/client-e2e-utils";
import { describe, expect, it } from "vitest";

export const executionBinding = {
  requirements: ["system/installability/native-installers-probe-without-telemetry"],
  boundary: "process",
  rationale:
    "PowerShell's parser loads the actual installer probe helper, which invokes a native fixture executable recording its environment; the caller's absent, empty and set values are compared after successful and failing probes. Full PowerShell/cmd installation remains in the installed-product lane.",
} as const;

const installer = fileURLToPath(new URL("../../../cli/site-content/install.ps1", import.meta.url));

const exercise = `
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$tree = [Management.Automation.Language.Parser]::ParseFile($env:AXM_TEST_INSTALLER, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'Installer did not parse' }
$helper = $tree.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-AxmVersion' }, $true)
if (-not $helper) { throw 'Installer has no version probe helper' }
. ([ScriptBlock]::Create($helper.Extent.Text))
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class ProbeFixture {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool SetEnvironmentVariable(string name, string value);
  public static void Main() {
    File.AppendAllText(Environment.GetEnvironmentVariable("AXM_TEST_PROBE_LOG"), Environment.GetEnvironmentVariable("AXM_TELEMETRY") + "\\n");
    Console.WriteLine("1.2.3");
    Environment.Exit(Environment.GetEnvironmentVariable("AXM_TEST_PROBE_FAIL") == "1" ? 1 : 0);
  }
}
'@ -OutputAssembly $env:AXM_TEST_PROBE_EXE -OutputType ConsoleApplication
[Reflection.Assembly]::LoadFrom($env:AXM_TEST_PROBE_EXE) | Out-Null
if ($env:AXM_TEST_PARENT_CHOICE -eq 'absent') { [Environment]::SetEnvironmentVariable('AXM_TELEMETRY', $null, 'Process') }
elseif ($env:AXM_TEST_PARENT_CHOICE -eq 'empty') { [ProbeFixture]::SetEnvironmentVariable('AXM_TELEMETRY', '') | Out-Null }
else { $env:AXM_TELEMETRY = 'all' }
$before = [Environment]::GetEnvironmentVariables('Process')
$failed = $false
try { $version = Get-AxmVersion -Path $env:AXM_TEST_PROBE_EXE }
catch { $failed = $true }
$after = [Environment]::GetEnvironmentVariables('Process')
@{
  failed = $failed
  beforePresent = $before.Contains('AXM_TELEMETRY')
  before = $before['AXM_TELEMETRY']
  afterPresent = $after.Contains('AXM_TELEMETRY')
  after = $after['AXM_TELEMETRY']
} | ConvertTo-Json -Compress
`;

describe("Windows installer probe environment", () => {
  for (const parent of ["absent", "empty", "all"]) {
    for (const failure of [false, true]) {
      it(`preserves ${parent} after a ${failure ? "failing" : "successful"} native probe`, async () => {
        expect(process.platform).toBe("win32");
        const fixture = createTempDir("axm-probe-environment-");
        try {
          const script = path.join(fixture.path, "exercise.ps1");
          const log = path.join(fixture.path, "probes.log");
          fs.writeFileSync(script, exercise);
          const result = await runCommand(
            "powershell",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
            {
              cwd: fixture.path,
              env: {
                AXM_TEST_INSTALLER: installer,
                AXM_TEST_PROBE_EXE: path.join(fixture.path, "probe.exe"),
                AXM_TEST_PROBE_LOG: log,
                AXM_TEST_PROBE_FAIL: failure ? "1" : "0",
                AXM_TEST_PARENT_CHOICE: parent,
              },
            },
          );
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          const value = parent === "absent" ? null : parent === "empty" ? "" : "all";
          expect(JSON.parse(result.stdout)).toEqual({
            failed: failure,
            beforePresent: parent !== "absent",
            before: value,
            afterPresent: parent !== "absent",
            after: value,
          });
          expect(fs.readFileSync(log, "utf8").trim()).toBe("0");
        } finally {
          fixture.cleanup();
        }
      });
    }
  }
});
