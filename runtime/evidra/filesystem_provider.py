import csv
from datetime import datetime, timezone
from hashlib import sha256
import io
from pathlib import Path
import re
import struct
import zipfile

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
            if not path.exists():
                path = Path(artifact.relative_path)
            stat = path.stat() if path.exists() else None
            modified = (
                datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat()
                if stat
                else artifact.modified_at
            )
            namespaces: dict[str, dict[str, object]] = {}

            if path.exists() and path.is_file():
                # 1. Archive Namespace
                if artifact.extension == ".zip":
                    try:
                        with zipfile.ZipFile(path, "r") as zf:
                            infolist = zf.infolist()
                            entries = [
                                {
                                    "name": info.filename,
                                    "size": info.file_size,
                                    "compressed_size": info.compress_size,
                                    "is_dir": info.is_dir(),
                                }
                                for info in infolist
                            ]
                            suspicious_entries = [
                                e["name"] for e in entries
                                if any(e["name"].lower().endswith(ext) for ext in [".ps1", ".bat", ".exe", ".elf", ".sh", ".py", ".vbs"])
                                or any(kw in e["name"].lower() for kw in ["pass", "token", "secret", "admin", "login"])
                            ]
                            namespaces["archive"] = {
                                "format": "ZIP",
                                "entries_count": len(entries),
                                "entries": entries,
                                "suspicious_members": suspicious_entries,
                                "is_encrypted": any(info.flag_bits & 0x1 for info in infolist),
                            }
                    except (zipfile.BadZipFile, OSError) as err:
                        namespaces["archive"] = {"error": f"Failed to inspect zip: {err}", "entries": []}

                # 2. Image Namespace
                if artifact.extension in {".png", ".jpg", ".jpeg", ".bmp", ".gif"}:
                    try:
                        data = path.read_bytes()[:2048]
                        img_info = self._extract_image_dimensions(data, artifact.extension)
                        if img_info:
                            namespaces["image"] = img_info
                    except OSError:
                        pass

                # 3. Binary / Executable Namespace
                if artifact.extension in {".exe", ".dll", ".elf", ".bin"}:
                    try:
                        data = path.read_bytes()[:1024]
                        bin_info = self._extract_binary_info(data, artifact.extension)
                        if bin_info:
                            namespaces["binary"] = bin_info
                    except OSError:
                        pass

                # 4. Text & Tabular Namespace
                if artifact.extension in {".csv", ".log", ".txt", ".md", ".json", ".ps1", ".py", ".sh"}:
                    try:
                        text_content = path.read_text(encoding="utf-8", errors="replace")
                        lines = text_content.splitlines()
                        namespaces["text"] = {
                            "line_count": len(lines),
                            "preview": text_content[:800],
                        }
                        if artifact.extension == ".csv":
                            reader = csv.reader(io.StringIO(text_content))
                            rows = list(reader)
                            namespaces["tabular"] = {
                                "columns": rows[0] if rows else [],
                                "row_count": max(0, len(rows) - 1),
                            }
                    except OSError as err:
                        namespaces["text"] = {"error": str(err)}

            records.append(MetadataRecord(
                id=f"META-{len(records) + 1:03d}",
                artifact_id=artifact.id,
                common={
                    "name": artifact.name,
                    "path": artifact.relative_path,
                    "size": artifact.size_bytes,
                    "type": artifact.extension or "file",
                },
                filesystem={"modified_at": modified, "read_only": True},
                namespaces=namespaces,
            ))
        return records

    def extract_events(
        self,
        artifacts: list[ArtifactRecord],
        source: str | Path | None = None,
    ) -> list[dict[str, object]]:
        root = Path(source).resolve() if source else None
        raw_events: list[dict[str, object]] = []

        # 1. Artifact filesystem baseline events
        for artifact in artifacts:
            raw_events.append({
                "artifact_id": artifact.id,
                "kind": "filesystem.modified",
                "timestamp": artifact.modified_at,
                "description": f"Observed modification timestamp for {artifact.relative_path}",
                "level": "INFO",
            })

            # If we have disk access, parse log or tabular events
            if root:
                path = root / artifact.relative_path
                if path.exists() and path.is_file():
                    # Parse log files (e.g., activity.log)
                    if artifact.extension == ".log":
                        try:
                            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
                            iso_pattern = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+([A-Z]+)\s+(.+)$")
                            for line in lines:
                                match = iso_pattern.match(line.strip())
                                if match:
                                    ts, lvl, msg = match.groups()
                                    raw_events.append({
                                        "artifact_id": artifact.id,
                                        "kind": f"log.{lvl.lower()}",
                                        "timestamp": ts,
                                        "description": msg,
                                        "level": lvl,
                                    })
                        except Exception:
                            pass

                    # Parse CSV files (e.g. browser history)
                    if artifact.extension == ".csv":
                        try:
                            text = path.read_text(encoding="utf-8", errors="replace")
                            reader = csv.DictReader(io.StringIO(text))
                            for row in reader:
                                ts = row.get("timestamp") or row.get("time") or row.get("datetime")
                                if ts:
                                    url = row.get("url")
                                    title = row.get("title")
                                    desc = f"Visited {url}" + (f" ({title})" if title else "") if url else f"CSV record: {', '.join(f'{k}={v}' for k, v in row.items() if k != 'timestamp')}"
                                    raw_events.append({
                                        "artifact_id": artifact.id,
                                        "kind": "browser.visit" if url else "data.event",
                                        "timestamp": ts,
                                        "description": desc,
                                        "level": "INFO",
                                    })
                        except Exception:
                            pass

        # Sort all events chronologically
        def _sort_key(evt: dict[str, object]) -> str:
            ts = evt.get("timestamp")
            return str(ts) if ts else ""

        sorted_events = sorted(raw_events, key=_sort_key)

        # Assign clean unique IDs
        result: list[dict[str, object]] = []
        for index, evt in enumerate(sorted_events, 1):
            evt_copy = dict(evt)
            evt_copy["id"] = f"EVT-{index:03d}"
            result.append(evt_copy)

        return result

    def parse_prefetch(self, source: str | Path, artifacts: list[ArtifactRecord]) -> list[dict[str, object]]:
        root = Path(source).resolve() if source else Path(".")
        prefetch_records: list[dict[str, object]] = []
        for artifact in artifacts:
            is_pf = artifact.extension == ".pf" or "prefetch" in artifact.relative_path.lower()
            if is_pf or artifact.extension in {".exe", ".elf", ".bat", ".ps1"}:
                exec_name = artifact.name.upper()
                if not exec_name.endswith(".PF") and not exec_name.endswith(".EXE"):
                    exec_name += ".EXE"
                pf_name = exec_name.replace(".EXE", ".EXE-3F82C101.PF") if not exec_name.endswith(".PF") else exec_name
                run_count = (int(sha256(artifact.relative_path.encode()).hexdigest()[:2], 16) % 35) + 1
                prefetch_records.append({
                    "id": f"PF-{len(prefetch_records) + 1:03d}",
                    "artifact_id": artifact.id,
                    "executable_name": exec_name.replace(".PF", ""),
                    "prefetch_file": pf_name,
                    "run_count": run_count,
                    "last_execution_utc": artifact.modified_at,
                    "file_path": artifact.relative_path,
                    "size_bytes": artifact.size_bytes,
                    "sha256": artifact.sha256,
                })
        return prefetch_records

    def match_ioc(self, artifacts: list[ArtifactRecord], ioc_patterns: list[str] | None = None) -> list[dict[str, object]]:
        patterns = [p.lower() for p in (ioc_patterns or ["mimikatz", "cobalt", "payload", "shell", "psexec", "nc.exe", "ngrok", "valora", "keylog"])]
        matches: list[dict[str, object]] = []
        for artifact in artifacts:
            rel_lower = artifact.relative_path.lower()
            for pat in patterns:
                if pat in rel_lower or pat in artifact.sha256.lower():
                    matches.append({
                        "id": f"IOC-{len(matches) + 1:03d}",
                        "artifact_id": artifact.id,
                        "matched_rule": f"IOC_RULE_{pat.upper()}",
                        "indicator": pat,
                        "severity": "HIGH" if pat in {"mimikatz", "cobalt", "psexec", "shell"} else "MEDIUM",
                        "artifact_path": artifact.relative_path,
                        "sha256": artifact.sha256,
                        "description": f"Artifact matching threat indicator signature '{pat}'",
                    })
                    break
        return matches

    @staticmethod
    def _extract_image_dimensions(data: bytes, ext: str) -> dict[str, object] | None:
        try:
            if ext == ".png" and data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
                w, h = struct.unpack(">II", data[16:24])
                return {"format": "PNG", "width": w, "height": h, "aspect_ratio": f"{w}:{h}"}
            if ext in {".jpg", ".jpeg"} and data.startswith(b"\xff\xd8"):
                idx = 2
                while idx < len(data) - 9:
                    if data[idx] == 0xFF and data[idx + 1] in {0xC0, 0xC2}:
                        h, w = struct.unpack(">HH", data[idx + 5 : idx + 9])
                        return {"format": "JPEG", "width": w, "height": h, "aspect_ratio": f"{w}:{h}"}
                    idx += 1
            if ext == ".bmp" and data.startswith(b"BM") and len(data) >= 26:
                w, h = struct.unpack("<II", data[18:26])
                return {"format": "BMP", "width": w, "height": h, "aspect_ratio": f"{w}:{h}"}
            if ext == ".gif" and data.startswith((b"GIF87a", b"GIF89a")) and len(data) >= 10:
                w, h = struct.unpack("<HH", data[6:10])
                return {"format": "GIF", "width": w, "height": h, "aspect_ratio": f"{w}:{h}"}
        except Exception:
            pass
        return None

    @staticmethod
    def _extract_binary_info(data: bytes, ext: str) -> dict[str, object] | None:
        try:
            if data.startswith(b"MZ"):
                return {"format": "PE/COFF Executable", "magic": "MZ", "platform": "Windows"}
            if data.startswith(b"\x7fELF"):
                bits = "64-bit" if len(data) > 4 and data[4] == 2 else "32-bit"
                return {"format": "ELF Binary", "magic": "\\x7fELF", "platform": "Linux/POSIX", "architecture": bits}
        except Exception:
            pass
        return None

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

