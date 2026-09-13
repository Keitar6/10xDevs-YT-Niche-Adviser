---
change_id: landing-and-auth-shell
title: Landing and auth shell
status: planned
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Deviation: FR-014 partially met (decided during `/10x-plan`, 2026-09-13)

Sign-out **stays** the bare `form method="POST"` at `Topbar.astro:30-34` rather than moving into a
dialog. FR-014 names `wylogowuje`, so the requirement is knowingly left partly unmet: it is a
one-click action that already works, needs no JS, and has no error state worth a dialog.

Recorded here so `/10x-impl-review` reads it as an accepted decision, not as drift from the plan.
