# Investigation Report Template

Copy this structure into `specs/{feature-slug}/investigation.md`.

```markdown
# Investigation

## Source
- Source Type: (ticket / transcript / plain text / doc / log / mixed)
- Ticket ID / Tracker / URL: (or "None")
- Source Files / Links:
- Title:
- Type of Work:
- Priority:
- Branch:
- Base Branch:
- Base Commit:

## Business Context
## Problem Statement
## Expected Behaviour
## Current Behaviour
## Relevant Repositories
## Relevant Files / Modules
## Existing Architecture
## Current Flow
## Data Flow
## Root Cause
## Evidence
### Verified
### Inferred
### Unknown
### Assumptions
## Required Change Surface
## Supporting Changes
## Optional Changes
## Out of Scope
## Dependencies
## Risks
## Security Considerations
## Performance / Reliability Considerations
## Testing Context
## Edge Cases
## Additional Context
### Business Decisions
### Technical Decisions
### Potential Requirements
### Proposed Solutions Discussed
### Open Questions
### Conflicts / Discrepancies
## Complexity Estimate
- Overall tier: (light / standard / deep): the tier of the hardest part of the work
- Signals: (which of spread, new design, data, concurrency, security, public contract, ambiguity, hard to verify apply, each with its evidence)
- Suggested model for planning this: (`models.<tool>.deep` at `effort.deep` if the tier is deep, or the `escalate` model for very ambiguous, long-horizon work; otherwise the session's model is fine)

## Recommended Implementation Direction
## References
```
