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
        run = execute_ir(ir, resolved_root)
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
        materialize_match = re.search(r'(?:evidence\.materialize|copy)\s+(?:source|\w+|"[^"]+")(?:\s+as\s+"([^"]+)")?(?:\s*>\s*"?([^"\n]+)"?)?', source)
        if not materialize_match:
            return
        source_record = self.store.find_source_reference(case_id, reference)
        workspace = self.store.get_workspace(case_id)
        if not source_record or not workspace:
            return
        if materialize_match.group(2):
            dest_val = materialize_match.group(2)
        elif materialize_match.group(1):
            val = materialize_match.group(1)
            dest_val = val if "/" in val or "\\" in val else f"Evidence/{val}"
        else:
            dest_val = f"Evidence/{source_record['name']}"
        destination = dest_val.strip().replace("\\", "/").strip("./").strip("/")
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
        match = re.search(r'evidence\.import\s+"([^"]+)"', source)
        if not match:
            return "EVID-001", fallback
        reference = match.group(1)
        evidence = self.store.find_evidence_reference(case_id, reference)
        if evidence:
            return f"Evidence/{evidence['name']}", evidence["root"]
        source_record = self.store.find_source_reference(case_id, reference)
        if source_record:
            return f"Sources/{source_record['name']}", source_record["source_path"]
        raise ValueError(f"unknown evidence or source reference: {reference}")


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
