import unittest
from pathlib import Path

from evidra import FileSystemProvider


FIXTURE = Path(__file__).parents[2] / "test" / "evidence" / "CASE-TEST-001"


class FileSystemProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.provider = FileSystemProvider()
        self.artifacts = self.provider.list_artifacts(FIXTURE)

    def test_lists_and_hashes_fixture_artifacts(self) -> None:
        self.assertEqual(len(self.artifacts), 6)
        self.assertTrue(all(len(artifact.sha256) == 64 for artifact in self.artifacts))
        self.assertIn("files/archive.zip", [artifact.relative_path for artifact in self.artifacts])

    def test_filters_by_extension(self) -> None:
        matches = self.provider.filter_artifacts(self.artifacts, ".zip")
        self.assertEqual([artifact.name for artifact in matches], ["archive.zip"])

    def test_extracts_namespaced_metadata(self) -> None:
        matches = self.provider.filter_artifacts(self.artifacts, "zip")
        metadata = self.provider.extract_metadata(FIXTURE, matches)
        self.assertEqual(metadata[0].common["name"], "archive.zip")
        self.assertIn("archive", metadata[0].namespaces)
        self.assertTrue(metadata[0].filesystem["read_only"])


if __name__ == "__main__":
    unittest.main()
