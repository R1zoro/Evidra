from dataclasses import dataclass, field


@dataclass(frozen=True)
class Operation:
    """A single analyst-intent operation before provider planning."""

    line: int
    name: str
    capability: str
    expression: str
    inputs: tuple[str, ...] = ()
    destination: str | None = None


@dataclass(frozen=True)
class Stage:
    name: str
    operations: tuple[Operation, ...] = ()


@dataclass(frozen=True)
class Procedure:
    stages: tuple[Stage, ...] = ()
    diagnostics: tuple[str, ...] = ()

    @property
    def operations(self) -> tuple[Operation, ...]:
        return tuple(operation for stage in self.stages for operation in stage.operations)
