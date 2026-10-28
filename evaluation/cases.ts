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
 *   cites: the title of a Source the answer must cite with its number, e.g. [1]
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
];
