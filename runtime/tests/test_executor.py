import unittest
from pathlib import Path

from evidra import execute_ir
from jocky import lower_to_ir, parse_procedure


FIXTURE = Path(__file__).parents[2] / "test" / "evidence" / "CASE-TEST-001"


class ExecutorTests(unittest.TestCase):
    def test_executes_files_filter_and_metadata_pipeline(self) -> None:
        source = """
        [examine]
        artifacts = files.list EVID-001
        suspicious = filter(extension == \".zip\") from artifacts
        metadata = metadata.extract suspicious
        """
        run = execute_ir(lower_to_ir(parse_procedure(source)), FIXTURE)
        self.assertEqual(run.status, "completed")
        self.assertEqual([step.status for step in run.steps], ["completed", "completed", "completed"])
        self.assertEqual(run.results[-1].type, "MetadataCollection")
        self.assertEqual(run.results[-1].value[0].common["name"], "archive.zip")

    def test_blocks_dependent_work_after_failure(self) -> None:
        source = """
        [examine]
        artifacts = files.list MISSING
        suspicious = filter(extension == \".zip\") from artifacts
        """
        run = execute_ir(lower_to_ir(parse_procedure(source)), FIXTURE)
        self.assertEqual([step.status for step in run.steps], ["failed", "blocked"])

    def test_import_and_search_support_an_evidence_pipeline(self) -> None:
        source = """
        [prepare]
        source = evidence.import "./user-selected-source"
        [examine]
        artifacts = files.list source
        images = files.search "*.png" from artifacts
        """
        run = execute_ir(lower_to_ir(parse_procedure(source)), FIXTURE)
        self.assertEqual(run.status, "completed")
        self.assertEqual([step.status for step in run.steps], ["completed", "completed", "completed"])
        self.assertEqual(run.results[-1].type, "ArtifactCollection")
        self.assertEqual(run.results[-1].value, [])

    def test_events_timeline_and_correlation_are_read_only(self) -> None:
        source = """
        [examine]
        artifacts = files.list EVID-001
        events = events.extract from artifacts
        timeline = timeline.build from events
        findings = correlate(artifacts, events, timeline)
        """
        run = execute_ir(lower_to_ir(parse_procedure(source)), FIXTURE)
        self.assertEqual(run.status, "completed")
        self.assertEqual([result.type for result in run.results], ["ArtifactCollection", "EventCollection", "Timeline", "FindingCollection"])
        self.assertGreaterEqual(len(run.results[1].value), len(run.results[0].value))
        self.assertGreaterEqual(len(run.results[3].value), 1)
        self.assertIn("severity", run.results[3].value[0])

    def test_export_writes_to_disk(self) -> None:
        import tempfile, json
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            source = """
            [examine]
            artifacts = files.list EVID-001
            suspicious = filter(extension == \".zip\") from artifacts
            [export]
            export suspicious > "./outputs/test_export.json"
            """
            run = execute_ir(lower_to_ir(parse_procedure(source)), FIXTURE, workspace_root=temp_path)
            self.assertEqual(run.status, "completed")
            self.assertEqual(run.results[-1].type, "Export")
            exported_file = temp_path / "outputs" / "test_export.json"
            self.assertTrue(exported_file.exists())
            data = json.loads(exported_file.read_text(encoding="utf-8"))
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["name"], "archive.zip")


if __name__ == "__main__":
    unittest.main()
