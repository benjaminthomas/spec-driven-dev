---
type: llm
weight: 1
---

The agent invoked the spec-setup skill (not spec-investigate or spec-create). It treated "branch from staging" and "branch name = Jira ticket ID" as values for the project config (git.base_branch, git.branch_name), not as rules to hardcode anywhere else. It did not create branches, commits, or code.
