# Automation with Task Relay

Place reviewed source checkouts at `tools/api-drift-guard` and `tools/task-relay`.
Commit the API baseline and candidate JSON files through your normal process.
Task Relay can block a dependent build when contract drift requires review:

```json
{
  "version": 1,
  "tasks": {
    "api-contract": {
      "command": ["$node", "tools/api-drift-guard/bin/api-drift-guard.mjs", "--base", "contracts/base.json", "--head", "contracts/head.json", "--format", "json"],
      "timeoutMs": 30000
    },
    "build": {
      "command": ["$node", "scripts/build.mjs"],
      "needs": ["api-contract"],
      "timeoutMs": 60000
    }
  }
}
```

Run with `node tools/task-relay/bin/task-relay.mjs run`. The paths above are
illustrative; use files and build scripts that exist in your project.

[Task Relay](https://github.com/Dcastroro/task-relay) skips the build if the
comparison exits 1 or 2. API Drift Guard itself never executes commands. Task
Relay does execute the explicitly configured commands with your user permissions;
review that graph before running it.

Task Relay's default report omits child output. To inspect this comparator's
value-free findings, run it directly or use Task Relay's bounded `--verbose`
mode for a trusted graph. Other tasks can print arbitrary sensitive output;
the comparator's output guarantees do not apply to unrelated commands.

Both tools run locally without runtime dependencies or service credentials.
No contract, report or comment is uploaded automatically.
