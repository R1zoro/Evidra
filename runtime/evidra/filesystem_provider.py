from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from .results import ArtifactRecord, MetadataRecord


class FileSystemProvider:
    """Read-only provider for folders and files registered as evidence."""

    def list_artifacts(self, source: str | Path) -> list[ArtifactRecord]:
        root = Path(source).resolve()
        if not root.exists():
            raise FileNotFoundError(f"evidence source does not exist: {source}")
        paths = [root] if root.is_file() else [path for path in root.rglob("*") if path.is_file()]
        return [self._artifact(root, path) for path in sorted(paths)]

    def filter_artifacts(self, artifacts: list[ArtifactRecord], extension: str) -> list[ArtifactRecord]:
        normalized = extension.lower() if extension.startswith(".") else f".{extension.lower()}"
        return [artifact for artifact in artifacts if artifact.extension.lower() == normalized]

    def extract_metadata(self, source: str | Path, artifacts: list[ArtifactRecord]) -> list[MetadataRecord]:
        root = Path(source).resolve()
        records: list[MetadataRecord] = []
        for artifact in artifacts:
            path = root / artifact.relative_path
            stat = path.stat()
            modified = datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat()
            namespaces: dict[str, dict[str, object]] = {}
            if artifact.extension == ".zip":
                namespaces["archive"] = {"entries": None, "provider_note": "archive inspection pending"}
            if artifact.extension in {".csv", ".log"}:
                namespaces["text"] = {"line_count": path.read_text(encoding="utf-8", errors="replace").count("\n") + 1}
            records.append(MetadataRecord(
                id=f"META-{len(records) + 1:03d}",
                artifact_id=artifact.id,
                common={"name": artifact.name, "path": artifact.relative_path, "size": artifact.size_bytes, "type": artifact.extension or "file"},
                filesystem={"modified_at": modified, "read_only": True},
                namespaces=namespaces,
            ))
        return records

    def extract_events(self, artifacts: list[ArtifactRecord]) -> list[dict[str, object]]:
        return [{
            "id": f"EVT-{index:03d}",
            "artifact_id": artifact.id,
            "kind": "filesystem.modified",
            "timestamp": artifact.modified_at,
            "description": f"Observed modification timestamp for {artifact.relative_path}",
        } for index, artifact in enumerate(sorted(artifacts, key=lambda item: item.modified_at), 1)]

    @staticmethod
    def _artifact(root: Path, path: Path) -> ArtifactRecord:
        relative = path.relative_to(root).as_posix()
        digest = sha256(path.read_bytes()).hexdigest()
        modified = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
        stable_id = sha256(relative.encode("utf-8")).hexdigest()[:6].upper()
        return ArtifactRecord(
            id=f"ART-{stable_id}",
            relative_path=relative,
            name=path.name,
            extension=path.suffix.lower(),
            size_bytes=path.stat().st_size,
            modified_at=modified,
            sha256=digest,
        )
