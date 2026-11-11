# Trackers

Any tracker works if the AI tool can reach it: an MCP server, a CLI, or its REST API with a token
the user already has set up. `tracker.type` is just its name in lower case. The table covers the
common ones; for anything else, use the same approach with whatever tool is connected.

| `tracker.type` | Ticket ID looks like | Read it with | "Status" means | Attach a file |
|---|---|---|---|---|
| `jira` | `STP-123`, `*.atlassian.net/browse/STP-123` | Atlassian MCP, `acli`/`jira` CLI, REST | workflow transitions | REST `POST /rest/api/3/issue/{key}/attachments` (header `X-Atlassian-Token: no-check`), `acli`; the Rovo MCP server can't upload |
| `github` | `#482`, `owner/repo#482`, `github.com/…/issues/482` | `gh issue view`, GitHub MCP | open/closed, plus labels or a Projects status field | no upload API: list the files, or link them from the PR |
| `gitlab` | `#482`, `group/project#482`, `gitlab.com/…/-/issues/482` | `glab issue view`, GitLab MCP, REST | labels (often `workflow::…`) or board lists | `POST /projects/:id/uploads`, then put the returned markdown in the comment |
| `linear` | `ENG-91`, `linear.app/…/issue/ENG-91` | Linear MCP or API | workflow states | `fileUpload` in its API, then link the asset in the comment |
| `azure-boards` | `AB#4512`, `dev.azure.com/…/_workitems/edit/4512` | `az boards work-item show`, Azure DevOps MCP, REST | work item State (New, Active, Resolved…) | attachments REST API, then link it to the work item |
| `clickup` | `CU-86a1b2c3d`, `#86a1b2c3d`, `app.clickup.com/t/86a1b2c3d` | ClickUp MCP or API | the list's statuses | `POST /task/{id}/attachment` |
| `asana` | `app.asana.com/0/<project>/<task>` | Asana MCP or API | sections, or a custom Status field | `POST /attachments` with the task as parent |
| `youtrack` | `PROJ-12`, `*.youtrack.cloud/issue/PROJ-12` | YouTrack MCP or REST | the State field | `POST /api/issues/{id}/attachments` |
| `shortcut` | `sc-1234`, `app.shortcut.com/…/story/1234` | Shortcut MCP or API | workflow states | `POST /api/v3/files`, linked to the story |
| `monday`, `trello`, others | the item's URL | its MCP server or API | a status column, or a list | its MCP or API, if it has an upload call |

## Rules

- **Find the tool, don't assume it.** Check the MCP servers this host has, then CLIs on the PATH
  (`gh`, `glab`, `az`, `acli`, `jira`), then a REST API only if a token is already configured.
  Never ask the user for a password or token in chat, and never write one to a file.
- **Can't reach it?** Ask the user to paste the ticket (title, description, comments) instead of
  guessing what it says, and print any tracker update for them to post by hand.
- **`KEY-123` is shared** by Jira, Linear and YouTrack, so a bare key uses `tracker.type`.
- **Attachments:** check the connected MCP server for an upload tool first; the column above is
  the fallback, used only with credentials already set up on this machine. Tools change, so
  if one can't upload, say so and list the files instead.
- **Statuses differ everywhere.** Read the real states/transitions/labels/columns from the tracker
  before moving anything, as `tracker-updates.md` says. Never guess a name.
