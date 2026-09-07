from dataclasses import asdict
from pathlib import Path
import re
import shutil
from typing import Any

from jocky import lower_to_ir, parse_procedure

from .executor import execute_ir
from .case_store import CaseStore


class RuntimeService:
    """Application-facing service boundary for the local JOCKY runtime."""

    def __init__(self, store: CaseStore | None = None):
        self.store = store

    def validate(self, source: str) -> dict[str, Any]:
        procedure = parse_procedure(source)
        ir = lower_to_ir(procedure)
        return {
            "valid": not ir.diagnostics,
            "diagnostics": list(ir.diagnostics),
            "stages": [stage.name for stage in procedure.stages],
            "operation_count": len(ir.operations),
            "ir": [asdict(operation) for operation in ir.operations],
        }

    def snapshot(self, case_id: str) -> dict[str, Any]:
        if not self.store:
            return {"case": None, "procedures": [], "runs": []}
        return self.store.get_case_snapshot(case_id)

    def execute(self, source: str, evidence_root: str | Path, case_id: str = "CASE-001") -> dict[str, Any]:
        procedure = parse_procedure(source)
        ir = lower_to_ir(procedure)
        if ir.diagnostics:
            return {"status": "failed", "diagnostics": list(ir.diagnostics), "steps": [], "results": []}
        try:
            reference, resolved_root = self._resolve_evidence_root(source, evidence_root, case_id)
            self._materialize_requested_source(source, case_id, reference)
        except ValueError as error:
            return {"status": "failed", "diagnostics": [str(error)], "steps": [], "results": []}
        workspace = self.store.get_workspace(case_id) if self.store else None
        run = execute_ir(ir, resolved_root, workspace_root=workspace)
        response = {
            "status": run.status,
            "diagnostics": [],
            "steps": [asdict(step) for step in run.steps],
            "results": [
                {
                    "id": result.id,
                    "operation_id": result.operation_id,
                    "type": result.type,
                    "value": [_serialize_value(item) for item in result.value] if isinstance(result.value, list) else _serialize_value(result.value),
                    "source_ids": list(result.source_ids),
                    "status": result.status,
                    "provider": "local-filesystem",
                }
                for result in run.results
            ],
        }
        if self.store:
            response["run_id"] = self.store.save_execution(case_id, source, response)
        response["context"] = {"source_reference": reference, "source_path": str(resolved_root)}
        return response

    def _materialize_requested_source(self, source: str, case_id: str, reference: str) -> None:
        if not self.store:
            return
        materialize_match = re.search(
            r'(?:evidence\.materialize|copy)\s+(?:\"([^\"]+)\"|([A-Za-z0-9_/\\.-]+))(?:\s+as\s+(?:\"([^\"]+)\"|([A-Za-z0-9_/\\.-]+)))?(?:\s*>\s*"?([^"\n]+)"?)?',
            source,
        )
        if not materialize_match:
            return
        src_name = materialize_match.group(1) or materialize_match.group(2) or reference
        dest_val = materialize_match.group(3) or materialize_match.group(4)
        source_record = self.store.find_source_reference(case_id, src_name) or self.store.find_source_reference(case_id, reference)
        workspace = self.store.get_workspace(case_id)
        if not source_record or not workspace:
            return
        if dest_val:
            val = dest_val.strip()
            dest_clean = val if "/" in val or "\\" in val else f"Evidence/{val}"
        else:
            dest_clean = f"Evidence/{source_record['name']}"
        destination = dest_clean.strip().replace("\\", "/").strip("./").strip("/")
        if destination.startswith("/") or ".." in Path(destination).parts:
            raise ValueError("materialization destination must be a relative path inside the case")
        target = (Path(workspace) / destination).resolve()
        if Path(workspace).resolve() not in target.parents:
            raise ValueError("materialization destination escapes the case workspace")
        if target.exists():
            existing_ev = self.store.find_evidence_reference(case_id, target.name)
            if not existing_ev:
                count = sum(1 for item in target.rglob("*") if item.is_file()) if target.is_dir() else 1
                self.store.register_evidence(case_id, self.store.next_evidence_id(), target.name, str(target), count)
            return
        source_path = Path(source_record["source_path"])
        target.parent.mkdir(parents=True, exist_ok=True)
        if source_path.is_dir():
            shutil.copytree(source_path, target)
            count = sum(1 for item in target.rglob("*") if item.is_file())
        else:
            shutil.copy2(source_path, target)
            count = 1
        self.store.register_evidence(case_id, self.store.next_evidence_id(), target.name, str(target), count)

    def _resolve_evidence_root(self, source: str, fallback: str | Path, case_id: str) -> tuple[str, str | Path]:
        if not self.store:
            return "EVID-001", fallback
        import_match = re.search(r'evidence\.import\s+(?:\"([^\"]+)\"|([A-Za-z0-9_/\\.-]+))', source)
        copy_match = re.search(r'(?:copy|evidence\.materialize)\s+(?:\"([^\"]+)\"|([A-Za-z0-9_/\\.-]+))', source)
        list_match = re.search(r'files\.list\s+(?:\"([^\"]+)\"|([A-Za-z0-9_/\\.-]+))', source)

        raw_ref = None
        if import_match:
            raw_ref = (import_match.group(1) or import_match.group(2)).strip()
        elif copy_match:
            raw_ref = (copy_match.group(1) or copy_match.group(2)).strip()
        elif list_match:
            raw_ref = (list_match.group(1) or list_match.group(2)).strip()

        if not raw_ref or raw_ref in {"source", "working", "working_evidence"}:
            return "EVID-001", fallback

        ref_norm = raw_ref.replace("\\", "/")

        # 1. Check existing registered evidence in store
        evidence = self.store.find_evidence_reference(case_id, ref_norm) or self.store.find_evidence_reference(case_id, raw_ref)
        if evidence:
            return f"Evidence/{evidence['name']}", evidence["root"]

        # 2. Check existing registered source in store
        source_record = self.store.find_source_reference(case_id, ref_norm) or self.store.find_source_reference(case_id, raw_ref)
        if source_record:
            return f"Sources/{source_record['name']}", source_record["source_path"]

        # 3. Check if raw_ref or ref_norm is a real path on disk
        p_raw = Path(raw_ref)
        p_norm = Path(ref_norm)
        disk_path = p_raw if p_raw.exists() else (p_norm if p_norm.exists() else None)

        if disk_path and disk_path.exists():
            resolved = disk_path.resolve()
            source_name = resolved.name or "Source"
            existing = self.store.find_source_reference(case_id, source_name)
            if not existing:
                self.store.register_source(case_id, source_name, str(resolved), f"fp-{source_name.lower()}")
            return f"Sources/{source_name}", str(resolved)

        return "EVID-001", fallback


def _serialize_value(value: object) -> object:
    if isinstance(value, Path):
        return value.as_posix()
    if hasattr(value, "__dataclass_fields__"):
        return {key: _serialize_value(item) for key, item in asdict(value).items()}
    if isinstance(value, dict):
        return {key: _serialize_value(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_serialize_value(item) for item in value]
    return value
