# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Check for a running dev server before testing

- **Context**: implementation phase
- **Problem**: Not working web pages, failures to load js by browser, mismatches between what is in the tested code and what is the server showing. Makes testing harder and takes more time.
- **Rule**: Always before testing during implementation phases verify if the astro dev server is already running. If yes, inform the user and ask if you or the user can shut it down.
- **Applies to**: implement, impl-review
