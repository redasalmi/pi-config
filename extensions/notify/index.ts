/**
 * Pi Notify Extension
 *
 * Sends a native terminal notification when Pi agent is done and waiting for input.
 * Supports multiple terminal protocols:
 * - OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
 * - OSC 99: Kitty
 * - Windows toast: Windows Terminal (WSL)
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WINDOWS_POWERSHELL_APP_ID =
	"{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

function quotePowerShell(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function windowsToastScript(title: string, body: string): string {
	const type = "Windows.UI.Notifications";
	const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
	const template = `[${type}.ToastTemplateType]::ToastText02`;
	const toast = `[${type}.ToastNotification]::new($xml)`;
	return [
		`${mgr} > $null`,
		`$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
		`$text = $xml.GetElementsByTagName('text')`,
		`$text[0].AppendChild($xml.CreateTextNode(${quotePowerShell(title)})) > $null`,
		`$text[1].AppendChild($xml.CreateTextNode(${quotePowerShell(body)})) > $null`,
		`[${type}.ToastNotificationManager]::CreateToastNotifier(${quotePowerShell(WINDOWS_POWERSHELL_APP_ID)}).Show(${toast})`,
	].join("; ");
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

function notifyWindows(title: string, body: string): void {
	execFile("powershell.exe", ["-NoProfile", "-Command", windowsToastScript(title, body)], (error) => {
		if (error) console.error(`Pi Windows notification failed: ${error.message}`);
	});
}

function notify(title: string, body: string): void {
	if (process.env.WT_SESSION) {
		notifyWindows(title, body);
	} else if (process.env.KITTY_WINDOW_ID) {
		notifyOSC99(title, body);
	} else {
		notifyOSC777(title, body);
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("agent_settled", async (_event, ctx) => {
		if (ctx.mode !== "tui" || !ctx.isIdle()) return;
		notify("Pi", "Ready for input");
	});
}
