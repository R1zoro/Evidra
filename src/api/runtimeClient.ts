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

export interface RuntimeExecutionResponse {
  status: string;
  diagnostics: string[];
  context?: { source_reference: string; source_path: string };
  steps: Array<{ operation_id: string; capability: string; status: string; result_id?: string; message?: string }>;
  results: Array<{ id: string; operation_id?: string; type: string; value: unknown; source_ids: string[]; status: string; provider?: string }>;
}

export interface CaseSnapshot {
  case: { id: string; name: string; created_at: string } | null;
  evidence: Array<{ id: string; case_id: string; name: string; root: string; file_count: number; created_at: string }>;
  sources: Array<{ id: string; case_id: string; name: string; source_path: string; fingerprint: string; status: string; created_at: string }>;
  procedures: Array<{ id: string; source: string; created_at: string }>;
  runs: Array<{ id: string; case_id: string; procedure_id: string; status: string; created_at: string }>;
}

export class LocalRuntimeClient {
  constructor(private readonly baseUrl = "http://127.0.0.1:8765") {}

  async execute(source: string, evidenceRoot?: string, caseId = "CASE-001"): Promise<RuntimeExecutionResponse> {
    const response = await fetch(`${this.baseUrl}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, evidence_root: evidenceRoot, case_id: caseId }),
    });
    if (!response.ok) throw new Error(`Runtime request failed (${response.status})`);
    return response.json() as Promise<RuntimeExecutionResponse>;
  }

  async getSnapshot(caseId: string): Promise<CaseSnapshot> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}`);
    if (!response.ok) throw new Error(`Case snapshot request failed (${response.status})`);
    return response.json() as Promise<CaseSnapshot>;
  }

  async createCase(input: { id: string; name: string; root: string; folders: string[] }): Promise<CaseSnapshot> {
    const response = await fetch(`${this.baseUrl}/api/cases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) throw new Error(`Case creation failed (${response.status})`);
    return response.json() as Promise<CaseSnapshot>;
  }

  async registerSource(caseId: string, path: string, name?: string): Promise<{ source: CaseSnapshot["sources"][number] & { existing?: boolean }; snapshot: CaseSnapshot }> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/sources`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, name }) });
    if (!response.ok) throw new Error(`Source registration failed (${response.status})`);
    return response.json() as Promise<{ source: CaseSnapshot["sources"][number] & { existing?: boolean }; snapshot: CaseSnapshot }>;
  }

  async materializeSource(caseId: string, sourceId: string, destination?: string): Promise<{ evidence: CaseSnapshot["evidence"][number]; snapshot: CaseSnapshot }> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/sources/${encodeURIComponent(sourceId)}/materialize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination }) });
    if (!response.ok) throw new Error(`Evidence materialization failed (${response.status})`);
    return response.json() as Promise<{ evidence: CaseSnapshot["evidence"][number]; snapshot: CaseSnapshot }>;
  }

  async importEvidence(caseId: string, name: string, files: Array<{ path: string; content: string }>): Promise<{ evidence: CaseSnapshot["evidence"][number]; snapshot: CaseSnapshot }> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, files }),
    });
    if (!response.ok) throw new Error(`Evidence import failed (${response.status})`);
    return response.json() as Promise<{ evidence: CaseSnapshot["evidence"][number]; snapshot: CaseSnapshot }>;
  }

  async getTree(caseId: string): Promise<Array<{ name: string; path: string; kind: "file" | "directory"; children?: any[] }>> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/fs/tree`);
    if (!response.ok) throw new Error(`Tree fetch failed (${response.status})`);
    const data = await response.json() as { tree: any[] };
    return data.tree ?? [];
  }

  async readFile(caseId: string, relativePath: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/fs/file?path=${encodeURIComponent(relativePath)}`);
    if (!response.ok) throw new Error(`Read file failed (${response.status})`);
    const data = await response.json() as { content: string };
    return data.content ?? "";
  }

  async writeFile(caseId: string, relativePath: string, content: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/fs/file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: relativePath, content }),
    });
    if (!response.ok) throw new Error(`Write file failed (${response.status})`);
    return relativePath;
  }

  async createFolder(caseId: string, relativePath: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/fs/folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: relativePath }),
    });
    if (!response.ok) throw new Error(`Create folder failed (${response.status})`);
    return relativePath;
  }

  async rename(caseId: string, fromPath: string, toPath: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/fs/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromPath, to: toPath }),
    });
    if (!response.ok) throw new Error(`Rename failed (${response.status})`);
    return toPath;
  }

  async delete(caseId: string, relativePath: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/fs/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: relativePath }),
    });
    if (!response.ok) throw new Error(`Delete failed (${response.status})`);
    return true;
  }
}

