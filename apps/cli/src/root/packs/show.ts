import { handleLocalInspection, makeLocalShowCommand } from "../show/command.js";

export const handlePacksShow = (target: string, agents: ReadonlyArray<string> = []) =>
  handleLocalInspection({
    selection: { kind: "identities", identities: [target] },
    types: ["pack"],
    agents,
  });
export const showCommand = makeLocalShowCommand("pack");
