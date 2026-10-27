# SocratEase

A course assistant for a fullstack JavaScript/TypeScript program. It helps students understand the course material without doing their thinking for them. Canonical terms are English; the Swedish word students and teachers use is shown in parentheses.

## Language

### Course structure

**Program** (utbildning):
The full vocational education, e.g. Fullstack JavaScript/TypeScript, made up of several Courses.
_Avoid_: Course (for the whole program), education

**Course** (kurs):
A credit-bearing part of a Program with its own period, course goals and Assignments, e.g. Frontendutveckling.
_Avoid_: Module, subject

**Cohort** (klass, utbildningsomgång):
One group of students taking a Program together on a specific timeline, e.g. FJS26.
_Avoid_: Class, course instance, kursomgång

**Demo Cohort** (demoklass):
A Cohort with fictional students and copied Course material, used for development and public demonstration. Its "today" is fixed, so some material is always Upcoming. It never contains real student data.
_Avoid_: Test data, sandbox

**Session** (pass):
One scheduled occasion in a Course on a specific date, with an activity type such as lecture, workshop or self-study.
_Avoid_: Lesson, lektion, lecture (that is only one activity type)

**Study Material** (instudering):
The explanatory material that belongs to a Course as a whole rather than to a single Session.
_Avoid_: Course page, notes

**Course Goal** (kursmål):
A learning outcome of a Course, with criteria for the grades G and VG, tested by one or more Assignments. The assistant may quote Course Goals but never judges whether a student's work meets them.
_Avoid_: Learning objective, grading criteria, betygskriterier (as a separate term)

**Assignment** (examinationsmoment, inlämningsuppgift):
A graded task in a Course with a deadline and course goals it tests. The assistant may explain what an Assignment asks for, but never solves it.
_Avoid_: Exercise, task, uppgift (ambiguous with ungraded exercises)

**Active Assignment** (aktiv uppgift):
An Assignment that is Unlocked for the Cohort and whose deadline has not passed. A question that resembles an Active Assignment is treated as being about it. When unsure, the assistant assumes it is. Being active only makes the assistant more cautious about recognising questions; no Assignment is ever solved, not even after its deadline.
_Avoid_: Open assignment, current task

### People

**Student** (studerande):
A member of a Cohort who asks the assistant questions.
_Avoid_: User, learner

**Roster** (klasslista):
The list of school email addresses that belong to a Cohort. Only Students on a Roster can log in, and the Roster decides which Cohort they belong to. It is never linked to the Question Log.
_Avoid_: Allowlist, enrollment, class list

**Teacher** (lärare):
A role within a Cohort that gives access to that Cohort's aggregated insights from the Question Log. Each real Cohort has exactly one Teacher, the owner of the Course material.
_Avoid_: Admin, instructor

**Demo Visitor** (demobesökare):
An external person who tries the Demo Cohort without logging in, and can switch between the Student and Teacher views within it. A Demo Visitor can never reach a real Cohort.
_Avoid_: Guest, test user

### Answering

**Source** (källa):
A piece of Course material that the assistant cites and links the student to, either a whole page or a single section of one. Every claim that teaches a concept must rest on a Source.
_Avoid_: Reference, document, chunk

**Chunk**:
An internal excerpt of a Source that is used to find relevant material. A Chunk never spans two Sources and is never shown to Students; they only see the Source.
_Avoid_: Snippet, passage, källa

**Background Knowledge** (bakgrundskunskap):
General programming knowledge the assistant may use to read a student's code and error messages, but never to teach a concept that has no Source.
_Avoid_: General knowledge, world knowledge

**Unlocked** (upplåst):
Material that the student's Cohort has reached in the schedule and that may therefore be used as a Source.
_Avoid_: Published, available, released

**Upcoming** (kommande):
Material that exists but is not yet Unlocked for the Cohort. The assistant may say when it is coming, but not what it contains.
_Avoid_: Locked, hidden, missing

**Direct Explanation** (förklaring):
An answer that explains a concept straight out, grounded in Sources. Allowed only for conceptual questions unrelated to an Assignment.
_Avoid_: Normal mode, answer mode

**Socratic Response** (sokratiskt svar):
An answer made of guiding questions and pointers to Sources instead of a solution. Always used when a student pastes code or asks about an Assignment. For debugging, hints may get more specific, down to the exact line and concept, but never include corrected code. For an Assignment, hints never go beyond concepts and Sources.
_Avoid_: Socratic mode, hint mode

**Conversation** (samtal):
A multi-turn exchange between one student and the assistant. It lasts only as long as the student's browser tab is open.
_Avoid_: Chat, thread, session (Session means a scheduled class)

**Unanswered Question** (obesvarad fråga):
The part of a student question that no Unlocked or Upcoming material covers, i.e. a gap in the Course material.
_Avoid_: Failed question, unknown question

**Topic** (ämne):
The Source a question mainly landed in, i.e. the Session or section of Study Material the assistant leaned on most. An Unanswered Question has no Topic and is grouped by the week it was asked instead.
_Avoid_: Category, tag, label, subject

**Evaluation Set** (testfrågor):
A fixed set of questions written by the Teacher, with the behaviour expected for each, used to judge the assistant before it reaches Students. A leaked Assignment solution in any of them blocks a release.
_Avoid_: Test suite, benchmark, evals

### Privacy

**Question Log** (frågelogg):
The record of what students ask, with no link to who asked, shown to teachers only in aggregate, and deleted a fixed time after the Cohort ends.
_Avoid_: Chat history, analytics
