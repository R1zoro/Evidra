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


def coerce_artifact(item: object) -> ArtifactRecord:
    if isinstance(item, ArtifactRecord):
        return item
    if isinstance(item, dict):
        return ArtifactRecord(
            id=str(item.get("id", "")),
            relative_path=str(item.get("relative_path", "")),
            name=str(item.get("name", "")),
            extension=str(item.get("extension", "")),
            size_bytes=int(item.get("size_bytes", 0)),
            modified_at=str(item.get("modified_at", "")),
            sha256=str(item.get("sha256", "")),
        )
    return item  # type: ignore[return-value]
