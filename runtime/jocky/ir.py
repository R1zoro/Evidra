import re
from dataclasses import dataclass

from .model import Operation, Procedure


@dataclass(frozen=True)
class IROperation:
    id: str
    stage: str
    capability: str
    output: str | None
    inputs: tuple[str, ...]
    destination: str | None
    expression: str
    dependencies: tuple[str, ...]
    line_number: int


@dataclass(frozen=True)
class InvestigationIR:
    version: str
    operations: tuple[IROperation, ...]
    diagnostics: tuple[str, ...] = ()


def lower_to_ir(procedure: Procedure) -> InvestigationIR:
    """Lower syntax objects into deterministic, provider-neutral operations."""
    operations: list[IROperation] = []
    diagnostics = list(procedure.diagnostics)
    produced_by: dict[str, str] = {}

    for index, (stage, operation) in enumerate(
        ((stage, operation) for stage in procedure.stages for operation in stage.operations), 1
    ):
        operation_id = f"OP-{index:03d}"
        inputs = _meaningful_inputs(operation)
        dependencies = tuple(produced_by[value] for value in inputs if value in produced_by)
        if operation.name != "_":
            if operation.name in produced_by:
                diagnostics.append(f"line {operation.line}: duplicate result binding '{operation.name}'")
            produced_by[operation.name] = operation_id
        operations.append(
            IROperation(
                id=operation_id,
                stage=stage.name,
                capability=operation.capability,
                output=None if operation.name == "_" else operation.name,
                inputs=inputs,
                destination=operation.destination,
                expression=operation.expression,
                dependencies=dependencies,
                line_number=operation.line,
            )
        )
    return InvestigationIR("0.1", tuple(operations), tuple(diagnostics))


def _meaningful_inputs(operation: Operation) -> tuple[str, ...]:
    expression = operation.expression
    if operation.capability == "correlate":
        if "(" in expression and ")" in expression:
            body = expression[expression.find("(") + 1 : expression.rfind(")")]
            return tuple(token.strip().strip('"').strip("'") for token in body.split(",") if token.strip())
        return tuple(tok.rstrip(",") for tok in operation.inputs if tok not in {"correlate"})
    if operation.capability in {"events.merge", "merge"}:
        if "(" in expression and ")" in expression:
            body = expression[expression.find("(") + 1 : expression.rfind(")")]
            return tuple(token.strip().strip('"').strip("'") for token in body.split(",") if token.strip())
        return tuple(tok.rstrip(",") for tok in operation.inputs if tok not in {"events.merge", "merge"})
    if operation.capability == "filter":
        match = re.search(r"\bfrom\s+([A-Za-z0-9_/\\.-]+)", expression)
        if match:
            return (match.group(1),)
        for inp in operation.inputs:
            clean = inp.rstrip(",")
            if clean and not clean.startswith(".") and not clean.startswith('"') and clean != "filter":
                return (clean,)
        return ()
    if operation.capability in {"copy", "evidence.materialize"}:
        copy_match = re.search(r'(?:copy|evidence\.materialize)\s+(?:\"([^\"]+)\"|([A-Za-z0-9_/\\.-]+))', expression)
        if copy_match:
            return (copy_match.group(1) or copy_match.group(2),)
    if " from " in f" {expression} ":
        return (expression.split(" from ", 1)[1].strip().split()[0].rstrip(","),)
    if operation.inputs:
        return tuple(tok.rstrip(",") for tok in operation.inputs if tok not in {"from", "as", "with", "into", "to"} and not tok.startswith('"') and not tok.startswith("'"))
    tokens = expression.replace("(", " ").replace(")", " ").replace(",", " ").split()
    return (tokens[1].rstrip(","),) if len(tokens) > 1 and tokens[1] not in {"=", "as"} else ()
