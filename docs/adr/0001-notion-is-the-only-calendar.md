# Notion is the only calendar for unlocking material

What is Unlocked for a Cohort is derived entirely from the dates already in Notion: a Session's date, a Course's period and an Assignment's deadline. SocratEase keeps no schedule of its own and has no manual unlock. A Cohort corresponds to one Notion root page (e.g. FJS26). When a Session is moved, the teacher changes its date in Notion and the next sync picks it up. We chose this so the teacher maintains one schedule, not two that can drift apart.

## Consequences

- Notion has no published/draft flag, and future Sessions already exist as half-filled templates. A page's date is the only signal, so a Session whose date has passed is Unlocked even if its page is still a template.
- A new Cohort means a new root page in Notion and a new sync source, not a new schedule in SocratEase.
- To avoid citing template text, sync recognises the Session page template's placeholder text and does not index sections that contain only placeholders. Such Sessions appear in the sync log as "not filled in". We rejected a manual "ready" checkbox because it adds a click per Session that will be forgotten.
- Exception: the Demo Cohort has a fixed "today" configured in SocratEase (e.g. always week 4 of the Course), and unlocking is computed from that instead of the real date. Otherwise its static Notion dates would drift into the past and the demo would lose its Upcoming material. Notion is still the only source of the dates themselves.
