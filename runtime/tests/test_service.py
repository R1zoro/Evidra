import unittest
import shutil
from pathlib import Path

from evidra import RuntimeService
from evidra import CaseStore


FIXTURE = Path(__file__).parents[2] / "test" / "evidence" / "CASE-TEST-001"


class RuntimeServiceTests(unittest.TestCase):
    def test_validate_returns_json_ready_ir(self) -> None:
        response = RuntimeService().validate("[examine]\n  artifacts = files.list EVID-001")
        self.assertTrue(response["valid"])
        self.assertEqual(response["operation_count"], 1)
        self.assertEqual(response["ir"][0]["capability"], "files.list")

    def test_execute_returns_json_ready_results(self) -> None:
        source = """
        [examine]
        artifacts = files.list EVID-001
        suspicious = filter(extension == \".zip\") from artifacts
        metadata = metadata.extract suspicious
        """
        response = RuntimeService().execute(source, FIXTURE)
        self.assertEqual(response["status"], "completed")
        self.assertEqual([step["status"] for step in response["steps"]], ["completed"] * 3)
        self.assertEqual(response["results"][-1]["type"], "MetadataCollection")
        self.assertEqual(response["results"][-1]["value"][0]["common"]["name"], "archive.zip")

    def test_execute_resolves_registered_evidence_id(self) -> None:
        root = Path(__file__).parents[2] / "tmp" / "service-evidence-test"
        shutil.rmtree(root, ignore_errors=True)
        try:
            (root / "menu").mkdir(parents=True)
            (root / "menu" / "page1.png").write_bytes(b"image")
            database = root / "case.db"
            store = CaseStore(database)
            store.register_evidence("CASE-001", "EVID-UPLOAD", "menu", str(root / "menu"), 1)
            source = '[prepare]\n  source = evidence.import "EVID-UPLOAD"\n[examine]\n  pages = files.list source'
            response = RuntimeService(store).execute(source, FIXTURE, "CASE-001")
            self.assertEqual(response["status"], "completed")
            self.assertEqual(response["results"][-1]["value"][0]["name"], "page1.png")
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def test_execute_supports_source_reference_then_materialize(self) -> None:
        root = Path(__file__).parents[2] / "tmp" / "service-materialize-test"
        shutil.rmtree(root, ignore_errors=True)
        try:
            external = root / "external"
            external.mkdir(parents=True)
            (external / "page.png").write_bytes(b"image")
            workspace = root / "case"
            store = CaseStore(root / "case.db")
            store.register_case("CASE-001", "Case")
            store.set_workspace("CASE-001", str(workspace))
            source = store.register_source("CASE-001", "external", str(external), "source-fingerprint")
            program = f'[prepare]\n  src = evidence.import "{source["id"]}"\n  evidence.materialize src as "external"\n[examine]\n  files = files.list src'
            response = RuntimeService(store).execute(program, FIXTURE, "CASE-001")
            self.assertEqual(response["status"], "completed")
            self.assertTrue((workspace / "Evidence" / "external" / "page.png").exists())
        finally:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
