from dataclasses import dataclass


@dataclass(frozen=True)
class ArtifactRecord:
    id: str
    relative_path: str
    name: str
    extension: str
    size_bytes: int
    modified_at: str
    sha256: str


@dataclass(frozen=True)
class MetadataRecord:
    id: str
    artifact_id: str
    common: dict[str, object]
    filesystem: dict[str, object]
    namespaces: dict[str, dict[str, object]]
