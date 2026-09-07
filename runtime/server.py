import base64
import hashlib
import json
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from evidra import CaseStore, RuntimeService

CASE_ROOT = Path(__file__).parent.parent / "test" / "evidence" / "CASE-TEST-001"
STORE_ROOT = Path(__file__).parent.parent / "test" / "runtime-case.db"
IMPORTED_ROOT = Path(__file__).parent.parent / "test" / "case-data"


class EvidraRequestHandler(BaseHTTPRequestHandler):
    service = RuntimeService(CaseStore(STORE_ROOT))
    fixture_root = CASE_ROOT

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._send_json({"status": "ok", "service": "evidra-runtime", "protocol": "v0.1"})
            return
        if parsed.path.startswith("/api/cases/") and parsed.path.endswith("/runs"):
            case_id = parsed.path.removeprefix("/api/cases/").removesuffix("/runs")
            self._send_json({"case_id": case_id, "runs": self.service.snapshot(case_id).get("runs", [])})
            return
        if parsed.path.startswith("/api/cases/") and "/fs/tree" in parsed.path:
            case_id = parsed.path.removeprefix("/api/cases/").removesuffix("/fs/tree").split("/")[0]
            self._get_fs_tree(case_id)
            return
        if parsed.path.startswith("/api/cases/") and "/fs/file" in parsed.path:
            case_id = parsed.path.removeprefix("/api/cases/").removesuffix("/fs/file").split("/")[0]
            self._get_fs_file(case_id, parsed.query)
            return
        if parsed.path.startswith("/api/cases/"):
            case_id = parsed.path.removeprefix("/api/cases/")
            self._send_json(self.service.snapshot(case_id))
            return
        self._send_json({"error": "route not found"}, 404)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        origin = self._allowed_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        body = self._read_json()
        parsed = urlparse(self.path)
        if parsed.path == "/api/cases":
            self._create_case(body)
            return
        if parsed.path.startswith("/api/cases/") and "/fs/file" in parsed.path:
            case_id = parsed.path.removeprefix("/api/cases/").removesuffix("/fs/file").split("/")[0]
            self._post_fs_file(case_id, body)
            return
        if parsed.path.startswith("/api/cases/") and "/fs/folder" in parsed.path:
            case_id = parsed.path.removeprefix("/api/cases/").removesuffix("/fs/folder").split("/")[0]
            self._post_fs_folder(case_id, body)
            return
        if parsed.path.startswith("/api/cases/") and "/fs/rename" in parsed.path:
            case_id = parsed.path.removeprefix("/api/cases/").removesuffix("/fs/rename").split("/")[0]
            self._post_fs_rename(case_id, body)
            return
        if parsed.path.startswith("/api/cases/") and "/fs/delete" in parsed.path:
            case_id = parsed.path.removeprefix("/api/cases/").removesuffix("/fs/delete").split("/")[0]
            self._post_fs_delete(case_id, body)
            return
        if parsed.path.startswith("/api/cases/") and parsed.path.endswith("/sources"):
            case_id = parsed.path.removeprefix("/api/cases/").removesuffix("/sources")
            self._register_source(case_id, body)
            return
        if parsed.path.startswith("/api/cases/") and "/sources/" in parsed.path and parsed.path.endswith("/materialize"):
            prefix, source_id = parsed.path.removeprefix("/api/cases/").split("/sources/", 1)
            self._materialize_source(prefix, source_id.removesuffix("/materialize"), body)
            return
        if parsed.path.startswith("/api/cases/") and parsed.path.endswith("/evidence"):
            case_id = parsed.path.removeprefix("/api/cases/").removesuffix("/evidence")
            self._import_evidence(case_id, body)
            return
        if parsed.path == "/api/validate":
            self._send_json(self.service.validate(str(body.get("source", ""))))
            return
        if parsed.path == "/api/execute":
            evidence_root = body.get("evidence_root") or str(self.fixture_root)
            self._send_json(self.service.execute(str(body.get("source", "")), evidence_root, str(body.get("case_id", "CASE-001"))))
            return
        self._send_json({"error": "route not found"}, 404)

    def _create_case(self, body: dict[str, Any]) -> None:
        case_id = str(body.get("id") or f"CASE-{uuid4().hex[:8].upper()}")
        name = str(body.get("name") or case_id)
        root = Path(str(body.get("root") or (IMPORTED_ROOT / case_id))).resolve()
        folders = body.get("folders") if isinstance(body.get("folders"), list) else []
        try:
            root.mkdir(parents=True, exist_ok=True)
            internal = root / ".evidra"
            internal.mkdir(exist_ok=True)
            manifest_file = internal / "manifest.json"
            if manifest_file.exists():
                try:
                    meta = json.loads(manifest_file.read_text(encoding="utf-8"))
                    if isinstance(meta, dict) and meta.get("case_id"):
                        case_id = meta["case_id"]
                        if meta.get("name"):
                            name = meta["name"]
                except Exception:
                    pass
            else:
                manifest_file.write_text(json.dumps({"case_id": case_id, "name": name}, indent=2), encoding="utf-8")

            for folder in folders:
                (root / str(folder)).mkdir(parents=True, exist_ok=True)

            template_file = root / "template.jocky"
            if not template_file.exists() and not list(root.glob("*.jocky")):
                template_file.write_text(
                    "# JOCKY Forensic Investigation Procedure\n\n"
                    "[prepare]\n"
                    '    source = evidence.import "C:\\\\Users\\\\XYLA\\\\Downloads\\\\Valora"\n'
                    '    working = copy source as "working_evidence"\n\n'
                    "[examine]\n"
                    "    artifacts = files.list working\n"
                    '    suspicious = filter(extension == ".zip" | ".elf" | ".exe" | ".png") from artifacts\n'
                    "    metadata = metadata.extract suspicious\n"
                    "    prefetch = prefetch.extract artifacts\n"
                    "    iocs = ioc.match artifacts\n\n"
                    "[analysis]\n"
                    "    events = events.extract from artifacts\n"
                    "    timeline = timeline.build from events\n"
                    "    findings = correlate(suspicious, metadata, events, prefetch, iocs)\n\n"
                    "[export]\n"
                    '    export findings > "./Outputs/findings.json"\n',
                    encoding="utf-8",
                )
        except OSError as error:
            self._send_json({"error": f"case creation failed: {error}"}, 400)
            return
        self.service.store.register_case(case_id, name)
        self.service.store.set_workspace(case_id, str(root))
        self._send_json(self.service.snapshot(case_id), 201)

    def _register_source(self, case_id: str, body: dict[str, Any]) -> None:
        source_path = str(body.get("path") or "")
        if not source_path:
            self._send_json({"error": "source path is required"}, 400)
            return
        path = Path(source_path).resolve()
        if not path.exists():
            self._send_json({"error": "source path does not exist"}, 404)
            return
        fingerprint = hashlib.sha256(f"{path}|{path.stat().st_mtime_ns}|{path.stat().st_size if path.is_file() else 'directory'}".encode()).hexdigest()
        source = self.service.store.register_source(case_id, str(body.get("name") or path.name), str(path), fingerprint)
        self._send_json({"source": source, "snapshot": self.service.snapshot(case_id)}, 200 if source["existing"] else 201)

    def _materialize_source(self, case_id: str, source_id: str, body: dict[str, Any]) -> None:
        source = self.service.store.get_source(case_id, source_id)
        root = self.service.store.get_workspace(case_id)
        if not source or not root:
            self._send_json({"error": "source or case workspace not found"}, 404)
            return
        source_path = Path(source["source_path"])
        destination = str(body.get("destination") or f"Evidence/{source['name']}").replace("\\", "/").strip("/")
        if not destination or ".." in Path(destination).parts:
            self._send_json({"error": "destination must be a relative case path"}, 400)
            return
        evidence_name = Path(destination).name
        target = (Path(root) / destination).resolve()
        if Path(root).resolve() not in target.parents:
            self._send_json({"error": "destination escapes case workspace"}, 400)
            return
        if target.exists():
            self._send_json({"error": "evidence destination already exists", "existing": True}, 409)
            return
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            if source_path.is_dir():
                shutil.copytree(source_path, target)
                count = sum(1 for item in target.rglob("*") if item.is_file())
            else:
                shutil.copy2(source_path, target)
                count = 1
        except OSError as error:
            self._send_json({"error": f"materialization failed: {error}"}, 400)
            return
        evidence_id = self.service.store.next_evidence_id()
        self.service.store.register_evidence(case_id, evidence_id, evidence_name, str(target), count)
        self._send_json({"evidence": next(item for item in self.service.snapshot(case_id)["evidence"] if item["id"] == evidence_id), "snapshot": self.service.snapshot(case_id)}, 201)

    def _import_evidence(self, case_id: str, body: dict[str, Any]) -> None:
        files = body.get("files")
        name = str(body.get("name") or "Imported evidence")
        if not isinstance(files, list) or not files:
            self._send_json({"error": "at least one file is required"}, 400)
            return
        evidence_id = f"EVID-{uuid4().hex[:8].upper()}"
        root = (IMPORTED_ROOT / case_id / evidence_id).resolve()
        root.mkdir(parents=True, exist_ok=True)
        written = 0
        try:
            for item in files:
                if not isinstance(item, dict):
                    raise ValueError("invalid file entry")
                relative = Path(str(item.get("path") or "")).as_posix().lstrip("/")
                target = (root / relative).resolve()
                if not relative or root not in target.parents:
                    raise ValueError("invalid relative file path")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(base64.b64decode(str(item.get("content") or ""), validate=True))
                written += 1
        except (ValueError, OSError, base64.binascii.Error) as error:
            self._send_json({"error": f"evidence import failed: {error}"}, 400)
            return
        self.service.store.register_evidence(case_id, evidence_id, name, str(root), written)
        evidence = next(item for item in self.service.snapshot(case_id)["evidence"] if item["id"] == evidence_id)
        self._send_json({"evidence": evidence, "snapshot": self.service.snapshot(case_id)}, 201)

    def _get_workspace_path(self, case_id: str) -> Path | None:
        workspace = self.service.store.get_workspace(case_id)
        if not workspace:
            return None
        root = Path(workspace).resolve()
        return root if root.exists() else None

    def _inside_workspace(self, root: Path, relative: str) -> Path:
        rel = relative.replace("\\", "/").strip("/")
        target = (root / rel).resolve() if rel else root
        if target != root and root not in target.parents:
            raise ValueError("Path escapes case workspace")
        return target

    def _build_tree(self, root: Path, current: Path) -> list[dict[str, Any]]:
        nodes: list[dict[str, Any]] = []
        try:
            entries = sorted(current.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
            for entry in entries:
                if entry.name == ".evidra" or entry.name.startswith("."):
                    continue
                rel = entry.relative_to(root).as_posix()
                if entry.is_dir():
                    nodes.append({
                        "name": entry.name,
                        "path": rel,
                        "kind": "directory",
                        "children": self._build_tree(root, entry),
                    })
                else:
                    nodes.append({
                        "name": entry.name,
                        "path": rel,
                        "kind": "file",
                    })
        except OSError:
            pass
        return nodes

    def _get_fs_tree(self, case_id: str) -> None:
        root = self._get_workspace_path(case_id)
        if not root:
            self._send_json({"tree": []})
            return
        tree = self._build_tree(root, root)
        self._send_json({"tree": tree})

    def _get_fs_file(self, case_id: str, query: str) -> None:
        root = self._get_workspace_path(case_id)
        if not root:
            self._send_json({"error": "workspace not found"}, 404)
            return
        params = parse_qs(query)
        rel_path = params.get("path", [""])[0]
        try:
            target = self._inside_workspace(root, rel_path)
            if not target.is_file():
                self._send_json({"error": "file not found"}, 404)
                return
            content = target.read_text(encoding="utf-8", errors="replace")
            self._send_json({"path": rel_path, "content": content})
        except (ValueError, OSError) as error:
            self._send_json({"error": str(error)}, 400)

    def _post_fs_file(self, case_id: str, body: dict[str, Any]) -> None:
        root = self._get_workspace_path(case_id)
        if not root:
            self._send_json({"error": "workspace not found"}, 404)
            return
        rel_path = str(body.get("path") or "").strip()
        content = str(body.get("content", ""))
        try:
            target = self._inside_workspace(root, rel_path)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            self._send_json({"path": rel_path, "status": "ok"}, 200)
        except (ValueError, OSError) as error:
            self._send_json({"error": str(error)}, 400)

    def _post_fs_folder(self, case_id: str, body: dict[str, Any]) -> None:
        root = self._get_workspace_path(case_id)
        if not root:
            self._send_json({"error": "workspace not found"}, 404)
            return
        rel_path = str(body.get("path") or "").strip()
        try:
            target = self._inside_workspace(root, rel_path)
            target.mkdir(parents=True, exist_ok=True)
            self._send_json({"path": rel_path, "status": "ok"}, 200)
        except (ValueError, OSError) as error:
            self._send_json({"error": str(error)}, 400)

    def _post_fs_rename(self, case_id: str, body: dict[str, Any]) -> None:
        root = self._get_workspace_path(case_id)
        if not root:
            self._send_json({"error": "workspace not found"}, 404)
            return
        from_rel = str(body.get("from") or "").strip()
        to_rel = str(body.get("to") or "").strip()
        try:
            src = self._inside_workspace(root, from_rel)
            dst = self._inside_workspace(root, to_rel)
            if not src.exists():
                self._send_json({"error": "source not found"}, 404)
                return
            dst.parent.mkdir(parents=True, exist_ok=True)
            src.rename(dst)
            self._send_json({"from": from_rel, "to": to_rel, "status": "ok"}, 200)
        except (ValueError, OSError) as error:
            self._send_json({"error": str(error)}, 400)

    def _post_fs_delete(self, case_id: str, body: dict[str, Any]) -> None:
        root = self._get_workspace_path(case_id)
        if not root:
            self._send_json({"error": "workspace not found"}, 404)
            return
        rel_path = str(body.get("path") or "").strip()
        try:
            target = self._inside_workspace(root, rel_path)
            if target == root:
                raise ValueError("cannot delete case root directory")
            if not target.exists():
                self._send_json({"error": "target not found"}, 404)
                return
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
            self._send_json({"path": rel_path, "status": "ok"}, 200)
        except (ValueError, OSError) as error:
            self._send_json({"error": str(error)}, 400)

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _read_json(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            return payload if isinstance(payload, dict) else {}
        except (ValueError, json.JSONDecodeError):
            return {}

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        origin = self._allowed_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(encoded)

    def _allowed_origin(self) -> str | None:
        origin = self.headers.get("Origin", "")
        parsed = urlparse(origin)
        if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}:
            return origin
        return None


def create_server(host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), EvidraRequestHandler)


if __name__ == "__main__":
    server = create_server()
    print("Evidra runtime listening on http://127.0.0.1:8765")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
