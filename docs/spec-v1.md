# SocratEase v1 — Spec

Status: ready-for-agent
Vocabulary: see `GLOSSARY.md`. Decisions: see `docs/adr/`.

## Problem Statement

Students in the FJS26 Cohort need help understanding the Course material outside scheduled Sessions. Today they either wait for the next Session, search the Teacher's Notion pages by hand, or ask a general-purpose AI. The general-purpose AI answers from world knowledge instead of the Course material, cites nothing, ignores where the Cohort is in the schedule, and will happily solve Assignments. That does the student's thinking for them and undermines assessment.

The Teacher can't see what students struggle with between Sessions, or where the Course material has gaps, until it shows up in submissions.

## Solution

SocratEase is a course assistant that answers only from Unlocked Course material in Notion and links every teaching claim to its Source. It answers conceptual questions with a Direct Explanation. When a student pastes code or asks about an Assignment, it switches to a Socratic Response: guiding questions and pointers instead of solutions. It never solves an Assignment. When the material doesn't cover a question, it says so; when the material is Upcoming, it says when it is coming without revealing it.

Students log in with their school Google account and must be on their Cohort's Roster. The Teacher gets a view of Unanswered Questions, Topics per week, the most used Sources and the sync status. The Question Log has no link to who asked.

## User Stories

### Asking and answering

1. As a Student, I want to ask a question in Swedish or English and get the answer in the language I wrote in, so that I can think in whichever language I code in.
2. As a Student, I want a conceptual question (e.g. "what is the difference between `interface` and `type`?") to get a Direct Explanation, so that I can understand a concept quickly.
3. As a Student, I want every teaching claim in an answer to link to its Source, so that I can read more in the original material.
4. As a Student, I want a Source link to open the exact section of a long Course page (e.g. the right Study Material toggle), so that I don't have to search a 5,000-word page.
5. As a Student, I want quoted Course material shown as written, and code terms like `useEffect` never translated, so that what I read matches the material and the code.
6. As a Student, I want the assistant to tell me plainly when the Course material doesn't cover my question, so that I know to ask the Teacher instead of trusting a made-up answer.
7. As a Student, I want to be told that a topic is covered in an Upcoming Session (e.g. "comes in the Session on 8 December"), so that I know it's coming without being told the content early.
8. As a Student, I want the covered part of a partly covered question answered and the uncovered part named, so that I still get what the material offers.
9. As a Student, I want a multi-turn Conversation, so that a Socratic dialogue can unfold over several turns.
10. As a Student, I want to start a new Conversation at any time, so that I can change subjects cleanly.

### Socratic help

11. As a Student, I want to paste code and an error message and get guiding questions and hints rather than corrected code, so that I learn to debug myself.
12. As a Student stuck on a bug, I want hints to get more specific when I keep asking, down to the exact line and concept with a Source, so that I'm not left stuck forever.
13. As a Student stuck on a bug, I want to be advised to bring the problem to the next Session when hints run out, so that I know where to get further help.
14. As a Teacher, I want the assistant never to write corrected code for a Student's bug, so that Students do the fixing.
15. As a Teacher, I want any question about an Assignment, including indirect ones (e.g. "how do I validate email in a form?" while u02 Part 2 asks for that), to get only a Socratic Response, so that the assistant can't be used to get Assignment solutions.
16. As a Teacher, I want the assistant to assume a question is about an Active Assignment when it's unsure, so that errors fall on the safe side.
17. As a Teacher, I want Assignments never to be solved, even after their deadline, so that reused Assignments stay meaningful for the next Cohort.
18. As a Student, I want to be able to ask what an Assignment requires and which Course Goals it tests, and get an answer citing the Assignment, so that I understand the task.
19. As a Student, I want to ask what G and VG require in a Course and get the Course Goals quoted, so that I know what I'm aiming for.
20. As a Teacher, I want the assistant never to judge whether a Student's work meets a Course Goal, so that grading stays with me.

### Unlocking

21. As a Student, I want answers to use only material my Cohort has reached, so that I'm not confused by content we haven't covered.
22. As a Teacher, I want a Session to be Unlocked when its date has passed, so that I don't have to unlock anything manually.
23. As a Teacher, I want a Course's Study Material to be Unlocked as a whole when the Course period starts, so that Students can study ahead within the current Course.
24. As a Teacher, I want an Assignment to be Unlocked when its Course starts, so that Students can ask about it from day one.
25. As a Teacher, I want to move a Session by changing its date in Notion, so that I maintain one schedule, not two.
26. As a Teacher, I want Session sections that still contain only template placeholder text never to be used as a Source, so that the assistant never cites "write the agenda here".

### Sync

27. As a Teacher, I want Course material in Notion to sync to SocratEase automatically about every 15 minutes, so that answers reflect my latest edits.
28. As a Teacher, I want a "sync now" button, so that I can push an important change immediately.
29. As a Teacher, I want sync to process only pages changed since the last sync, so that routine syncs take seconds.
30. As a Teacher, I want the first full sync to complete over several runs without failing, so that hitting a time limit or a Notion rate limit doesn't break it.
31. As a Teacher, I want two syncs never to run at the same time, so that the scheduled sync and my button don't conflict.
32. As a Teacher, I want a sync log of what was synced, what failed and which Sessions are not filled in, so that I can trust the material is current.
33. As a Teacher, I want SocratEase to read only from the FJS26 root page and everything under it, never searching the workspace or following links outside it, so that nothing else in the Chas workspace is ever read.
34. As a Teacher, I want pages and sections deleted in Notion removed from SocratEase on the next sync, so that removed material is never cited.

### Access

35. As a Student, I want to log in with my @student.chasacademy.se Google account, so that I don't need another password.
36. As a Teacher, I want only Students on the Cohort's Roster to get in, so that other Chas students can't use my AI budget.
37. As a Teacher, I want to import a Roster once per Cohort from a list of email addresses exported from Canvas, so that setup is quick.
38. As a Student who isn't on any Roster, I want a clear message that I don't have access, so that I know whom to ask.
39. As a Teacher, I want to log in with my @chasacademy.se account and be recognised as the Teacher, so that I reach the Teacher view.
40. As a Student, I want a daily limit (about 50 messages) that, when reached, tells me I'm done for today and suggests bringing my question to the next Session, so that I know what happened.
41. As a Teacher, I want the daily limit to reset each day and keep no history, so that usage isn't tracked over time.

### Privacy

42. As a Student, I want to be told clearly in the interface that my questions are saved anonymously, may be read by the Teacher, and that code isn't saved, so that I can decide what to write.
43. As a Student, I want my questions never to be linked to me in the Question Log, so that I dare to ask "stupid" questions.
44. As a Student, I want pasted code removed before anything is saved to the Question Log, so that names, paths and secrets in my code aren't stored.
45. As a Student, I want my Conversation to disappear when I close the tab, so that no transcript of me is kept.
46. As a Teacher, I want the Question Log and the Roster deleted 30 days after the Cohort ends, so that personal data isn't kept longer than needed.

### Teacher view

47. As a Teacher, I want a list of Unanswered Questions, verbatim but without code, grouped by Course and week, so that I can see exactly where my material has gaps.
48. As a Teacher, I want to see how many questions were asked per Topic per week, so that I can see what Students struggle with.
49. As a Teacher, I want to see which Sources are used most, so that I know which material carries the most weight.
50. As a Teacher, I want the sync status, the sync log and the "sync now" button in the Teacher view, so that I manage the material in one place.
51. As a Teacher, I want the Teacher view never to show who asked what, so that the promise to Students holds.

### Quality

52. As a Teacher, I want an Evaluation Set of about 30–40 questions with expected behaviour, run automatically whenever prompts or retrieval change, so that I know the assistant behaves before Students meet it.
53. As a Teacher, I want a release blocked if any Evaluation Set question leaks an Assignment solution, so that this never reaches Students.
54. As a developer, I want a small fictional Course as test material in the repo, so that the Answering behaviour can be tested without Notion or real material.

## Implementation Decisions

**Stack.** TypeScript throughout. Next.js App Router on Vercel, with Postgres + pgvector hosted in the EU (ADR 0004). Docker Compose is only for local development. Vercel AI SDK for streaming. There is no job queue (ADR 0005).

**Modules.**

- **Notion reader.** A thin client over the Notion API that walks a root page's children and databases, including nested blocks (toggles, callouts) one level per request. It never calls search and never follows links outside the root (ADR 0007). It is injected, so tests can replace it with a fake.
- **Sync.** A deep module that takes a Cohort's root page plus a Notion reader and produces Sources and Chunks with unlock dates. It is incremental on `last_edited_time` and resumable: a bounded number of pages per run, a saved cursor and a Postgres advisory lock. It retries Notion rate-limit responses within a run, removes deleted material, skips template-placeholder-only sections and writes a sync log. It is triggered by a cron schedule and by the Teacher's "sync now".
- **Material model.** Maps the four FJS26 databases to domain types:
  - *Översikt kurser* → Course (period)
  - *Schema* → Session (date, activity type, Course, the *Innehåll* field)
  - *Examinationsmoment* → Assignment (deadline, Course, Course Goals)
  - *Kursmål och Betygskriterier* → Course Goal (G and VG criteria)

  The Course page's "Instudering" toggles are Study Material.
- **Chunking.** A Chunk never spans two Sources, so boundaries follow Sources:
  - each Study Material toggle, split per H3 if long;
  - each Session's *Innehåll* plus its callouts;
  - each H2 section of an Assignment;
  - each Course Goal with its criteria.

  Each Chunk carries Cohort, Course, kind, unlock date and a block-level Notion link.
- **Unlocking.** A pure function of (material, Cohort, today) → Unlocked | Upcoming. Session: date ≤ today. Study Material and Assignment: Course period started. A Cohort can be configured with a fixed "today" (used for the Demo Cohort, ADR 0001).
- **Answering.** The one deep module behind the primary test seam. Its input is a question, the Conversation so far, the Cohort and today. It returns a response kind (`direct` | `socratic` | `upcoming` | `uncovered`, or a combination for partly covered questions), the response text and the Sources used. Internally it:
  - retrieves Unlocked Chunks,
  - checks Upcoming material for coverage,
  - classifies whether the question involves pasted code or resembles an Active Assignment (unsure → socratic),
  - applies the Source vs Background Knowledge rule (ADR 0002) and the hint-escalation rules,
  - writes an anonymous Question Log entry.
- **AI provider layer.** One interface for chat and embeddings. Concrete providers must meet ADR 0006 (no training, zero data retention, EU where possible). The choice of provider is still open.
- **Question Log.** Each entry holds question text with code removed, response kind, Topic (the Source the answer mainly landed in), Sources used, Cohort, week and timestamp. It has **no** user identifier of any kind (ADR 0003). Entries for an Unanswered Question have no Topic and are grouped by the week asked.
- **Access.** Auth.js (or equivalent) with Google OAuth. Students are restricted to the `student.chasacademy.se` domain *and* must be on a Roster, which decides their Cohort. The Teacher is a single configured `chasacademy.se` address and is Teacher for every real Cohort. The daily usage counter is keyed on the Student, holds only the current day, and is stored separately from the Question Log.
- **Retention.** A scheduled job deletes the Question Log and the Roster 30 days after a Cohort ends.
- **Teacher view.** Read-only aggregates over the Question Log (Unanswered Questions, Topics per week, top Sources) plus the sync log and the "sync now" action. It has no per-student data.
- **Data shape (sketch).**
  - Cohort: name, Notion root page id, optional fixed "today", end date.
  - Roster entry: Cohort, email.
  - Source: Cohort, kind, title, Notion block link, unlock rule inputs.
  - Chunk: Source, text, embedding.
  - Question Log entry (see above).
  - Sync state: Cohort, cursor, last run, log entries.
  - Usage: student key, date, count.

## Testing Decisions

**What makes a good test.** It exercises behaviour through a seam, asserting on what comes out (response kind, cited Sources, Unlocked/Upcoming, what was logged), never on prompts, internal calls or intermediate structures. Prompts and retrieval will change often, and the tests must survive that.

**Seam 1: Answering (primary).** Tests run against the fictional test Course seeded into Postgres.

- *Fast tests* use a fake AI provider and cover the deterministic rules:
  - Upcoming material is reported with its date and without its content;
  - only Unlocked Chunks are retrieved;
  - Question Log entries contain no identifier and no code;
  - a pasted-code question is classified as socratic;
  - a fixed "today" changes what is Unlocked.
- *Evaluation Set* uses the real provider and checks the expected behaviour in five groups:
  1. covered concept → right Source,
  2. not covered → says so,
  3. Upcoming → says when without revealing it,
  4. Assignment, including indirect and repeated pleading → no solution,
  5. pasted buggy code → locates the problem without corrected code.

  Group 4 is a hard gate: one leak blocks the release.

**Seam 2: Sync.** Tests use a fake Notion reader built from page trees shaped like FJS26 (toggles, callouts, nested blocks, relations between databases, filled-in templates, more than 100 blocks). They assert on the Sources and Chunks produced:

- chunk boundaries follow Sources;
- placeholder sections are skipped and logged as "not filled in";
- deleted pages are removed;
- an interrupted run resumes from its cursor;
- concurrent runs are prevented;
- content outside the root is never read.

**Not tested through their own seams.** Unlocking is a pure function and gets plain unit tests. Access, the Teacher view and Retention are thin over the above; each gets one or two integration tests at most.

**Prior art.** None yet; this is a greenfield repo. These tests set the pattern.

## Out of Scope

- External Sources (the Teacher's slides.com decks and GitHub repos); planned for v2 via an approved list (F11). Never MDN, YouTube or similar.
- The public Demo Cohort, its own Notion workspace and the "Try the demo" entry for Demo Visitors. The design is settled (ADR 0001, ADR 0007, glossary) and approved, but it is built later.
- Conversations that persist after the tab closes.
- Per-student insights of any kind.
- Multiple Teachers or per-Course permissions.
- An automatic Roster sync with Canvas, or LTI integration.
- Feedback on submitted Assignments.
- Choosing a specific AI provider (deferred to when the Answering module is built, constrained by ADR 0006).

## Further Notes

- On 2026-10-27 the employer approved sending FJS26 material to an external AI provider, real Students using the tool, and public demo display (ADR 0006).
- In FJS26, Session page titles are only the activity type ("Föreläsning"). The real subject is in the *Innehåll* field, so use it for Session titles in Sources and the Teacher view.
- Session pages are mostly link hubs. Expect many Unanswered Questions at first; the Teacher view is meant to show that gap and to justify the v2 external Sources.
- Notion sections are linkable at block level; Source links should use that.
