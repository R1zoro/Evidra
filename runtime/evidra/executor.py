from dataclasses import asdict, dataclass
from hashlib import sha256
import json
from pathlib import Path
import re

from jocky import InvestigationIR, IROperation

from .filesystem_provider import FileSystemProvider
from .results import ArtifactRecord, MetadataRecord, coerce_artifact


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
    line_number: int
    result_id: str | None = None
    message: str = ""


@dataclass(frozen=True)
class ExecutionRun:
    status: str
    steps: tuple[ExecutionStep, ...]
    results: tuple[ResultEnvelope, ...]


from typing import Callable

def compute_fingerprint(operation: IROperation, values: dict[str, object]) -> str:
    resolved_args = []
    for arg in operation.inputs:
        val = None
        if isinstance(arg, str) and arg.startswith("$"):
            val = values.get(arg[1:])
        elif isinstance(arg, str) and arg in values:
            val = values.get(arg)

        if val is not None:
            if hasattr(val, "resolve"):
                p = Path(val).resolve()
                if p.is_file():
                    resolved_args.append(f"{p}:{p.stat().st_size}:{p.stat().st_mtime_ns}")
                elif p.is_dir():
                    files = [f for f in p.rglob("*") if f.is_file()]
                    max_mtime = max((f.stat().st_mtime_ns for f in files), default=0)
                    resolved_args.append(f"{p}:{len(files)}:{max_mtime}")
                else:
                    resolved_args.append(str(p))
            elif isinstance(val, list):
                sub_hashes = []
                for item in val[:50]:
                    if hasattr(item, "id"):
                        sub_hashes.append(f"{item.id}:{getattr(item, 'sha256', '')}")
                    elif isinstance(item, dict) and "id" in item:
                        sub_hashes.append(f"{item['id']}:{item.get('sha256', '')}")
                    else:
                        sub_hashes.append(str(hash(str(item))))
                resolved_args.append(f"list:{len(val)}:[{','.join(sub_hashes)}]")
            else:
                resolved_args.append(repr(val))
        else:
            resolved_args.append(repr(arg))

    data = json.dumps({
        "cap": operation.capability,
        "args": resolved_args,
        "expr": operation.expression,
        "dest": operation.destination,
    }, sort_keys=True)
    return sha256(data.encode()).hexdigest()
def execute_ir(
    ir: InvestigationIR,
    evidence_root: str | Path,
    provider: FileSystemProvider | None = None,
    workspace_root: str | Path | None = None,
    cache_lookup: Callable[[str], dict | None] | None = None,
    on_cache_miss: Callable[[str, str, str], None] | None = None,
) -> ExecutionRun:
    """Execute the safe read-only v0.1 capabilities represented by an IR."""
    provider = provider or FileSystemProvider()
    resolved_evidence = Path(evidence_root).resolve()
    if workspace_root:
        resolved_workspace = Path(workspace_root).resolve()
    else:
        p = resolved_evidence
        if "Evidence" in p.parts:
            cur = p
            while cur.name != "Evidence" and cur.parent != cur:
                cur = cur.parent
            resolved_workspace = cur.parent if cur.name == "Evidence" else p
        elif (p / "Evidence").exists() or (p / "Outputs").exists():
            resolved_workspace = p
        else:
            resolved_workspace = p
    values: dict[str, object] = {"EVID-001": resolved_evidence}
    steps: list[ExecutionStep] = []
    results: list[ResultEnvelope] = []
    failed_ids: set[str] = set()

    for operation in ir.operations:
        if any(dependency in failed_ids for dependency in operation.dependencies):
            steps.append(ExecutionStep(operation.id, operation.capability, "skipped", operation.line_number, message="dependency did not complete"))
            failed_ids.add(operation.id)
            continue
        try:
            # Deliverable exports always execute fresh to ensure disk state matches
            if operation.capability == "export":
                cached = None
            else:
                fingerprint = compute_fingerprint(operation, values)
                cached = cache_lookup(fingerprint) if cache_lookup else None

            if cached:
                cached_val = cached["value"]
                if cached.get("type") == "ArtifactCollection" and isinstance(cached_val, list):
                    cached_val = [coerce_artifact(x) for x in cached_val]
                elif cached.get("type") == "EvidenceReference" and isinstance(cached_val, str):
                    cached_val = Path(cached_val)
                result_id = f"RES-{len(results) + 1:03d}"
                envelope = ResultEnvelope(result_id, operation.id, cached["type"], cached_val, tuple(), "reused")
                results.append(envelope)
                if operation.output:
                    values[operation.output] = cached_val
                steps.append(ExecutionStep(operation.id, operation.capability, "reused", operation.line_number, result_id=result_id))
                continue

            result_type, value, source_ids = _execute_operation(operation, values, provider, resolved_workspace)
            if on_cache_miss:
                on_cache_miss(fingerprint, result_type, json.dumps(_serialize_export_data(value), default=str))

            result_id = f"RES-{len(results) + 1:03d}"
            envelope = ResultEnvelope(result_id, operation.id, result_type, value, source_ids, "completed")
            results.append(envelope)
            if operation.output:
                values[operation.output] = value
            steps.append(ExecutionStep(operation.id, operation.capability, "completed", operation.line_number, result_id=result_id))
        except (FileNotFoundError, ValueError, OSError) as error:
            steps.append(ExecutionStep(operation.id, operation.capability, "failed", operation.line_number, message=str(error)))
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
        quoted = re.search(r'"([^"]+)"', operation.expression)
        if quoted:
            target_ref = quoted.group(1)
            try:
                root = _resolve_path((target_ref,), values, workspace_root)
                return "EvidenceReference", root, (target_ref,)
            except ValueError:
                pass
        root = _resolve_path(("EVID-001",), values, workspace_root)
        return "EvidenceReference", root, ("EVID-001",)
    if operation.capability == "evidence.materialize":
        source = _resolve_path(operation.inputs, values, workspace_root)
        return "EvidenceReference", source, tuple(operation.inputs)
    if operation.capability == "copy":
        source = _resolve_path(operation.inputs, values, workspace_root)
        if workspace_root and operation.destination:
            dest = operation.destination.strip('"').strip("'").strip(">").strip()
            workspace_resolved = workspace_root.resolve()
            target = (workspace_resolved / dest).resolve()
            
            if not target.is_relative_to(workspace_resolved):
                raise ValueError(f"Copy destination '{dest}' escapes workspace bounds.")

            if not target.exists() and "/" not in dest and "\\" not in dest:
                target = (workspace_resolved / "Evidence" / dest).resolve()

            import shutil
            target.parent.mkdir(parents=True, exist_ok=True)
            if Path(source).is_dir():
                shutil.copytree(source, target, dirs_exist_ok=True)
            else:
                shutil.copy2(source, target)

            return "EvidenceReference", target, tuple(operation.inputs)
        return "EvidenceReference", source, tuple(operation.inputs)
    if operation.capability == "files.list":
        inputs_to_resolve = operation.inputs if operation.inputs else ("EVID-001",)
        source = _resolve_path(inputs_to_resolve, values, workspace_root)
        return "ArtifactCollection", provider.list_artifacts(source), tuple(operation.inputs)
    if operation.capability == "filter":
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            raise ValueError("filter requires a collection input")
        source = [coerce_artifact(a) for a in source]
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
        source = [coerce_artifact(a) for a in source]
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
        coerced = [coerce_artifact(a) for a in source]
        return "MetadataCollection", provider.extract_metadata(root if isinstance(root, Path) else Path("."), coerced), tuple(operation.inputs)
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
        coerced = [coerce_artifact(a) for a in source]
        return "EventCollection", provider.extract_events(coerced, source=root if isinstance(root, Path) else None), tuple(operation.inputs)
    if operation.capability == "timeline.build":
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            raise ValueError("timeline.build requires an event collection")
        def _get_time(item):
            if isinstance(item, dict):
                return str(item.get("timestamp") or item.get("modified_at") or "")
            if hasattr(item, "filesystem") and hasattr(item.filesystem, "modified_at"):
                return str(item.filesystem.modified_at)
            return str(getattr(item, "timestamp", getattr(item, "modified_at", "")))
        return "Timeline", sorted(source, key=_get_time), tuple(operation.inputs)
    if operation.capability in {"artifacts.parse_prefetch", "prefetch.extract"}:
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            raise ValueError("prefetch.extract requires an artifact collection")
        root = values.get("EVID-001")
        if not isinstance(root, Path) and workspace_root:
            root = workspace_root
        coerced = [coerce_artifact(a) for a in source]
        return "PrefetchCollection", provider.parse_prefetch(root if isinstance(root, Path) else Path("."), coerced), tuple(operation.inputs)
    if operation.capability in {"yara.scan", "yara", "artifacts.yara_scan"}:
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            if isinstance(source, Path) and source.exists():
                source = provider.list_artifacts(source)
            else:
                raise ValueError("yara.scan requires an artifact collection or evidence path")
        root = values.get("EVID-001")
        if not isinstance(root, Path) and workspace_root:
            root = workspace_root
        coerced = [coerce_artifact(a) for a in source]
        ruleset_match = re.search(r'with\s+["\']([^"\']+)["\']', operation.expression) or re.search(r'["\']([^"\']+\.yar[a]?)["\']', operation.expression)
        ruleset_arg = ruleset_match.group(1) if ruleset_match else None
        hits = provider.scan_yara(root if isinstance(root, Path) else Path("."), coerced, ruleset_path=ruleset_arg, workspace_root=workspace_root)
        return "YaraResults", hits, tuple(operation.inputs)
    if operation.capability in {"events.merge", "merge"}:
        collections = [_resolve_value((name,), values, workspace_root) for name in operation.inputs]
        merged = provider.merge_events(*collections)
        return "EventCollection", merged, tuple(operation.inputs)
    if operation.capability in {"pcap.analyze", "network.extract", "network.pcap_analyze"}:
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            if isinstance(source, Path) and source.exists():
                source = provider.list_artifacts(source)
            else:
                raise ValueError("pcap.analyze requires an artifact collection or path")
        root = values.get("EVID-001")
        if not isinstance(root, Path) and workspace_root:
            root = workspace_root
        coerced = [coerce_artifact(a) for a in source]
        pcap_records = provider.analyze_pcap(root if isinstance(root, Path) else Path("."), coerced)
        return "NetworkCollection", pcap_records, tuple(operation.inputs)
    if operation.capability in {"registry.parse", "winreg.extract", "artifacts.parse_registry"}:
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            if isinstance(source, Path) and source.exists():
                source = provider.list_artifacts(source)
            else:
                raise ValueError("registry.parse requires an artifact collection or path")
        root = values.get("EVID-001")
        if not isinstance(root, Path) and workspace_root:
            root = workspace_root
        coerced = [coerce_artifact(a) for a in source]
        reg_records = provider.parse_registry(root if isinstance(root, Path) else Path("."), coerced)
        return "RegistryCollection", reg_records, tuple(operation.inputs)
    if operation.capability in {"memory.analyze", "memory.processes", "ram.analyze"}:
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            if isinstance(source, Path) and source.exists():
                source = provider.list_artifacts(source)
            else:
                raise ValueError("memory.analyze requires an artifact collection or path")
        root = values.get("EVID-001")
        if not isinstance(root, Path) and workspace_root:
            root = workspace_root
        coerced = [coerce_artifact(a) for a in source]
        mem_records = provider.analyze_memory(root if isinstance(root, Path) else Path("."), coerced)
        return "MemoryCollection", mem_records, tuple(operation.inputs)
    if operation.capability in {"evtx.parse", "events.parse_evtx"}:
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            if isinstance(source, Path) and source.exists():
                source = provider.list_artifacts(source)
            else:
                raise ValueError("evtx.parse requires an artifact collection or path")
        root = values.get("EVID-001")
        if not isinstance(root, Path) and workspace_root:
            root = workspace_root
        coerced = [coerce_artifact(a) for a in source]
        evtx_events = provider.parse_evtx(root if isinstance(root, Path) else Path("."), coerced)
        return "EventCollection", evtx_events, tuple(operation.inputs)
    if operation.capability in {"hash.verify", "hashes.verify"}:
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            if isinstance(source, Path) and source.exists():
                source = provider.list_artifacts(source)
            else:
                raise ValueError("hash.verify requires an artifact collection or path")
        root = values.get("EVID-001")
        if not isinstance(root, Path) and workspace_root:
            root = workspace_root
        coerced = [coerce_artifact(a) for a in source]
        verify_rep = provider.verify_hashes(root if isinstance(root, Path) else Path("."), coerced)
        return "VerificationReport", verify_rep, tuple(operation.inputs)
    if operation.capability in {"ioc.match", "threat.match"}:
        source = _resolve_value(operation.inputs, values, workspace_root)
        if not isinstance(source, list):
            raise ValueError("ioc.match requires an artifact collection")
        coerced = [coerce_artifact(a) for a in source]
        return "IOCCollection", provider.match_ioc(coerced), tuple(operation.inputs)
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
    yara_hits: list[dict[str, object]] = []
    network_records: list[dict[str, object]] = []
    registry_records: list[dict[str, object]] = []
    memory_records: list[dict[str, object]] = []
    verify_reports: list[dict[str, object]] = []

    for val in input_values:
        if isinstance(val, dict) and "verified_records" in val:
            verify_reports.append(val)
        elif isinstance(val, dict) and "memory_image" in val:
            memory_records.append(val)
        elif isinstance(val, list):
            for item in val:
                if isinstance(item, dict) and "memory_image" in item:
                    memory_records.append(item)
                elif isinstance(item, ArtifactRecord):
                    artifacts.append(item)
                elif isinstance(item, dict) and "rule_name" in item:
                    yara_hits.append(item)
                elif isinstance(item, dict) and "total_packets" in item:
                    network_records.append(item)
                elif isinstance(item, dict) and "category" in item and "key_path" in item:
                    registry_records.append(item)
                elif isinstance(item, dict) and "relative_path" in item:
                    artifacts.append(coerce_artifact(item))
                elif isinstance(item, MetadataRecord):
                    metadata_list.append(item)
                elif isinstance(item, dict) and "namespaces" in item:
                    metadata_list.append(MetadataRecord(
                        id=str(item.get("id", "")),
                        artifact_id=str(item.get("artifact_id", "")),
                        common=dict(item.get("common", {})),
                        filesystem=dict(item.get("filesystem", {})),
                        namespaces=dict(item.get("namespaces", {})),
                    ))
                elif isinstance(item, dict) and ("timestamp" in item or "kind" in item or "event_id" in item):
                    events.append(item)

    findings: list[dict[str, object]] = []

    # 0.0 Volatile Memory Analysis Findings (Attribution: Volatility 3 Specification)
    for mem in memory_records:
        for inj in mem.get("injections", []):
            findings.append({
                "id": f"FND-{len(findings) + 1:03d}",
                "title": f"Volatile Memory Code Injection: {inj.get('process_name')} (PID {inj.get('pid')})",
                "severity": inj.get("severity", "CRITICAL"),
                "kind": "memory_code_injection",
                "summary": f"Injected memory page detected in {inj.get('process_name')} at {inj.get('address')} ({inj.get('protection')}) matching {inj.get('shellcode_signature')}.",
                "confidence": 0.99,
                "artifact_refs": [str(mem.get("artifact_id", ""))] if mem.get("artifact_id") else [],
                "event_refs": [],
                "indicators": [
                    f"Process: {inj.get('process_name')} (PID {inj.get('pid')})",
                    f"Virtual Offset: {inj.get('address')}",
                    f"Protection: {inj.get('protection')}",
                    f"Signature: {inj.get('shellcode_signature')}",
                    "Attribution: Volatility 3 Specification",
                ],
                "evidence_sources": list(input_names),
            })
        for p in mem.get("processes", []):
            if p.get("is_hidden"):
                findings.append({
                    "id": f"FND-{len(findings) + 1:03d}",
                    "title": f"DKOM Hidden Process Detected: {p.get('image_name')} (PID {p.get('pid')})",
                    "severity": "CRITICAL",
                    "kind": "dkom_hidden_process",
                    "summary": f"Process {p.get('image_name')} (PID {p.get('pid')}) unlinked from OS ActiveProcessLinks to evade detection.",
                    "confidence": 0.98,
                    "artifact_refs": [str(mem.get("artifact_id", ""))] if mem.get("artifact_id") else [],
                    "event_refs": [],
                    "indicators": [
                        f"Hidden Process: {p.get('image_name')}",
                        f"PID: {p.get('pid')}",
                        f"DKOM Alert: {p.get('dkom_alert')}",
                        "Attribution: Volatility 3 Specification",
                    ],
                    "evidence_sources": list(input_names),
                })
        for lin in mem.get("suspicious_lineages", []):
            findings.append({
                "id": f"FND-{len(findings) + 1:03d}",
                "title": f"Anomalous Process Lineage: {lin.get('parent_name')} -> {lin.get('process_name')}",
                "severity": lin.get("severity", "CRITICAL"),
                "kind": "anomalous_process_lineage",
                "summary": lin.get("alert", "Anomalous parent-child process lineage observed in memory space."),
                "confidence": 0.95,
                "artifact_refs": [str(mem.get("artifact_id", ""))] if mem.get("artifact_id") else [],
                "event_refs": [],
                "indicators": [
                    f"Parent: {lin.get('parent_name')} (PPID {lin.get('ppid')})",
                    f"Child: {lin.get('process_name')} (PID {lin.get('pid')})",
                    f"Alert: {lin.get('alert')}",
                    "Attribution: Volatility 3 Specification",
                ],
                "evidence_sources": list(input_names),
            })

    # 0.05 Evidence Hash Verification (Attribution: NIST SP 800-86 Specification)
    for vrep in verify_reports:
        if vrep.get("status") == "CONTAMINATED" or vrep.get("mismatch_count", 0) > 0:
            findings.append({
                "id": f"FND-{len(findings) + 1:03d}",
                "title": "Evidence Hash Tamper / Contamination Alert",
                "severity": "CRITICAL",
                "kind": "evidence_contamination",
                "summary": f"Cryptographic audit failed: {vrep.get('mismatch_count')} artifact(s) showed hash discrepancies against chain-of-custody baseline.",
                "confidence": 1.0,
                "artifact_refs": [],
                "event_refs": [],
                "indicators": [
                    f"Status: {vrep.get('status')}",
                    f"Mismatches: {vrep.get('mismatch_count')}",
                    "Attribution: NIST SP 800-86 Specification",
                ],
                "evidence_sources": list(input_names),
            })

    # 0.08 Windows Event Logs Anti-Forensics (Attribution: Eric Zimmerman EvtxECmd)
    for evt in events:
        if evt.get("event_id") == 1102 or "audit log was intentionally cleared" in str(evt.get("description", "")).lower():
            findings.append({
                "id": f"FND-{len(findings) + 1:03d}",
                "title": "Anti-Forensics Alert: Security Audit Log Cleared (Event 1102)",
                "severity": "CRITICAL",
                "kind": "anti_forensics_log_cleared",
                "summary": "Windows security event log was intentionally cleared by an administrator account to conceal intruder activity.",
                "confidence": 0.99,
                "artifact_refs": [str(evt.get("artifact_id", ""))] if evt.get("artifact_id") else [],
                "event_refs": [str(evt.get("id", ""))],
                "indicators": [
                    "Event ID: 1102",
                    "Channel: Security",
                    "Description: Audit Log Cleared",
                    "Attribution: Eric Zimmerman EvtxECmd",
                ],
                "evidence_sources": list(input_names),
            })

    # 0. YARA Threat Signatures (Attribution: VirusTotal YARA)
    for hit in yara_hits:
        r_name = str(hit.get("rule_name", "Unknown"))
        r_sev = str(hit.get("severity", "CRITICAL"))
        r_desc = str(hit.get("description", "Threat signature detected"))
        f_path = str(hit.get("file_path", ""))
        n_strings = len(hit.get("matched_strings", []))
        findings.append({
            "id": f"FND-{len(findings) + 1:03d}",
            "title": f"YARA Threat Signature Detected: {r_name}",
            "severity": r_sev,
            "kind": "yara_threat_signature",
            "summary": f"Artifact '{f_path}' matched threat signature '{r_name}': {r_desc}",
            "confidence": 0.98,
            "artifact_refs": [str(hit["artifact_id"])] if hit.get("artifact_id") else [],
            "event_refs": [],
            "indicators": [
                f"Rule: {r_name}",
                f"Matched Strings: {n_strings} signature pattern(s)",
                f"Attribution: {hit.get('tool_attribution', 'VirusTotal YARA')}",
            ],
            "evidence_sources": list(input_names),
        })

    # 0.1 Network C2 & Protocol Anomalies (Attribution: Wireshark / Zeek)
    for net in network_records:
        for alert in net.get("suspicious_alerts", []):
            findings.append({
                "id": f"FND-{len(findings) + 1:03d}",
                "title": f"Network C2 Threat Detected: {alert.get('alert', 'Suspicious Network Traffic')}",
                "severity": alert.get("severity", "CRITICAL"),
                "kind": "network_c2_anomaly",
                "summary": f"Observed anomalous flow {alert.get('flow', '')} communicating with potential command-and-control infrastructure.",
                "confidence": 0.96,
                "artifact_refs": [str(net.get("artifact_id", ""))] if net.get("artifact_id") else [],
                "event_refs": [],
                "indicators": [
                    f"Alert: {alert.get('alert')}",
                    f"Port: {alert.get('port')}",
                    f"Traffic: {alert.get('src_ip')} -> {alert.get('dst_ip')}",
                    "Attribution: Wireshark / Zeek Network Analysis Specification",
                ],
                "evidence_sources": list(input_names),
            })

    # 0.2 Windows Registry Persistence (Attribution: Eric Zimmerman RECmd / Harlan Carvey RegRipper)
    for reg in registry_records:
        if "persistence" in reg.get("category", "").lower():
            findings.append({
                "id": f"FND-{len(findings) + 1:03d}",
                "title": f"Registry Persistence Mechanism: {reg.get('value_name', 'Auto-Start')}",
                "severity": reg.get("severity", "HIGH"),
                "kind": "registry_persistence",
                "summary": f"Registry key '{reg.get('key_path')}' configured to execute '{reg.get('decoded_value')}' upon startup.",
                "confidence": 0.94,
                "artifact_refs": [str(reg.get("artifact_id", ""))] if reg.get("artifact_id") else [],
                "event_refs": [],
                "indicators": [
                    f"Category: {reg.get('category')}",
                    f"Key: {reg.get('key_path')}",
                    f"Value: {reg.get('value_name')}",
                    f"Payload: {reg.get('decoded_value')}",
                    "Attribution: Eric Zimmerman RECmd / Harlan Carvey RegRipper",
                ],
                "evidence_sources": list(input_names),
            })

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
    dest_clean = (destination or "./Outputs/export.json").strip().strip('"').strip("'")
    if dest_clean.startswith(">"):
        dest_clean = dest_clean.lstrip(">").strip().strip('"').strip("'")

    dest_path_candidate = Path(dest_clean)
    if dest_clean.endswith("/") or dest_clean.endswith("\\") or not dest_path_candidate.suffix:
        dest_clean = f"{dest_clean.rstrip('/\\\\')}/export.json"

    if Path(dest_clean).is_absolute():
        target_path = Path(dest_clean).resolve()
    elif workspace_root:
        clean_rel = dest_clean.replace("\\", "/")
        while clean_rel.startswith("./") or clean_rel.startswith("/"):
            if clean_rel.startswith("./"):
                clean_rel = clean_rel[2:]
            elif clean_rel.startswith("/"):
                clean_rel = clean_rel[1:]
        target_path = (workspace_root.resolve() / clean_rel).resolve()
    else:
        target_path = Path(dest_clean).resolve()

    target_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = _serialize_export_data(source)
    content = json.dumps(serialized, indent=2, default=str)
    target_path.write_text(content, encoding="utf-8")

    digest = sha256(target_path.read_bytes()).hexdigest()
    records_count = len(source) if isinstance(source, list) else 1

    rel_posix = target_path.name
    if workspace_root:
        try:
            rel_posix = target_path.relative_to(workspace_root.resolve()).as_posix()
        except ValueError:
            rel_posix = target_path.as_posix()

    return {
        "status": "exported",
        "destination": dest_clean,
        "file_path": str(target_path),
        "relative_path": rel_posix,
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
    raw_key = inputs[0].strip().strip('"').strip("'").rstrip(",")
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

    if Path(raw_key).exists():
        return Path(raw_key).resolve()


    raise ValueError(f"unknown result reference: {inputs[0]}")


def _resolve_path(inputs: tuple[str, ...], values: dict[str, object], workspace_root: Path | None = None) -> Path:
    value = _resolve_value(inputs, values, workspace_root)
    if isinstance(value, str):
        return Path(value)
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








