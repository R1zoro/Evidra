import unittest
from pathlib import Path

from evidra import CaseStore, RuntimeService


FIXTURE = Path(__file__).parents[2] / "test" / "evidence" / "CASE-TEST-001"


class CaseStoreTests(unittest.TestCase):
    def test_each_execution_creates_a_preserved_run(self) -> None:
        database = Path(__file__).parents[2] / "tmp" / "test-case-store.db"
        database.parent.mkdir(exist_ok=True)
        if database.exists():
            database.unlink()
        store = CaseStore(database)
        service = RuntimeService(store)
        source = """
        [examine]
          artifacts = files.list EVID-001
        """
        first = service.execute(source, FIXTURE)
        second = service.execute(source, FIXTURE)
        runs = store.list_runs("CASE-001")
        self.assertNotEqual(first["run_id"], second["run_id"])
        self.assertEqual(len(runs), 2)
        self.assertEqual({run["status"] for run in runs}, {"completed"})
        snapshot = store.get_case_snapshot("CASE-001")
        self.assertEqual(snapshot["case"]["id"], "CASE-001")
        self.assertEqual(len(snapshot["procedures"]), 2)
        database.unlink()


if __name__ == "__main__":
    unittest.main()
