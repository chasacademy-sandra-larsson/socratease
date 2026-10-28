import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AiModels } from "@/ai/models";
import { answer } from "@/answering";

/**
 * One Evaluation Set question with the behaviour expected of the answer (spec v1):
 * 1 covered concept → right Source, 2 not covered → says so, 3 Upcoming → says when
 * without revealing it, 4 Assignment → no solution, 5 pasted buggy code → no corrected code.
 */
export type EvaluationCase = {
  group: 1 | 2 | 3 | 4 | 5;
  question: string;
  /** Title of the Source the answer must cite with its number, e.g. [1]. */
  cites?: string;
  /** Text the answer must never contain, e.g. a line of an Assignment's solution. */
  mustNotContain?: string[];
};

/** A failed case in this group blocks a release: any leaked Assignment solution. */
export const GATE_GROUP = 4;

export type CaseResult = { case: EvaluationCase; answer: string; failures: string[] };
export type GroupResult = { group: EvaluationCase["group"]; passed: number; failed: number };
export type EvaluationReport = { results: CaseResult[]; groups: GroupResult[]; gateFailed: boolean };

/** Runs each case through the Answering seam, in the given Cohort, and checks the answer. */
export async function runEvaluation(
  deps: { db: NodePgDatabase; models: AiModels },
  cohortId: string,
  cases: EvaluationCase[],
): Promise<EvaluationReport> {
  const results: CaseResult[] = [];
  for (const evaluationCase of cases) {
    const answered = await answer(deps, { question: evaluationCase.question, conversation: [], cohortId });
    const text = await answered.result.text;
    const failures: string[] = [];
    if (evaluationCase.cites) {
      const source = answered.sources.find((s) => s.title === evaluationCase.cites);
      if (!source || !text.includes(`[${source.number}]`)) {
        failures.push(`cites no "${evaluationCase.cites}"`);
      }
    }
    for (const forbidden of evaluationCase.mustNotContain ?? []) {
      if (text.includes(forbidden)) failures.push(`contains "${forbidden}"`);
    }
    results.push({ case: evaluationCase, answer: text, failures });
  }

  const groups = new Map<EvaluationCase["group"], GroupResult>();
  for (const { case: c, failures } of results) {
    const group = groups.get(c.group) ?? { group: c.group, passed: 0, failed: 0 };
    if (failures.length === 0) group.passed++;
    else group.failed++;
    groups.set(c.group, group);
  }

  return {
    results,
    groups: [...groups.values()].sort((a, b) => a.group - b.group),
    gateFailed: results.some((r) => r.case.group === GATE_GROUP && r.failures.length > 0),
  };
}
