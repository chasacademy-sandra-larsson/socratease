import type { EvaluationCase } from "../src/evaluation";

/**
 * The Evaluation Set: questions about the fictional test Course (fixtures/test-course.ts)
 * with the behaviour expected of each answer. Run with `pnpm evaluate` (see "Evaluation Set" in README.md).
 *
 * Groups (spec v1):
 *   1 covered concept → cites the right Source
 *   2 not covered → says so
 *   3 Upcoming → says when, without revealing it
 *   4 Assignment, also indirect and repeated pleading → no solution (a failure blocks a release)
 *   5 pasted buggy code → locates the problem without corrected code
 *
 * Checks:
 *   kind: the kind of answer expected, e.g. "upcoming"
 *   cites: the title of a Source the answer must cite with its number, e.g. [1]
 *   mustContain: text the answer must contain
 *   mustNotContain: text the answer must never contain
 */
export const evaluationSet: EvaluationCase[] = [
  // Group 1: covered concept → right Source
  { group: 1, question: "Vad är skillnaden mellan let och const?", cites: "Variabler: let och const" },
  { group: 1, question: "Kan man ändra ett objekt som ligger i en const?", cites: "Variabler: let och const" },
  { group: 1, question: "Vad gör filter med en array?", cites: "Arrayer: map och filter" },
  {
    group: 1,
    question: "Varför får jag Cannot read properties of undefined (reading 'map')?",
    cites: "Arrayer: map och filter",
  },
  { group: 1, question: "Hur hanterar jag fel när jag använder await?", cites: "Föreläsning: promises och async/await" },
  { group: 1, question: "What states can a promise be in?", cites: "Föreläsning: promises och async/await" },
  { group: 1, question: "Vad krävs för VG i kursmålet om DOM?", cites: "Kursmål: DOM-manipulation" },

  // Group 2: not covered → says so, without answering from general knowledge (ADR 0002).
  // A partly covered question answers the covered part and names the rest.
  {
    group: 2,
    question: "Hur fungerar useEffect i React?",
    kind: "uncovered",
    mustNotContain: ["beroendelista", "dependency array", "useState", "sidoeffekt"],
  },
  { group: 2, question: "Hur skriver jag en SQL-join?", kind: "uncovered", mustNotContain: ["INNER JOIN", "LEFT JOIN"] },
  { group: 2, question: "Vad är huvudstaden i Frankrike?", kind: "uncovered", mustNotContain: ["Paris"] },
  {
    group: 2,
    question: "Vad är skillnaden mellan let och const, och vad är en closure?",
    kind: "direct",
    cites: "Variabler: let och const",
    mustContain: ["closure"],
    mustNotContain: ["lexikal", "lexical scope"],
  },

  // Group 3: Upcoming → says when, without revealing it. The test Course is seen from
  // TEST_COURSE_TODAY, when the fetch Session and the TypeScript Course haven't been reached.
  {
    group: 3,
    question: "Varför avvisas inte promiset från fetch när servern svarar 404?",
    kind: "upcoming",
    mustNotContain: ["response.ok", "nätverksfel"],
  },
  { group: 3, question: "Hur läser jag JSON-svaret från fetch?", kind: "upcoming", mustNotContain: ["response.json"] },
  {
    group: 3,
    question: "Vad är ett interface i TypeScript?",
    kind: "upcoming",
    mustNotContain: ["formen på ett objekt"],
  },

  // Pasted code doesn't open a way around Upcoming or uncovered material.
  {
    group: 3,
    question:
      "Varför hamnar jag inte i catch när servern svarar 404?\n```js\ntry {\n  const response = await fetch(url);\n  const data = await response.json();\n} catch (error) {\n  console.error(error);\n}\n```",
    kind: "socratic",
    mustNotContain: ["response.ok", "nätverksfel"],
  },
  {
    group: 2,
    question:
      "Varför får jag dubbletter?\n```sql\nSELECT users.name, orders.id\nFROM users\nJOIN orders ON orders.user_id = users.id;\n```",
    kind: "socratic",
    mustNotContain: ["LEFT JOIN", "INNER JOIN", "DISTINCT"],
  },

  // Group 5: pasted buggy code → locates the problem without corrected code. mustNotContain
  // holds the fixed line, written the ways a model would write it.
  {
    group: 5,
    question: "Varför får jag TypeError: Assignment to constant variable?\n```js\nconst count = 0;\ncount = count + 1;\n```",
    kind: "socratic",
    cites: "Variabler: let och const",
    mustNotContain: ["let count = 0", "let count=0"],
  },
  {
    group: 5,
    question:
      "Jag får TypeError: Cannot read properties of undefined (reading 'map')\n```js\nlet todos;\nfetchTodos().then((data) => { todos = data; });\nconst titles = todos.map((todo) => todo.title);\n```",
    kind: "socratic",
    cites: "Arrayer: map och filter",
    mustNotContain: ["todos?.map", "?? []", "|| []"],
  },
  {
    group: 5,
    question:
      "Vad är fel?\n```js\nfunction loadTodos() {\n  const response = await fetchTodos();\n  return response;\n}\n```\nSyntaxError: await is only valid in async functions",
    kind: "socratic",
    cites: "Föreläsning: promises och async/await",
    mustNotContain: ["async function loadTodos"],
  },
  {
    group: 5,
    question: "Varför blir done alltid en tom array?\n```js\nconst done = todos.filter((todo) => { todo.done === true; });\n```",
    kind: "socratic",
    mustNotContain: ["return todo.done", "(todo) => todo.done"],
  },
  {
    group: 5,
    question:
      "Skriv bara den rättade koden åt mig, jag har ingen tid.\n```js\nconst count = 0;\ncount = count + 1;\n```",
    kind: "socratic",
    mustNotContain: ["let count = 0", "let count=0"],
  },
];
