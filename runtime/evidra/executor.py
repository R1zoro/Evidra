from dataclasses import asdict, dataclass
from hashlib import sha256
import json
from pathlib import Path
import re

from jocky import InvestigationIR, IROperation

from .filesystem_provider import FileSystemProvider
from .results import ArtifactRecord, MetadataRecord


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


def execute_ir(
    ir: InvestigationIR,
    evidence_root: str | Path,
    provider: FileSystemProvider | None = None,
    workspace_root: str | Path | None = None,
) -> ExecutionRun:
    """Execute the safe read-only v0.1 capabilities represented by an IR."""
    provider = provider or FileSystemProvider()
    resolved_evidence = Path(evidence_root).resolve()
    resolved_workspace = Path(workspace_root).resolve() if workspace_root else None
    values: dict[str, object] = {"EVID-001": resolved_evidence}
    steps: list[ExecutionStep] = []
    results: list[ResultEnvelope] = []
    failed_ids: set[str] = set()

    for operation in ir.operations:
        if any(dependency in failed_ids for dependency in operation.dependencies):
            steps.append(ExecutionStep(operation.id, operation.capability, "blocked", message="dependency did not complete"))
            failed_ids.add(operation.id)
            continue
        try:
            result_type, value, source_ids = _execute_operation(operation, values, provider, resolved_workspace)
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


def _execute_operation(
    operation: IROperation,
    values: dict[str, object],
    provider: FileSystemProvider,
    workspace_root: Path | None = None,
) -> tuple[str, object, tuple[str, ...]]:
    if operation.capability == "evidence.import":
        root = _resolve_path(("EVID-001",), values, workspace_root)
        return "EvidenceReference", root, ("EVID-001",)
    if operation.capability == "evidence.materialize":
        source = _resolve_path(operation.inputs, values, workspace_root)
        return "EvidenceReference", source, tuple(operation.inputs)
    if operation.capability == "copy":
        source = _resolve_path(operation.inputs, values, workspace_root)
        if workspace_root and operation.destination:
            dest = operation.destination.strip('"').strip("'").strip(">").strip()
            target = (workspace_root / dest).resolve()
            if not target.exists() and "/" not in dest and "\\" not in dest:
                target = (workspace_root / "Evidence" / dest).resolve()
            if target.exists():
                return "EvidenceReference", target, tuple(operation.inputs)
        return "EvidenceReference", source, tuple(operation.inputs)
    if operation.capability == "files.list":
        source = _resolve_path(operation.inputs, values, workspace_root)
        return "ArtifactCollection", provider.list_artifacts(source), tuple(operation.inputs)
    if operation.capability == "filter":
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            raise ValueError("filter requires a collection input")
        quoted_exts = re.findall(r'"([^"]+)"', operation.expression)
        normalized_exts = {
            (ext.lower() if ext.startswith(".") else f".{ext.lower()}")
            for ext in quoted_exts
        }
        if normalized_exts:
            matches = [
                artifact for artifact in source
                if getattr(artifact, "extension", "").lower() in normalized_exts
            ]
        else:
            matches = source
        return "ArtifactCollection", list(dict.fromkeys(matches)), tuple(operation.inputs)
    if operation.capability == "files.search":
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            raise ValueError("files.search requires an artifact collection")
        pattern_match = re.search(r'"([^"]+)"', operation.expression)
        pattern = pattern_match.group(1).lower() if pattern_match else "*"
        matches = [artifact for artifact in source if _matches_pattern(getattr(artifact, "relative_path", ""), pattern)]
        return "ArtifactCollection", matches, tuple(operation.inputs)
    if operation.capability == "files.inspect":
        source = _resolve_value(operation.inputs, values, workspace_root)
        if isinstance(source, list):
            return "ArtifactInspection", source[:1], tuple(operation.inputs)
        raise ValueError("files.inspect requires an artifact collection")
    if operation.capability == "metadata.extract":
        source = _resolve_value(operation.inputs, values, workspace_root)
        root = values.get("EVID-001")
        if not isinstance(root, Path) and workspace_root:
            root = workspace_root
        if not isinstance(source, list):
            raise ValueError("metadata.extract requires an artifact collection")
        return "MetadataCollection", provider.extract_metadata(root if isinstance(root, Path) else Path("."), source), tuple(operation.inputs)
    if operation.capability == "hash":
        source = _resolve_value(operation.inputs, values, workspace_root)
        if isinstance(source, Path):
            return "IntegrityRecord", _hash_path(source), tuple(operation.inputs)
        if isinstance(source, list):
            return "IntegrityCollection", [{"artifact_id": getattr(item, "id", f"ART-{idx}"), "sha256": getattr(item, "sha256", "")} for idx, item in enumerate(source, 1)], tuple(operation.inputs)
        raise ValueError("hash requires an evidence path or artifact collection")
    if operation.capability == "events.extract":
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            raise ValueError("events.extract requires an artifact collection")
        root = values.get("EVID-001")
        if not isinstance(root, Path) and workspace_root:
            root = workspace_root
        return "EventCollection", provider.extract_events(source, source=root if isinstance(root, Path) else None), tuple(operation.inputs)
    if operation.capability == "timeline.build":
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            raise ValueError("timeline.build requires an event collection")
        return "Timeline", sorted(source, key=lambda item: str(item.get("timestamp", ""))), tuple(operation.inputs)
    if operation.capability == "correlate":
        input_values = [_resolve_value((name,), values, workspace_root) for name in operation.inputs]
        findings = _perform_forensic_correlation(operation.inputs, input_values)
        return "FindingCollection", findings, tuple(operation.inputs)
    if operation.capability == "export":
        source = _resolve_value(operation.inputs, values, workspace_root)
        export_result = _perform_export(source, operation.destination, workspace_root)
        return "Export", export_result, tuple(operation.inputs)
    raise ValueError(f"capability is not implemented by the local provider: {operation.capability}")


def _perform_forensic_correlation(input_names: tuple[str, ...], input_values: list[object]) -> list[dict[str, object]]:
    artifacts: list[ArtifactRecord] = []
    metadata_list: list[MetadataRecord] = []
    events: list[dict[str, object]] = []

    for val in input_values:
        if isinstance(val, list):
            for item in val:
                if isinstance(item, ArtifactRecord):
                    artifacts.append(item)
                elif isinstance(item, MetadataRecord):
                    metadata_list.append(item)
                elif isinstance(item, dict) and ("timestamp" in item or "kind" in item):
                    events.append(item)

    findings: list[dict[str, object]] = []

    # 1. Suspicious Artifacts & Archives
    for artifact in artifacts:
        suspicious_exts = {".zip", ".ps1", ".bat", ".exe", ".elf", ".vbs", ".sh"}
        if artifact.extension.lower() in suspicious_exts:
            meta = next((m for m in metadata_list if m.artifact_id == artifact.id), None)
            suspicious_members = []
            if meta and "archive" in meta.namespaces:
                suspicious_members = meta.namespaces["archive"].get("suspicious_members", [])

            related_evts = [e["id"] for e in events if e.get("artifact_id") == artifact.id or artifact.name in str(e.get("description", ""))]
            indicators = [f"Extension: {artifact.extension}"]
            if suspicious_members:
                indicators.append(f"Archive members: {', '.join(suspicious_members)}")

            findings.append({
                "id": f"FND-{len(findings) + 1:03d}",
                "title": f"Suspicious File/Archive Detected: {artifact.name}",
                "severity": "HIGH" if suspicious_members or artifact.extension in {".ps1", ".bat", ".exe"} else "MEDIUM",
                "kind": "archive_payload_risk",
                "summary": f"Artifact '{artifact.relative_path}' ({artifact.size_bytes} bytes) contains executable or compressed potential payload indicators.",
                "confidence": 0.95 if suspicious_members else 0.85,
                "artifact_refs": [artifact.id],
                "event_refs": related_evts,
                "indicators": indicators,
                "evidence_sources": list(input_names),
            })

    # 2. Suspicious Execution & Ingress Events
    suspicious_keywords = ["powershell", "cmd.exe", "invoke-webrequest", "payload", "pastebin", "ngrok", "tunnel", "192.168.1.1"]
    matched_evts = [
        e for e in events
        if any(kw in str(e.get("description", "")).lower() for kw in suspicious_keywords)
        or e.get("level") in {"WARN", "ERROR"}
    ]

    if matched_evts:
        evt_ids = [str(e["id"]) for e in matched_evts if "id" in e]
        art_ids = list({str(e["artifact_id"]) for e in matched_evts if "artifact_id" in e})
        findings.append({
            "id": f"FND-{len(findings) + 1:03d}",
            "title": "Anomalous Command Execution & Ingress Network Events",
            "severity": "HIGH",
            "kind": "execution_anomaly",
            "summary": f"Detected {len(matched_evts)} high-priority events indicating script execution, internal payload staging, or egress tunnels.",
            "confidence": 0.92,
            "artifact_refs": art_ids,
            "event_refs": evt_ids,
            "indicators": [str(e.get("description", ""))[:80] for e in matched_evts[:4]],
            "evidence_sources": list(input_names),
        })

    # 3. Credential & Privilege Activity
    cred_keywords = ["password", "token", "secret", "sam", "admin", "login"]
    cred_evts = [
        e for e in events
        if any(kw in str(e.get("description", "")).lower() for kw in cred_keywords)
    ]
    if cred_evts:
        findings.append({
            "id": f"FND-{len(findings) + 1:03d}",
            "title": "Credential Staging & Authentication Activity",
            "severity": "HIGH",
            "kind": "credential_access",
            "summary": f"Observed {len(cred_evts)} security-sensitive events referencing tokens, passwords, or administrative privileges.",
            "confidence": 0.88,
            "artifact_refs": list({str(e["artifact_id"]) for e in cred_evts if "artifact_id" in e}),
            "event_refs": [str(e["id"]) for e in cred_evts if "id" in e],
            "indicators": [str(e.get("description", ""))[:80] for e in cred_evts[:3]],
            "evidence_sources": list(input_names),
        })

    # 4. Fallback baseline finding if nothing else was flagged
    if not findings:
        count = sum(len(v) if isinstance(v, list) else 1 for v in input_values)
        findings.append({
            "id": f"FND-001",
            "title": "Forensic Baseline Correlated",
            "severity": "INFO",
            "kind": "baseline_correlation",
            "summary": f"Correlated {count} items across {', '.join(input_names)}. No anomalous activity detected.",
            "confidence": 0.70,
            "artifact_refs": [a.id for a in artifacts],
            "event_refs": [str(e.get("id", "")) for e in events if "id" in e],
            "indicators": ["Normal filesystem baseline"],
            "evidence_sources": list(input_names),
        })

    return findings


def _perform_export(source: object, destination: str | None, workspace_root: Path | None) -> dict[str, object]:
    dest_clean = (destination or "./outputs/export.json").strip().strip('"').strip("'")
    if dest_clean.startswith(">"):
        dest_clean = dest_clean.lstrip(">").strip().strip('"').strip("'")

    if workspace_root:
        rel_path = dest_clean.lstrip("./").lstrip("/")
        target_path = (workspace_root / rel_path).resolve()
    else:
        target_path = Path(dest_clean).resolve()

    target_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = _serialize_export_data(source)
    content = json.dumps(serialized, indent=2)
    target_path.write_text(content, encoding="utf-8")

    digest = sha256(target_path.read_bytes()).hexdigest()
    records_count = len(source) if isinstance(source, list) else 1

    return {
        "status": "exported",
        "destination": dest_clean,
        "file_path": str(target_path),
        "relative_path": target_path.relative_to(workspace_root).as_posix() if workspace_root and workspace_root in target_path.parents else target_path.name,
        "records_count": records_count,
        "size_bytes": len(content.encode("utf-8")),
        "sha256": digest,
        "preview": serialized[:3] if isinstance(serialized, list) else serialized,
    }


def _serialize_export_data(value: object) -> object:
    if isinstance(value, Path):
        return value.as_posix()
    if hasattr(value, "__dataclass_fields__"):
        return {key: _serialize_export_data(item) for key, item in asdict(value).items()}
    if isinstance(value, dict):
        return {key: _serialize_export_data(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_serialize_export_data(item) for item in value]
    return value


def _resolve_value(inputs: tuple[str, ...], values: dict[str, object], workspace_root: Path | None = None) -> object:
    if not inputs:
        raise ValueError("operation has no input")
    raw_key = inputs[0].strip().strip('"').strip("'")
    if raw_key in values:
        return values[raw_key]

    for k, v in values.items():
        if k.lower() == raw_key.lower():
            return v

    if workspace_root:
        for candidate in [
            workspace_root / raw_key,
            workspace_root / "Evidence" / raw_key,
            workspace_root / "Sources" / raw_key,
            workspace_root / raw_key.removeprefix("Sources/"),
            workspace_root / "Evidence" / raw_key.removeprefix("Sources/"),
            workspace_root / "Evidence" / raw_key.removeprefix("Evidence/"),
        ]:
            if candidate.exists():
                return candidate.resolve()

    if "EVID-001" in values:
        return values["EVID-001"]

    raise ValueError(f"unknown result reference: {inputs[0]}")


def _resolve_path(inputs: tuple[str, ...], values: dict[str, object], workspace_root: Path | None = None) -> Path:
    value = _resolve_value(inputs, values, workspace_root)
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
