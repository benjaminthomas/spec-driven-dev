# Repository audit

Builds the first `{specs_dir}/CONTEXT.md`. It is deliberately **shallow**: map the project now,
and let each feature add detail for the areas it touches. Use the **light** model tier
(`models.<tool>.light`) where the host can choose a model for a subagent, because this is
summarising, not reasoning.

## 1. New or existing project?

Use `context.project` from `.spec-driven.yml` if it's set (the npm CLI asks this). Otherwise
detect it, then confirm in one line instead of asking blind:

- `git rev-list --count HEAD` (commits) and `git ls-files | wc -l` (tracked files).
- **Existing** if there are 20 or more commits or 50 or more tracked files. **New** otherwise.
- Ask outright only when it's unclear, for example a fresh repo created from a large template.

Example: "This looks like an existing project (412 commits, 1,830 files). I'll audit it. OK?"

## 2a. Existing project: audit with small outputs

Prefer commands whose output is short over opening files. For a multi-repo workspace, run them per
repo and give each repo its own row in **Areas**.

| What | How (cheap) |
|---|---|
| Layout and size | `git ls-files \| cut -d/ -f1-2 \| sort \| uniq -c \| sort -rn \| head -30` |
| Stack and commands | manifests (`package.json`, `go.mod`, `pyproject.toml`, …), CI workflow files |
| Busy areas | `git log --since=6.months --name-only --format= \| cut -d/ -f1-2 \| sort \| uniq -c \| sort -rn \| head -15` |
| Written rules | `README*`, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `docs/adr*`, PR templates |
| Conventions | read 2–3 representative files in the busiest areas, not every file |

**Graph (optional).** If `context.graph` isn't `off` and `graphify-out/graph.json` exists, or
`graphify` is on the PATH: use it for structure instead of reading code. Prefer
`graphify query "<question>" --budget 1500` and `graphify path "<A>" "<B>"`, and never load
`GRAPH_REPORT.md` in full. Treat INFERRED or AMBIGUOUS edges as hints to check, not facts. Never
install graphify yourself. If it isn't installed and the repo is large (more than about 2,000
tracked files), mention once: "Optional: graphify (`uv tool install graphifyy`) makes code
navigation cheaper on big repos." Record the answer as `context.graph: off` if they decline, so you
never ask again.

## 3. Discovery questions (one round)

Show the draft map first, with each line marked **detected** (with its source) or **guess**. Then
ask only what the code can't answer, as **plain text in one message**. These are open questions, so
never put them in a menu or multiple-choice tool (a menu needs two or more real options, and these
have none). The user replies in their own words, or "skip":

- What does the product do, and who uses it?
- Which areas are legacy, frozen, or off-limits?
- Known fragile spots or recurring pain?
- Where is it heading in the next few months?
- Rules that live in people's heads (e.g. "every API change needs versioning")?

Anything they skip stays out. Don't guess to fill gaps.

## 2b. New project: record intent

There's nothing to audit. Ask about the intended stack, conventions, and architecture choices, and
save them as the first entries under **Conventions** and **Decisions**, marked `(you told me)`.

## 4. Write and record

- Write `CONTEXT.md` from `context-template.md`, within 60 lines. Create an area file only where
  you learned more than fits in one line. Most areas start with none.
- Put the audited commit on the index's header line (`audited at <short sha> (<date>)`).
- Never write secrets. Ask before saving sensitive business details.
- Report: the file path, the number of areas, and what was skipped.

## Refresh (re-running the audit)

Never start over. Read the commit on the index's header line, then look at
`git diff --stat <that commit>..HEAD` and re-check only the areas whose files changed. Update those
lines, move superseded ones to `context/archive.md`, and update the header commit.
