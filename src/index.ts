import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWriteOverride } from "./tool-overrides.js";
import { registerEditOverride } from "./tool-overrides.js";
import {
    sessionReviewIds,
    sessionApproveAll,
    isVscodeReady,
    cleanupPiDir,
    setVscodeNotOpenWarned,
} from "./review-lifecycle.js";

export default function (pi: ExtensionAPI) {
    // Reset review ID tracking on new session.
    // Re-check VS Code availability — user may have opened/closed VS Code since last session.
    pi.on("session_start", () => {
        sessionReviewIds.clear();
        sessionApproveAll.clear();
        setVscodeNotOpenWarned(false);

        const cwd = process.cwd();
        if (!isVscodeReady(cwd)) {
            console.warn(
                "⚠️  VS Code not detected — working without diff review. " +
                "All file changes will be applied directly. " +
                "Open this project in VS Code with Serhioromano.vscode-pi-sr extension " +
                "installed to enable visual review."
            );
            setVscodeNotOpenWarned(true);
        }
    });

    // Approve All persists across turns within one prompt.
    // before_agent_start fires once per user prompt — clears here.
    pi.on("before_agent_start", () => {
        sessionApproveAll.clear();
    });

    pi.on("message_end", () => {
        cleanupPiDir();
    });

    registerWriteOverride(pi);
    registerEditOverride(pi);
}
