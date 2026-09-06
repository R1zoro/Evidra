import unittest

from jocky import lower_to_ir, parse_procedure


class IRTests(unittest.TestCase):
    def test_lowers_dependencies_from_result_references(self) -> None:
        source = """
        [prepare]
        working = copy EVID-001
        [examine]
        artifacts = files.list working
        suspicious = filter(extension == \".zip\") from artifacts
        [analysis]
        findings = correlate(suspicious, artifacts)
        """
        ir = lower_to_ir(parse_procedure(source))
        self.assertEqual([op.id for op in ir.operations], ["OP-001", "OP-002", "OP-003", "OP-004"])
        self.assertEqual(ir.operations[1].dependencies, ("OP-001",))
        self.assertEqual(ir.operations[2].dependencies, ("OP-002",))
        self.assertEqual(ir.operations[3].dependencies, ("OP-003", "OP-002"))

    def test_ir_ids_are_deterministic(self) -> None:
        source = "[export]\n  export findings > output.json"
        first = lower_to_ir(parse_procedure(source))
        second = lower_to_ir(parse_procedure(source))
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
