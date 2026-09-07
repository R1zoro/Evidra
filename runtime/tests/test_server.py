import json
import base64
import threading
import unittest
from uuid import uuid4
from http.client import HTTPConnection
from pathlib import Path

from server import create_server


FIXTURE = Path(__file__).parents[2] / "test" / "evidence" / "CASE-TEST-001"


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = create_server(port=0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
        connection = HTTPConnection("127.0.0.1", self.port)
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        connection.request(method, path, body=body, headers={"Content-Type": "application/json"})
        response = connection.getresponse()
        raw = response.read()
        data = json.loads(raw) if raw else {}
        connection.close()
        return response.status, data

    def test_health_is_local_and_ready(self) -> None:
        status, payload = self.request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload["service"], "evidra-runtime")

    def test_json_api_allows_browser_preflight(self) -> None:
        status, _ = self.request("OPTIONS", "/api/execute")
        self.assertEqual(status, 204)

    def test_execute_returns_typed_json_results(self) -> None:
        source = "[examine]\n  artifacts = files.list EVID-001\n  suspicious = filter(extension == \".zip\") from artifacts"
        status, payload = self.request("POST", "/api/execute", {"source": source, "evidence_root": str(FIXTURE)})
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "completed")
        self.assertEqual(payload["results"][-1]["type"], "ArtifactCollection")

    def test_case_snapshot_and_runs_routes_exist(self) -> None:
        status, snapshot = self.request("GET", "/api/cases/CASE-001")
        self.assertEqual(status, 200)
        self.assertIn("runs", snapshot)
        status, runs = self.request("GET", "/api/cases/CASE-001/runs")
        self.assertEqual(status, 200)
        self.assertIn("runs", runs)

    def test_evidence_import_registers_uploaded_files(self) -> None:
        content = base64.b64encode(b"synthetic image bytes").decode("ascii")
        status, payload = self.request("POST", "/api/cases/CASE-IMPORT-TEST/evidence", {"name": "uploaded-fixture", "files": [{"path": "images/sample.bin", "content": content}]})
        self.assertEqual(status, 201)
        self.assertEqual(payload["evidence"]["file_count"], 1)
        self.assertEqual(payload["snapshot"]["evidence"][0]["name"], "uploaded-fixture")

    def test_source_reference_is_idempotent_and_materializes(self) -> None:
        case_id = f"CASE-SOURCE-{uuid4().hex[:8]}"
        status, _ = self.request("POST", "/api/cases", {"id": case_id, "name": "Source Test", "root": str(Path(__file__).parents[2] / "tmp" / case_id), "folders": ["Evidence"]})
        self.assertEqual(status, 201)
        status, first = self.request("POST", f"/api/cases/{case_id}/sources", {"path": str(FIXTURE), "name": "fixture"})
        self.assertEqual(status, 201)
        status, second = self.request("POST", f"/api/cases/{case_id}/sources", {"path": str(FIXTURE), "name": "fixture"})
        self.assertEqual(status, 200)
        self.assertTrue(second["source"]["existing"])
        status, materialized = self.request("POST", f"/api/cases/{case_id}/sources/{first['source']['id']}/materialize", {"name": "fixture-copy"})
        self.assertEqual(status, 201)
        self.assertEqual(materialized["evidence"]["file_count"], 6)

    def test_case_fs_endpoints(self) -> None:
        case_id = f"CASE-FS-{uuid4().hex[:8]}"
        root = Path(__file__).parents[2] / "tmp" / case_id
        status, _ = self.request("POST", "/api/cases", {"id": case_id, "name": "FS Test", "root": str(root), "folders": ["Outputs"]})
        self.assertEqual(status, 201)

        # Write file
        status, res = self.request("POST", f"/api/cases/{case_id}/fs/file", {"path": "Outputs/findings.json", "content": '{"key": "val"}'})
        self.assertEqual(status, 200)

        # Read file
        status, file_res = self.request("GET", f"/api/cases/{case_id}/fs/file?path=Outputs/findings.json")
        self.assertEqual(status, 200)
        self.assertEqual(file_res["content"], '{"key": "val"}')

        # Create folder
        status, _ = self.request("POST", f"/api/cases/{case_id}/fs/folder", {"path": "Analysis/Subfolder"})
        self.assertEqual(status, 200)

        # Tree
        status, tree_res = self.request("GET", f"/api/cases/{case_id}/fs/tree")
        self.assertEqual(status, 200)
        self.assertTrue(any(node["name"] == "Outputs" for node in tree_res["tree"]))

        # Rename
        status, _ = self.request("POST", f"/api/cases/{case_id}/fs/rename", {"from": "Outputs/findings.json", "to": "Outputs/renamed.json"})
        self.assertEqual(status, 200)

        # Delete
        status, _ = self.request("POST", f"/api/cases/{case_id}/fs/delete", {"path": "Outputs/renamed.json"})
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
