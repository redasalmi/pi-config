import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerReviewCommand } from "./commands.ts";

export default function (pi: ExtensionAPI) {
  registerReviewCommand(pi);
}
