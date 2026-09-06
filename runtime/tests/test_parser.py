import unittest

from jocky import parse_procedure


class ParserTests(unittest.TestCase):
    def test_groups_operations_by_stage(self) -> None:
        procedure = parse_procedure("[prepare]\n  hash EVID-001\n[analysis]\n  export hash > out.json")
        self.assertEqual([stage.name for stage in procedure.stages], ["prepare", "analysis"])
        self.assertEqual([operation.capability for operation in procedure.operations], ["hash", "export"])

    def test_reports_operations_outside_stage(self) -> None:
        procedure = parse_procedure("hash EVID-001")
        self.assertEqual(len(procedure.operations), 0)
        self.assertIn("inside a named stage", procedure.diagnostics[0])

    def test_preserves_destination(self) -> None:
        procedure = parse_procedure('[export]\n  export findings > "./outputs/findings.json"')
        self.assertEqual(procedure.operations[0].destination, '"./outputs/findings.json"')


if __name__ == "__main__":
    unittest.main()
