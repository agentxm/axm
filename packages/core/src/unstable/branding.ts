const ESC = "\u001b[";
const ANSI_DIM = `${ESC}2m`;
const ANSI_RESET = `${ESC}0m`;

export const BRANDING = [
  "  ▄▀█ ▀▄▀ █▀▄▀█",
  "  █▀█ █ █ █ ▀ █",
  `  Agent Extension Manager ${ANSI_DIM}by Agent${ANSI_RESET}XM`,
  "",
  "  https://axm.sh | https://agentxm.ai",
].join("\n");
