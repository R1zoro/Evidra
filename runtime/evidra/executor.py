from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import re

from jocky import InvestigationIR, IROperation

from .filesystem_provider import FileSystemProvider


@dataclass(frozen=True)
class ResultEnvelope:
    id: str
    operation_id: str
    type: str
    value: object
    source_ids: tuple[str, ...]
    status: str


@dataclass(frozen=True)
class ExecutionStep:
    operation_id: str
    capability: str
    status: str
    result_id: str | None = None
    message: str = ""


@dataclass(frozen=True)
class ExecutionRun:
    status: str
    steps: tuple[ExecutionStep, ...]
    results: tuple[ResultEnvelope, ...]


def execute_ir(ir: InvestigationIR, evidence_root: str | Path, provider: FileSystemProvider | None = None) -> ExecutionRun:
    """Execute the safe read-only v0.1 capabilities represented by an IR."""
    provider = provider or FileSystemProvider()
    values: dict[str, object] = {"EVID-001": Path(evidence_root).resolve()}
    steps: list[ExecutionStep] = []
    results: list[ResultEnvelope] = []
    failed_ids: set[str] = set()

    for operation in ir.operations:
        if any(dependency in failed_ids for dependency in operation.dependencies):
            steps.append(ExecutionStep(operation.id, operation.capability, "blocked", message="dependency did not complete"))
            failed_ids.add(operation.id)
            continue
        try:
            result_type, value, source_ids = _execute_operation(operation, values, provider)
            result_id = f"RES-{len(results) + 1:03d}"
            envelope = ResultEnvelope(result_id, operation.id, result_type, value, source_ids, "completed")
            results.append(envelope)
            if operation.output:
                values[operation.output] = value
            steps.append(ExecutionStep(operation.id, operation.capability, "completed", result_id=result_id))
        except (FileNotFoundError, ValueError, OSError) as error:
            steps.append(ExecutionStep(operation.id, operation.capability, "failed", message=str(error)))
            failed_ids.add(operation.id)

    status = "failed" if any(step.status == "failed" for step in steps) else "completed"
    return ExecutionRun(status, tuple(steps), tuple(results))


def _execute_operation(operation: IROperation, values: dict[str, object], provider: FileSystemProvider) -> tuple[str, object, tuple[str, ...]]:
    if operation.capability == "evidence.import":
        root = _resolve_path(("EVID-001",), values)
        return "EvidenceReference", root, ("EVID-001",)
    if operation.capability == "evidence.materialize":
        source = _resolve_path(operation.inputs, values)
        return "EvidenceReference", source, tuple(operation.inputs)
    if operation.capability == "copy":
        source = _resolve_path(operation.inputs, values)
        return "EvidenceReference", source, ("EVID-001",)
    if operation.capability == "files.list":
        source = _resolve_path(operation.inputs, values)
        return "ArtifactCollection", provider.list_artifacts(source), tuple(operation.inputs)
    if operation.capability == "filter":
        source = _resolve_value(operation.inputs, values)
        if not isinstance(source, list):
            raise ValueError("filter requires a collection input")
        extensions = re.findall(r'extension\s*==\s*"([^"]+)"', operation.expression)
        matches = [artifact for extension in extensions for artifact in source if artifact.extension == extension]
        return "ArtifactCollection", list(dict.fromkeys(matches)), tuple(operation.inputs)
    if operation.capability == "files.search":
        source = _resolve_value(operation.inputs, values)
        if not isinstance(source, list):
            raise ValueError("files.search requires an artifact collection")
        pattern_match = re.search(r'"([^"]+)"', operation.expression)
        pattern = pattern_match.group(1).lower() if pattern_match else "*"
        matches = [artifact for artifact in source if _matches_pattern(artifact.relative_path, pattern)]
        return "ArtifactCollection", matches, tuple(operation.inputs)
    if operation.capability == "files.inspect":
        source = _resolve_value(operation.inputs, values)
        if isinstance(source, list):
            return "ArtifactInspection", source[:1], tuple(operation.inputs)
        raise ValueError("files.inspect requires an artifact collection")
    if operation.capability == "metadata.extract":
        source = _resolve_value(operation.inputs, values)
        root = _resolve_path(("EVID-001",), values)
        if not isinstance(source, list):
            raise ValueError("metadata.extract requires an artifact collection")
        return "MetadataCollection", provider.extract_metadata(root, source), tuple(operation.inputs)
    if operation.capability == "hash":
        source = _resolve_value(operation.inputs, values)
        if isinstance(source, Path):
            return "IntegrityRecord", _hash_path(source), tuple(operation.inputs)
        if isinstance(source, list):
            return "IntegrityCollection", [{"artifact_id": item.id, "sha256": item.sha256} for item in source], tuple(operation.inputs)
        raise ValueError("hash requires an evidence path or artifact collection")
    if operation.capability == "events.extract":
        source = _resolve_value(operation.inputs, values)
        if not isinstance(source, list):
            raise ValueError("events.extract requires an artifact collection")
        return "EventCollection", provider.extract_events(source), tuple(operation.inputs)
    if operation.capability == "timeline.build":
        source = _resolve_value(operation.inputs, values)
        if not isinstance(source, list):
            raise ValueError("timeline.build requires an event collection")
        return "Timeline", sorted(source, key=lambda item: str(item.get("timestamp", ""))), tuple(operation.inputs)
    if operation.capability == "correlate":
        inputs = [_resolve_value((name,), values) for name in operation.inputs]
        findings = [{"id": f"FND-{index:03d}", "kind": "correlation", "evidence": list(operation.inputs), "summary": "Related investigative results require analyst review."} for index, _ in enumerate(inputs[0] if inputs and isinstance(inputs[0], list) else [], 1)]
        return "FindingCollection", findings, tuple(operation.inputs)
    if operation.capability == "export":
        source = _resolve_value(operation.inputs, values)
        return "Export", source, tuple(operation.inputs)
    raise ValueError(f"capability is not implemented by the local provider: {operation.capability}")


def _resolve_value(inputs: tuple[str, ...], values: dict[str, object]) -> object:
    if not inputs:
        raise ValueError("operation has no input")
    try:
        return values[inputs[0]]
    except KeyError as error:
        raise ValueError(f"unknown result reference: {inputs[0]}") from error


def _resolve_path(inputs: tuple[str, ...], values: dict[str, object]) -> Path:
    value = _resolve_value(inputs, values)
    if not isinstance(value, Path):
        raise ValueError("operation input is not a filesystem reference")
    return value


def _hash_path(path: Path) -> str:
    digest = sha256()
    paths = [path] if path.is_file() else sorted(item for item in path.rglob("*") if item.is_file())
    for item in paths:
        digest.update(item.relative_to(path).as_posix().encode("utf-8") if item != path else item.name.encode("utf-8"))
        digest.update(item.read_bytes())
    return digest.hexdigest()


def _matches_pattern(path: str, pattern: str) -> bool:
    expression = "^" + re.escape(pattern).replace(r"\*", ".*").replace(r"\?", ".") + "$"
    return bool(re.match(expression, path.lower()))
