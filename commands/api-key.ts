import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";

function readEnvFile(path: string): Record<string, string> {
  const values: Record<string, string> = {};
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
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
  } catch {
    // No .env in this directory; fall back to the process environment.
  }
  return values;
}

function sessionApiKey(): string | undefined {
  const env = readEnvFile(join(process.cwd(), ".env"));
  return (
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_KEY ||
    env.OPENROUTER_API_KEY ||
    env.OPENROUTER_KEY
  );
}

function maskKey(key: string): string {
  const openRouter = key.match(/^(sk-or-v1-)(.{4})/);
  if (openRouter) return `${openRouter[1]}${openRouter[2]}***`;
  return `${key.slice(0, 4)}***`;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("api-key", {
    description: "Show the session API key (masked)",
    handler: async (_args, ctx) => {
      const key = sessionApiKey();
      if (!key) {
        ctx.ui.notify("No session API key found in the environment or .env.", "warning");
        return;
      }
      ctx.ui.notify(maskKey(key), "info");
    },
  });
}
