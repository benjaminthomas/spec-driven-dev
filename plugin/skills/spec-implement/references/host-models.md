# Giving each coder its tier's model, per host

Checked against each tool's docs on 2026-11-11. Tried live: Claude Code and Cursor 3.24. These tools change fast: if a mechanism below is
rejected, fall back as SKILL.md says (session model, say so) and tell the user this page is stale.

| Host (`<tool>`) | Dispatch with a model | Values in `models.<tool>` | Effort |
|---|---|---|---|
| Claude Code (`claude`) | Agent tool `model` and `effort` parameters | `haiku`, `sonnet`, `opus`, `fable`, or a full model ID | `effort` parameter |
| Codex CLI (`codex`) | `spawn_agent` with a model; or a custom agent file `.codex/agents/<name>.toml` with `model =` (it wins over the spawn value); `agents.default_subagent_model` in `config.toml` as the fallback | Codex model IDs, e.g. `gpt-6-luna` | `model_reasoning_effort` in the agent file, or `agents.default_subagent_reasoning_effort` |
| Cursor (`cursor`) | Task tool `model` argument (confirmed in Cursor 3.24: `fast` and `inherit` both worked, no files needed); a custom subagent `.cursor/agents/<name>.md` with `model:` only if the Task tool rejects it | `fast`, `inherit`, or any model slug your plan offers, from any vendor (Claude, GPT/Codex, Gemini…); the Task tool's `model` parameter lists the accepted ones | in the slug where your plan offers it (e.g. a `-thinking-high` variant) |
| OpenCode (`opencode`) | the subagent (task) tool's model, or an agent file `.opencode/agents/<name>.md` with `mode: subagent` and `model:` | `provider/model`, e.g. `anthropic/claude-haiku-5-5`, `openai/gpt-6-luna` | a `#high`-style variant suffix where supported |
| Antigravity (`antigravity`) | `invoke_subagent` / agent file `model:` accepts a **tier only** | `flash_lite`, `flash`, `pro`, or `inherit` (no concrete model IDs) | not settable per subagent |

## Rules

- **Agent files are temporary.** If a host needs a file to pin a model (Codex, Cursor, OpenCode),
  write one per tier used (`spec-coder-light.md`, `-standard`, `-deep`) in the project's agent folder,
  with the coder instructions in the body. Delete them when the batch finishes, and never commit
  them. Don't overwrite an agent file of the same name that you didn't create.
- **Codex with ChatGPT sign-in** may reject a per-spawn model. Use the agent-file route instead.
- **Antigravity** can only move between Gemini tiers inside one session. To run a task on another
  vendor's model, the user switches the session (`agy --model …`); treat it as "host can't" for
  anything beyond the tiers.
- **Values come from config, never invented.** Use exactly what `models.<tool>.<tier>` says. A value
  of `default` means "the session's model": dispatch without a model.
- Report the model each coder actually ran on in the batch summary.
