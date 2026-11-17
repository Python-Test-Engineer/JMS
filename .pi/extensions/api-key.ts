/**
 * API-key commands for this project.
 *
 * /api-key     — show which key the Pi session is actually using (masked).
 * /login-env   — use OPENROUTER_API_KEY (or OPENROUTER_KEY) from the project
 *                .env as a non-persistent runtime key, so requests are billed
 *                to that key for the rest of this Pi process.
 *
 * Keys are never printed in full: only the provider prefix and the last four
 * characters, e.g. sk-or-v1-*********76b9.
 */

import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const KEY_NAMES = ["OPENROUTER_API_KEY", "OPENROUTER_KEY"] as const;

type RuntimeKeySetter = {
	setRuntimeApiKey?: (providerId: string, apiKey: string) => Promise<void>;
	removeRuntimeApiKey?: (providerId: string) => Promise<void>;
};

function readDotEnv(dir: string): Record<string, string> {
	const file = path.join(dir, ".env");
	if (!fs.existsSync(file)) return {};
	const values: Record<string, string> = {};
	for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
		if (!match) continue;
		let value = match[2];
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		values[match[1]] = value;
	}
	return values;
}

function envKey(dir: string): { key: string; source: string } {
	const fileEnv = readDotEnv(dir);
	for (const name of KEY_NAMES) {
		const value = fileEnv[name];
		if (value) return { key: value, source: `.env (${name})` };
	}
	for (const name of KEY_NAMES) {
		const value = process.env[name];
		if (value) return { key: value, source: `environment (${name})` };
	}
	return { key: "", source: "not found" };
}

/** Pi's ModelRegistry facade keeps its ModelRuntime in a private field; runtime API keys are only exposed there. */
function runtimeKeyApi(ctx: { modelRegistry: unknown }): RuntimeKeySetter | undefined {
	return (ctx.modelRegistry as { runtime?: RuntimeKeySetter }).runtime;
}

export function maskKey(key: string): string {
	if (!key) return "not configured";
	const tail = key.slice(-4);
	const prefix = key.startsWith("sk-or-v1-")
		? "sk-or-v1-"
		: key.startsWith("sk-ant-")
			? "sk-ant-"
			: key.startsWith("sk-")
				? "sk-"
				: "";
	return `${prefix}*********${tail}`;
}

export default function apiKeyExtension(pi: ExtensionAPI) {
	// Providers switched to the .env key during this process (for clearer labels only).
	const envOverrides = new Set<string>();

	pi.registerCommand("api-key", {
		description: "Show the API key in use by this Pi session, masked to the last 4 digits",
		handler: async (args, ctx) => {
			const provider = (args.trim() || ctx.model?.provider || "openrouter").toLowerCase();
			const modelLabel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no active model";

			let auth: Awaited<ReturnType<typeof ctx.modelRegistry.getProviderAuth>>;
			try {
				auth = await ctx.modelRegistry.getProviderAuth(provider);
			} catch (error) {
				ctx.ui.notify(
					`Could not resolve Pi auth for ${provider}: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
				return;
			}

			const key = auth?.auth?.apiKey;
			if (!key) {
				ctx.ui.notify(
					`Pi session key: not configured for ${provider} (active model: ${modelLabel}). ` +
						"Run /login or /login-env to add credentials.",
					"warning",
				);
				return;
			}

			const status = ctx.modelRegistry.getProviderAuthStatus(provider);
			let source = auth?.source ? ` — source: ${auth.source}` : "";
			if (status?.source === "runtime") {
				source = ` — source: runtime override${envOverrides.has(provider) ? " (.env)" : ""}`;
			}
			ctx.ui.notify(
				`Pi session key (${provider}): ${maskKey(key)}${source} — active model: ${modelLabel}`,
				"info",
			);
		},
	});

	pi.registerCommand("login-env", {
		description: "Use the .env API key as this Pi session's runtime key (billed until Pi exits)",
		handler: async (args, ctx) => {
			const clear = args.split(/\s+/).includes("--clear");
			const provider = (args.replace("--clear", "").trim() || ctx.model?.provider || "openrouter").toLowerCase();
			const runtime = runtimeKeyApi(ctx);
			if (!runtime?.setRuntimeApiKey) {
				ctx.ui.notify(
					"/login-env: this Pi build does not expose runtime API keys; use `pi --api-key` at startup instead.",
					"error",
				);
				return;
			}

			if (clear) {
				if (!runtime.removeRuntimeApiKey) {
					ctx.ui.notify("/login-env: this Pi build cannot clear runtime API keys.", "error");
					return;
				}
				await runtime.removeRuntimeApiKey(provider);
				envOverrides.delete(provider);
				const restored = await ctx.modelRegistry.getProviderAuth(provider).catch(() => undefined);
				const restoredKey = restored?.auth?.apiKey;
				ctx.ui.notify(
					`/login-env: cleared the ${provider} runtime key. ` +
						(restoredKey ? `Now using ${maskKey(restoredKey)} from ${restored?.source ?? "Pi credentials"}.` : "No Pi credential remains."),
					"info",
				);
				ctx.ui.setStatus("api-key", undefined);
				return;
			}

			const { key, source } = envKey(ctx.cwd);
			if (!key) {
				ctx.ui.notify(
					`/login-env: no key found. Set ${KEY_NAMES.join(" or ")} in ${path.join(ctx.cwd, ".env")}.`,
					"error",
				);
				return;
			}

			const previous = await ctx.modelRegistry.getProviderAuth(provider).catch(() => undefined);
			const previousKey = previous?.auth?.apiKey;

			try {
				await runtime.setRuntimeApiKey(provider, key);
			} catch (error) {
				ctx.ui.notify(
					`/login-env: could not set the ${provider} runtime key: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
				return;
			}

			// Confirm Pi's own resolver now returns the .env key, not the old auth.json one.
			const resolved = await ctx.modelRegistry.getProviderAuth(provider).catch(() => undefined);
			const resolvedKey = resolved?.auth?.apiKey ?? "";
			if (resolvedKey !== key) {
				ctx.ui.notify(
					`/login-env: set ${provider} runtime key to ${maskKey(key)}, but Pi still resolves ` +
						`${resolvedKey ? maskKey(resolvedKey) : "no key"}. Requests may not be billed to .env.`,
					"warning",
				);
				return;
			}

			envOverrides.add(provider);
			const was = previousKey
				? previousKey === key
					? " (already the active key)"
					: ` — previous: ${maskKey(previousKey)}`
				: "";
			ctx.ui.notify(
				`/login-env: ${provider} now billed to ${maskKey(key)} from ${source}${was}. ` +
					"Runtime override only; it ends when this Pi process exits.",
				"info",
			);
			ctx.ui.setStatus("api-key", `key ${maskKey(key)} (.env)`);
		},
	});
}
