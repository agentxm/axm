// Like the other subprocess fixtures, this observes a shipped CLI artifact.
// It receives only disposable identity components, never credential values.
import {
  mcpSecretAccount,
  mcpRegistryResolutionKey,
} from "../../../cli/dist/src/specification-harness.js";

const requests = JSON.parse(process.argv[2] ?? "null");
if (!Array.isArray(requests) || requests.length !== 8)
  throw new Error("Expected exactly eight disposable identity requests");

const accounts = requests.map((request) => {
  if (
    typeof request !== "object" ||
    request === null ||
    ["scopeRoot", "localName", "inputName", "authority", "owner", "name"].some(
      (key) => typeof request[key] !== "string",
    )
  )
    throw new Error("Invalid disposable identity request");
  return mcpSecretAccount({
    scopeRoot: request.scopeRoot,
    localName: request.localName,
    inputName: request.inputName,
    sourceIdentity: mcpRegistryResolutionKey({
      authority: request.authority,
      owner: request.owner,
      name: request.name,
    }),
  });
});

process.stdout.write(JSON.stringify(accounts));
