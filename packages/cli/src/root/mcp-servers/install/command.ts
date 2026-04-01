import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../../command-meta.js";
import { scopeFlag } from "../../../cli-flags.js";
import { handleInstallMcpServer } from "./handler.js";
import { withWorkspace } from "../../../runtime.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Registry MCP server reference (@profile/mcp-servers/name or bare name)",
    ),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: forceFlag.pipe(Flag.withDescription("Reinstall even if the MCP server already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
} as const;
const commandMeta = registryCommandMeta("mcp-servers install", { json: true });

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview }) =>
    handleInstallMcpServer({ source }, { yes, force, preview }).pipe(
      withWorkspace(scope),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(installConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Install an MCP server from a registry"),
  Command.withExamples([
    {
      command: "axm mcp-servers install @acme/mcp-servers/my-server",
      description: "Add an MCP server from the registry",
    },
    {
      command: "axm mcp-servers install my-server",
      description: "Install using your default profile",
    },
    {
      command: "axm mcp-servers install @acme/mcp-servers/my-server --preview",
      description: "See what would be installed first",
    },
    { command: "", description: "See also: mcp-servers uninstall" },
  ]),
);
