import re

from .model import Operation, Procedure, Stage


STAGE_RE = re.compile(r"^\[([A-Za-z_][A-Za-z0-9_-]*)\]$")
ASSIGN_RE = re.compile(r"^(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?P<body>.+)$")
DESTINATION_RE = re.compile(r"^(?P<body>.+?)\s*>\s*(?P<destination>.+)$")


def parse_procedure(source: str) -> Procedure:
    """Parse the deliberately small JOCKY v0.1 procedure surface.

    This parser creates syntax objects only. Capability validation and provider
    planning belong to later runtime stages.
    """
    stages: list[Stage] = []
    current_name: str | None = None
    current_operations: list[Operation] = []
    diagnostics: list[str] = []

    def close_stage() -> None:
        nonlocal current_operations
        if current_name is not None:
            stages.append(Stage(current_name, tuple(current_operations)))
        current_operations = []

    for line_number, raw_line in enumerate(source.splitlines(), 1):
        text = raw_line.strip()
        if not text or text.startswith("#"):
            continue

        stage_match = STAGE_RE.match(text)
        if stage_match:
            close_stage()
            current_name = stage_match.group(1)
            continue

        if current_name is None:
            diagnostics.append(f"line {line_number}: operation must be inside a named stage")
            continue

        assignment = ASSIGN_RE.match(text)
        if assignment:
            name = assignment.group("name")
            body = assignment.group("body")
        else:
            name = "_"
            body = text

        destination_match = DESTINATION_RE.match(body)
        if destination_match:
            destination = destination_match.group("destination").strip()
            expression = destination_match.group("body").strip()
        else:
            as_match = re.search(r'\bas\s+(?:\"([^\"]+)\"|([A-Za-z0-9_/\\.-]+))', body)
            destination = f'"{as_match.group(1) or as_match.group(2)}"' if as_match else None
            expression = body.strip()

        tokens = expression.replace("(", " ").replace(")", " ").split()
        if not tokens:
            diagnostics.append(f"line {line_number}: missing operation")
            continue

        capability = tokens[0]
        if capability == "filter":
            capability = "filter"
        inputs = tuple(token for token in tokens[1:] if token not in {"from", "as"} and not token.startswith('"'))
        current_operations.append(Operation(line_number, name, capability, expression, inputs, destination))

    close_stage()
    return Procedure(tuple(stages), tuple(diagnostics))
