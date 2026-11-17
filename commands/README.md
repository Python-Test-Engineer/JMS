# Pi slash commands

This folder holds project-local Pi commands.

- `api-key.ts` — registers `/api-key`, which reads `OPENROUTER_API_KEY` (or
  `OPENROUTER_KEY`) from the process environment or the nearest `.env` and shows only
  the masked value, e.g. `sk-or-v1-a9ee***`.

The commands are loaded through `../.pi/settings.json`:

```json
{
  "extensions": ["../commands/api-key.ts"]
}
```

After adding or changing a command, run `/reload` in Pi.
