# Issue tracker: GitHub

Issues and specs for Sensa live in GitHub Issues in `SeaLoong/Sensa`. Use the `gh` CLI from this checkout; it infers the repository from the Git remote. Outside this checkout, pass `--repo SeaLoong/Sensa` to issue commands.

## Conventions

- Create: `gh issue create --title "..." --body-file <path>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`; add appropriate label and state filters.
- Comment: `gh issue comment <number> --body-file <path>`.
- Edit a body: `gh issue edit <number> --body-file <path>`.
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number>`.

For multiline bodies or comments, write the exact text to a UTF-8 temporary file and pass `--body-file`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares issue and pull request numbers. When the resource type is unclear, resolve it with `gh pr view <number>` and fall back to `gh issue view <number>`.

## Skill instructions

When a skill says "publish to the issue tracker", create a GitHub issue.
When a skill says "fetch the relevant ticket", read the issue using the command above.

## Wayfinding operations

Used by `/wayfinder`. The map is one issue with child issues as tickets.

- Map: label it `wayfinder:map`; its body holds Notes, Decisions-so-far, and Fog.
- Child ticket: link it to the map as a GitHub sub-issue. Obtain the child's database ID with `gh api repos/SeaLoong/Sensa/issues/<child> --jq .id`, then use `gh api --method POST repos/SeaLoong/Sensa/issues/<map>/sub_issues -F sub_issue_id=<child-db-id>`. If sub-issues are unavailable, add the child to a task list in the map and put `Part of #<map>` at the top of the child body.
- Ticket labels: `wayfinder:<type>`, where type is `research`, `prototype`, `grilling`, or `task`.
- Blocking: use native issue dependencies. Get the blocker's database ID with `gh api repos/SeaLoong/Sensa/issues/<blocker> --jq .id`, then use `gh api --method POST repos/SeaLoong/Sensa/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. Use the database ID, not the issue number or node ID. If dependencies are unavailable, put `Blocked by: #<number>` at the top of the child body.
- Frontier: inspect the map's open children in map order, excluding assigned tickets and tickets with open blockers. Native `issue_dependencies_summary.blocked_by` counts open blockers; for fallback text, check each listed blocker's state. The first eligible ticket wins.
- Claim: `gh issue edit <number> --add-assignee @me`, as the session's first write.
- Resolve: comment with the answer, close the ticket, then append a concise finding and link to the map's Decisions-so-far.
