/**
 * Pi Notify Extension
 *
 * Sends a native terminal notification when Pi agent is done and waiting for input.
 * Blocking extension UI prompts also notify by default; configure notifyPrompts in notify.json.
 * Supports multiple terminal protocols:
 * - OSC 9: iTerm2
 * - OSC 777: Ghostty, WezTerm, rxvt-unicode
 * - OSC 99: Kitty
 * - Windows toast: Windows Terminal (WSL)
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

const WINDOWS_POWERSHELL_APP_ID =
	"{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

function readNotifyPrompts(ctx: ExtensionContext): boolean {
	try {
		const settings: unknown = JSON.parse(readFileSync(join(getAgentDir(), "notify.json"), "utf8"));
		if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
			throw new Error("Expected a settings object");
		}
		if (!("notifyPrompts" in settings)) return true;
		if (typeof settings.notifyPrompts !== "boolean") throw new Error("Expected a boolean notifyPrompts setting");
		return settings.notifyPrompts;
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT") && ctx.hasUI) {
			ctx.ui.notify(
				"Could not load notify.json; using notifyPrompts=true. Expected a JSON object with an optional boolean notifyPrompts setting.",
				"warning",
			);
		}
		return true;
	}
}

function notificationText(value: string): string {
	// Keep OSC payloads single-line, delimiter-safe, and below Kitty's byte limit.
	return Array.from(value.replace(/[;\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim())
		.slice(0, 120)
		.join("");
}

function quotePowerShell(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function windowsToastScript(title: string, body: string): string {
	const type = "Windows.UI.Notifications";
	const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
	const template = `[${type}.ToastTemplateType]::ToastText02`;
	const toast = `[${type}.ToastNotification]::new($xml)`;
	return [
		"$ErrorActionPreference = 'Stop'",
		`${mgr} > $null`,
		`$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
		`$text = $xml.GetElementsByTagName('text')`,
		`$text[0].AppendChild($xml.CreateTextNode(${quotePowerShell(title)})) > $null`,
		`$text[1].AppendChild($xml.CreateTextNode(${quotePowerShell(body)})) > $null`,
		`[${type}.ToastNotificationManager]::CreateToastNotifier(${quotePowerShell(WINDOWS_POWERSHELL_APP_ID)}).Show(${toast})`,
	].join("; ");
}

function notifyOSC9(title: string, body: string): void {
	process.stdout.write(`\x1b]9;${title}: ${body}\x07`);
}

function notifyOSC777(title: string, body: string): void {
	process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

function notifyOSC99(title: string, body: string): void {
	// Kitty OSC 99: share a unique id across chunks; the final chunk defaults to d=1.
	const id = randomUUID();
	process.stdout.write(`\x1b]99;i=${id}:d=0;${title}\x1b\\`);
	process.stdout.write(`\x1b]99;i=${id}:p=body;${body}\x1b\\`);
}

function notifyWindows(title: string, body: string, signal: AbortSignal, onError: (message: string) => void): void {
	execFile(
		"powershell.exe",
		["-NoProfile", "-NonInteractive", "-Command", windowsToastScript(title, body)],
		{ timeout: 5_000, windowsHide: true, signal },
		(error) => {
			if (!error || signal.aborted) return;
			onError(error.killed ? "PowerShell timed out" : notificationText(String(error.code ?? error.message)));
		},
	);
}

function notify(title: string, body: string, signal: AbortSignal, onError: (message: string) => void): void {
	if (process.env.WT_SESSION) {
		notifyWindows(title, body, signal, onError);
	} else if (process.env.KITTY_WINDOW_ID) {
		notifyOSC99(title, body);
	} else if (process.env.TERM_PROGRAM === "iTerm.app") {
		notifyOSC9(title, body);
	} else {
		notifyOSC777(title, body);
	}
}

export default function (pi: ExtensionAPI) {
	let controller = new AbortController();

	let notifyPrompts = true;

	function sendNotification(ctx: ExtensionContext, body: string): void {
		if (ctx.mode !== "tui" || controller.signal.aborted) return;
		const label = notificationText(pi.getSessionName() ?? "") || notificationText(basename(ctx.cwd));
		const title = label ? `Pi — ${label}` : "Pi";
		notify(title, notificationText(body), controller.signal, (message) => {
			ctx.ui.notify(`Pi Windows notification failed: ${message}`, "warning");
		});
	}

	pi.on("session_start", (_event, ctx) => {
		controller = new AbortController();
		notifyPrompts = readNotifyPrompts(ctx);
	});

	pi.on("session_shutdown", () => {
		controller.abort();
	});

	pi.on("agent_settled", (_event, ctx) => {
		if (!ctx.isIdle()) return;
		sendNotification(ctx, "Ready for input");
	});

	pi.on("ui_prompt_start", (_event, ctx) => {
		if (!notifyPrompts) return;
		sendNotification(ctx, "Waiting for your input");
	});
}
