from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent.parent))

from jocky import lower_to_ir, parse_procedure


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
    suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent / "tests"))
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
