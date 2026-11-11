# Choosing the repos of a multi-repo workspace

People can't choose from folder names alone, and every team's machine looks different. Do the
homework first, then recommend a selection with reasons. Work from evidence, never from the names.

## 1. Find candidates (any folder layout)

- Git repos below the workspace folder. Start two levels down; go deeper only when the layout calls
  for it (`~/code/github.com/<org>/<repo>`, `~/work/<client>/<repo>`). Skip worktrees (their `.git`
  is a file), `node_modules`, vendor and build folders.
- Repos in `{specs_dir}/team-repos.yml` if it exists, including ones not cloned here.
- Repos the user names from other folders, and git submodules of the current repo.
- **Lots of repos?** Don't list them all. Rank by the evidence below and show the top 8 or so, then
  "N other repos found, name any you want added".

## 2. For each candidate, gather (cheap commands; read only what's needed)

**What it is**, in one line. The first that exists:
1. `team-repos.yml` role.
2. README's first heading and paragraph. Skip boilerplate from a framework template.
3. Manifest description: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` module path,
   `pom.xml`/`build.gradle` artifact, `composer.json`.
4. `AGENTS.md`/`CLAUDE.md` first lines.
5. Its shape: main folders and entry point (e.g. "a Go service with `cmd/worker`").

**How it connects to the current repo.** Search the current repo (and the candidate) for any of
these, and quote one piece of evidence with `path:line`:

| Link | What to look for |
|---|---|
| Runtime calls | the candidate's name, hostnames, base-URL env vars, API paths, in code, `.env.example`, config |
| Contracts | OpenAPI/Swagger clients, GraphQL schemas, gRPC/protobuf files, generated SDKs naming the other service |
| Packages | one repo depends on the other's package (npm, PyPI, Go module, Maven, NuGet, internal registry) |
| Infrastructure | `docker-compose` services, Kubernetes/Helm manifests, Terraform, CI jobs that check out the other repo |
| Messages and data | queue or topic names, event names, a shared database or schema both mention |
| Code layout | git submodules, shared generated code, copied types |
| Docs | `README`, `AGENTS.md`, architecture docs saying "calls X" or "consumed by Y". A passing mention ("unlike X") is not a link |

**Whether the user works on it:** `git log --since=90.days --author="$(git config user.email)"
--oneline | wc -l`. Use it as a hint only. A new team member has no commits anywhere, so recommend
from code links and `team-repos.yml` alone, and don't mention commits.

**Owner:** `git remote get-url origin`. Same organisation is weak evidence, never enough alone.

## 3. Recommend, then ask once

Group the candidates:
- **I'd include**: the current repo, plus repos with a real link (any row above). Give the reason
  and the evidence for each.
- **Probably not needed for this repo**: the rest, each with a short why ("no link found").
- **No links found at all?** Say so plainly and ask the user to describe which repos change together
  with this one. Some systems connect only through a shared database or a message queue the code
  doesn't name.

Ask it with the host's interactive question tool when there is one: after the layout question, a
`multiSelect` question with **one option per repo** (never bundles of repos), the recommended ones
first, evidence in each option's description, 2–4 options. End the question text with the other
repos found by name and how to add them ("choose *Type something* and enter names or paths, e.g.
`old-admin, ~/Work/billing`"), since the menu only shows 4. Otherwise as text.
Shape of the question, with placeholders rather than real names:

> I found 6 repos under ~/code/github.com/acme. Based on the code, I'd include:
> - ✓ **orders-api**: this repo, the orders REST service (FastAPI)
> - ✓ **payments-worker**: a Go worker. `docker-compose.yml:31` runs it next to this API, and both
>   use the `payment.requested` queue (`app/events.py:12`)
> - ✓ **storefront-web**: React app. Its generated client `src/api/orders.ts` is built from this
>   repo's OpenAPI spec
>
> Probably not needed for this repo:
> - **design-tokens**, **marketing-site**, **old-admin**: no link to orders-api found
>
> Keep these three, or add any of the others (or a repo from another folder)? You can change this
> any time: "add old-admin to the workspace".

Rules:
- Never pick for the user silently, and never include a repo because it's in the same folder.
- Someone new should be able to answer "yes". An expert can adjust.
- Fewer repos is better: investigations search every listed repo, so extra ones cost tokens.
- Write nothing until they answer, and show the chosen repos again in the final summary.
