import * as crypto from "node:crypto";

export const hashContent = (content: string) =>
  crypto.createHash("sha256").update(content).digest("hex");
