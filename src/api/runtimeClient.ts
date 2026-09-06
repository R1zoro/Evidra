import type { CaseRecord, ProcedureRecord, RuntimeSnapshot, RunRecord } from "../domain/contracts";

/**
 * Typed boundary between the renderer and the future local JOCKY runtime.
 * The UI can use the mock implementation until the Python service is connected.
 */
export interface RuntimeClient {
  getCase(caseId: string): Promise<CaseRecord>;
  getSnapshot(caseId: string): Promise<RuntimeSnapshot>;
  validateProcedure(procedure: ProcedureRecord): Promise<{ valid: boolean; diagnostics: string[] }>;
  executeProcedure(procedureId: string): Promise<RunRecord>;
}

export const runtimeBoundary = {
  protocol: "evidra.local-runtime/v0.1",
  transport: "local-api",
  sourceOfTruth: "python-runtime",
} as const;
