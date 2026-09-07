from pathlib import Path
import sys
import unittest
import os

sys.path.insert(0, str(Path(__file__).parent.parent))

from jocky import lower_to_ir, parse_procedure
from evidra import CaseStore, FileSystemProvider, RuntimeService, execute_ir


SAMPLE = '''
# JOCKY v0.1 sample
[prepare]
    working = copy EVID-001 as "working_evidence"
    hash working
[examine]
    artifacts = files.list working
    suspicious = filter(extension == ".zip" | ".elf") from artifacts
[export]
    export suspicious > "./outputs/suspicious.json"
'''


def verify_fixture_evidence() -> None:
    fixture_root = Path(__file__).parent.parent / "test" / "evidence" / "CASE-TEST-001"
    files = sorted(path for path in fixture_root.rglob("*") if path.is_file())
    assert len(files) == 6, f"expected 6 fixture files, found {len(files)}"
    import hashlib
    hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    assert all(len(value) == 64 for value in hashes.values())
    zip_files = [path for path in files if path.suffix == ".zip"]
    assert [path.name for path in zip_files] == ["archive.zip"]
    print(f"Evidence fixture verification passed: {len(files)} files hashed, {len(zip_files)} filtered")


def verify_filesystem_provider() -> None:
    fixture_root = Path(__file__).parent.parent / "test" / "evidence" / "CASE-TEST-001"
    provider = FileSystemProvider()
    artifacts = provider.list_artifacts(fixture_root)
    zip_artifacts = provider.filter_artifacts(artifacts, ".zip")
    metadata = provider.extract_metadata(fixture_root, zip_artifacts)
    assert len(artifacts) == 6
    assert [artifact.name for artifact in zip_artifacts] == ["archive.zip"]
    assert metadata[0].common["name"] == "archive.zip"
    assert "archive" in metadata[0].namespaces
    print(f"Filesystem provider verification passed: {len(artifacts)} artifacts, {len(metadata)} metadata records")


def verify_executor() -> None:
    fixture_root = Path(__file__).parent.parent / "test" / "evidence" / "CASE-TEST-001"
    source = """
    [examine]
    artifacts = files.list EVID-001
    suspicious = filter(extension == \".zip\") from artifacts
    metadata = metadata.extract suspicious
    """
    run = execute_ir(lower_to_ir(parse_procedure(source)), fixture_root)
    assert run.status == "completed"
    assert [step.status for step in run.steps] == ["completed", "completed", "completed"]
    assert run.results[-1].type == "MetadataCollection"
    print(f"Execution verification passed: {len(run.steps)} operations, {len(run.results)} typed results")


def verify_service() -> None:
    fixture_root = Path(__file__).parent.parent / "test" / "evidence" / "CASE-TEST-001"
    source = """
    [examine]
    artifacts = files.list EVID-001
    suspicious = filter(extension == \".zip\") from artifacts
    metadata = metadata.extract suspicious
    """
    response = RuntimeService().execute(source, fixture_root)
    assert response["status"] == "completed"
    assert response["results"][-1]["type"] == "MetadataCollection"
    assert response["results"][-1]["value"][0]["common"]["name"] == "archive.zip"
    print("Runtime service verification passed: JSON-ready execution response")


def verify_case_store() -> None:
    fixture_root = Path(__file__).parent.parent / "test" / "evidence" / "CASE-TEST-001"
    database = Path(__file__).parent.parent / "tmp" / f"verify-case-{os.getpid()}.db"
    database.parent.mkdir(exist_ok=True)
    if database.exists():
        database.unlink()
    store = CaseStore(database)
    response = RuntimeService(store).execute("""
    [examine]
      artifacts = files.list EVID-001
    """, fixture_root)
    assert response["run_id"].startswith("RUN-")
    assert len(store.list_runs("CASE-001")) == 1
    assert store.get_case_snapshot("CASE-001")["case"]["id"] == "CASE-001"
    database.unlink()
    print("Case store verification passed: durable run record created")


def main() -> int:
    procedure = parse_procedure(SAMPLE)
    assert not procedure.diagnostics, procedure.diagnostics
    assert [stage.name for stage in procedure.stages] == ["prepare", "examine", "export"]
    assert [operation.capability for operation in procedure.operations] == [
        "copy", "hash", "files.list", "filter", "export"
    ]
    assert procedure.operations[-1].destination == '"./outputs/suspicious.json"'
    print(f"JOCKY parser verification passed: {len(procedure.operations)} operations")
    investigation_ir = lower_to_ir(procedure)
    assert not investigation_ir.diagnostics, investigation_ir.diagnostics
    assert [operation.id for operation in investigation_ir.operations] == [
        "OP-001", "OP-002", "OP-003", "OP-004", "OP-005"
    ]
    assert investigation_ir.operations[2].dependencies == ("OP-001",)
    assert investigation_ir.operations[3].dependencies == ("OP-003",)
    assert investigation_ir.operations[4].dependencies == ("OP-004",)
    print(f"Investigation IR verification passed: {len(investigation_ir.operations)} deterministic operations")
    verify_fixture_evidence()
    verify_filesystem_provider()
    verify_executor()
    verify_service()
    verify_case_store()
    suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent / "tests"))
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
