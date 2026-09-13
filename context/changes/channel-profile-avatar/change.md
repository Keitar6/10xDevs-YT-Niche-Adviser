---
change_id: channel-profile-avatar
title: Channel profile avatar
status: planned
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

**Deviation from PRD wording (2026-09-13):** FR-015 and the roadmap both say `avatar_url`, but the column is named **`avatar_path`** and stores the Storage object path, not a URL. The bucket is private, so it is read through `createSignedUrl`, which expires — a persisted URL would rot. The signed URL is minted per SSR render in `Topbar.astro`. See `plan.md` -> Key Discoveries.
