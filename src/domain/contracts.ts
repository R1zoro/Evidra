export type OperationStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "denied"
  | "partial"
  | "blocked";

export type EvidenceKind = "folder" | "file" | "disk_image" | "archive" | "pcap" | "unknown";

export interface CaseRecord {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  mode: "local";
}

export interface EvidenceRecord {
  id: string;
  caseId: string;
  name: string;
  source: string;
  kind: EvidenceKind;
  hash?: string;
  status: "registered" | "verified" | "partial" | "error";
}

export interface ProcedureRecord {
  id: string;
  caseId: string;
  name: string;
  languageVersion: "0.1";
  source: string;
  astVersion?: string;
}

export interface OperationRecord {
  id: string;
  runId: string;
  name: string;
  stage?: string;
  status: OperationStatus;
  inputs: string[];
  outputs: string[];
  capability: string;
  provider?: string;
  startedAt?: string;
  completedAt?: string;
  message?: string;
}

export interface RunRecord {
  id: string;
  caseId: string;
  procedureId: string;
  status: OperationStatus;
  startedAt: string;
  completedAt?: string;
  operationIds: string[];
}

export interface ResultRecord {
  id: string;
  caseId: string;
  runId: string;
  type: "artifacts" | "metadata" | "events" | "timeline" | "correlation" | "finding" | "export" | "integrity";
  sourceIds: string[];
  payload: unknown;
  status: OperationStatus;
}

export interface ProvenanceEdge {
  id: string;
  caseId: string;
  runId: string;
  fromId: string;
  toId: string;
  relation: "derived_from" | "supports" | "contains" | "produced_by" | "occurred_near";
}

export interface RuntimeSnapshot {
  caseRecord: CaseRecord;
  evidence: EvidenceRecord[];
  procedures: ProcedureRecord[];
  runs: RunRecord[];
  operations: OperationRecord[];
  results: ResultRecord[];
  provenance: ProvenanceEdge[];
}
