import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { LocalRuntimeClient, type CaseSnapshot, type RuntimeExecutionResponse } from "./api/runtimeClient";

export type FsNode = { name: string; path: string; kind: "file" | "directory"; children?: FsNode[] };
export type View = "JOCKY" | "WORKBENCH" | "GRAPH" | "BLOCKS" | "DOCS" | "HELP";
export type SideView = "EXPLORER" | "SOURCES" | "EVIDENCE" | "PROCEDURES" | "RUNS" | "FINDINGS";
export type Menu = "File" | "Edit" | "View" | "Run" | "Help" | "More" | null;

export type DocumentType = "jocky" | "json" | "csv" | "text";
export type OpenDoc = {
  path: string;
  name: string;
  content: string;
  type: DocumentType;
  isDirty?: boolean;
};

export type Finding = {
  id: string;
  title: string;
  detail: string;
  source: string;
  operationId?: string;
  timestamp: string;
  type: string;
};

export type FileDialog =
  | { type: "new-file"; targetDir: string }
  | { type: "new-folder"; targetDir: string }
  | { type: "rename"; targetPath: string; currentName: string; isDir: boolean }
  | { type: "delete"; targetPath: string; isDir: boolean }
  | null;

export type ContextMenu = {
  x: number;
  y: number;
  node: FsNode;
} | null;

declare global {
  interface Window {
    evidraDesktop?: {
      chooseDirectory: () => Promise<string | null>;
      chooseSource: () => Promise<string | null>;
      tree: (root: string) => Promise<FsNode[]>;
      readFile: (root: string, relative: string) => Promise<string>;
      writeFile: (root: string, relative: string, content: string) => Promise<string>;
      createFolder: (root: string, relative: string) => Promise<string>;
      rename: (root: string, from: string, to: string) => Promise<string>;
      delete: (root: string, relative: string) => Promise<boolean>;
      windowControl: (action: "minimize" | "maximize" | "close") => void;
    };
  }
}

const blankSource = `# JOCKY investigation procedure
# Express high-level investigative intent; Evidra executes through approved providers.

[prepare]
    working = copy EVID-001 as "working_evidence"
    hash working

[examine]
    artifacts = files.list working
    suspicious = filter(extension == ".zip" | ".elf" | ".exe") from artifacts
    metadata = metadata.extract suspicious

[analysis]
    events = events.extract from artifacts
    findings = correlate(suspicious, metadata, events)

[export]
    export findings > "./Outputs/findings.json"
`;

function getFileType(fileName: string): DocumentType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jocky")) return "jocky";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv")) return "csv";
  return "text";
}

function Icon({ name }: { name: string }) {
  const glyphs: Record<string, string> = {
    explorer: "▣",
    source: "⌁",
    evidence: "◇",
    procedure: "</>",
    runs: "◷",
    findings: "✦",
    graph: "⌘",
    blocks: "▦",
    settings: "⚙",
    folder: "📁",
    folderOpen: "📂",
    file: "📄",
    jockyFile: "⚡",
    jsonFile: "{}",
    csvFile: "≡",
    textFile: "¶",
    play: "▶",
    plus: "+",
    newFile: "📄+",
    newFolder: "📁+",
    refresh: "↻",
    collapse: "⇱",
    close: "×",
    edit: "✎",
    trash: "🗑",
    check: "✓",
    save: "💾",
    bookmark: "✦",
    arrowDown: "↓",
  };
  return <span className={`icon icon-${name}`} aria-hidden="true">{glyphs[name] ?? "•"}</span>;
}

function getFileIcon(name: string, kind: "file" | "directory", expanded?: boolean) {
  if (kind === "directory") return expanded ? "folderOpen" : "folder";
  const type = getFileType(name);
  if (type === "jocky") return "jockyFile";
  if (type === "json") return "jsonFile";
  if (type === "csv") return "csvFile";
  return "textFile";
}

function encodeFile(buffer: ArrayBuffer) {
  let output = "";
  for (const byte of new Uint8Array(buffer)) output += String.fromCharCode(byte);
  return window.btoa(output);
}

function isDesktop() {
  return Boolean(window.evidraDesktop);
}

export default function App() {
  const [opened, setOpened] = useState(Boolean(sessionStorage.getItem("evidra.caseId")));
  return opened ? <Workspace /> : <CaseGate onOpen={() => setOpened(true)} />;
}

function CaseGate({ onOpen }: { onOpen: () => void }) {
  const browserFolder = useRef<HTMLInputElement>(null);
  const [recommended, setRecommended] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    browserFolder.current?.setAttribute("webkitdirectory", "");
  }, []);

  const create = async (root: string, fallbackName: string) => {
    const name = root.split(/[\\/]/).filter(Boolean).pop() || fallbackName;
    const id = `CASE-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 12)}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    try {
      const snapshot = await new LocalRuntimeClient().createCase({
        id,
        name,
        root,
        folders: recommended ? ["Evidence", "Analysis", "Outputs"] : [],
      });
      const persistentId = snapshot.case?.id ?? id;
      const persistentName = snapshot.case?.name ?? name;
      sessionStorage.setItem("evidra.caseId", persistentId);
      sessionStorage.setItem("evidra.caseName", persistentName);
      sessionStorage.setItem("evidra.caseRoot", root);
      onOpen();
    } catch (error) {
      setMessage(`Could not create the case: ${error instanceof Error ? error.message : "local runtime unavailable"}`);
    }
  };

  const chooseFolder = async () => {
    if (window.evidraDesktop) {
      const root = await window.evidraDesktop.chooseDirectory();
      if (root) await create(root, "New Case");
      return;
    }
    setMessage("Browser session initialized with local runtime workspace.");
    await create("", "Browser Case");
  };

  const browserChoice = (event: ChangeEvent<HTMLInputElement>) => {
    const first = event.target.files?.[0];
    if (first) void create("", first.webkitRelativePath.split("/")[0] || "Browser Case");
  };

  return (
    <main className="case-gate">
      <section className="case-gate-card">
        <div className="gate-logo">E</div>
        <div className="eyebrow">LOCAL FORENSIC WORKSPACE</div>
        <h1>Start an Evidra Case</h1>
        <p>Pick or initialize the case workspace folder. Evidra keeps metadata in a managed <code>.evidra</code> store and provides an investigator-oriented filesystem environment.</p>
        <label className="setup-option">
          <input type="checkbox" checked={recommended} onChange={(event) => setRecommended(event.target.checked)} />
          Initialize standard <code>Evidence/</code>, <code>Analysis/</code>, and <code>Outputs/</code> directories
        </label>
        <input ref={browserFolder} className="hidden-file-input" type="file" multiple onChange={browserChoice} />
        <button className="gate-primary" onClick={() => void chooseFolder()}>
          <Icon name="folder" /> Select / Initialize Case Folder
        </button>
        <button className="gate-secondary" onClick={() => void create("", "Default Case")}>
          Open Default Investigation Workspace
        </button>
        {message && <p className="gate-message">{message}</p>}
      </section>
    </main>
  );
}

function Workspace() {
  const caseId = sessionStorage.getItem("evidra.caseId") ?? "CASE-NEW";
  const caseName = sessionStorage.getItem("evidra.caseName") ?? "Untitled investigation";
  const caseRoot = sessionStorage.getItem("evidra.caseRoot") ?? "";
  const client = new LocalRuntimeClient();
  const sourceInput = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<View>("JOCKY");
  const [sideView, setSideView] = useState<SideView>("EXPLORER");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [menu, setMenu] = useState<Menu>(null);
  const [snapshot, setSnapshot] = useState<CaseSnapshot | null>(null);
  const [tree, setTree] = useState<FsNode[]>([]);
  const [openDocs, setOpenDocs] = useState<OpenDoc[]>([]);
  const [activeDocPath, setActiveDocPath] = useState<string | null>(null);
  const [response, setResponse] = useState<RuntimeExecutionResponse | null>(null);
  const [runHistory, setRunHistory] = useState<{ scriptName: string; docPath: string; response: RuntimeExecutionResponse }[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<FileDialog>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [collapseKey, setCollapseKey] = useState(0);

  useEffect(() => {
    if (!isResizing) return;
    document.body.classList.add("resizing-active");
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(e.clientX - 58, 170), 650);
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.classList.remove("resizing-active");
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.classList.remove("resizing-active");
    };
  }, [isResizing]);

  const handleSideSelect = (id: SideView) => {
    if (sideView === id) {
      setSidebarOpen((prev) => !prev);
    } else {
      setSideView(id);
      setSidebarOpen(true);
    }
  };

  const activeDoc = openDocs.find((doc) => doc.path === activeDocPath);
  const evidence = snapshot?.evidence?.[0];

  // Unified File System Provider
  const caseFs = {
    async tree(): Promise<FsNode[]> {
      if (window.evidraDesktop && caseRoot) {
        return window.evidraDesktop.tree(caseRoot);
      }
      return client.getTree(caseId);
    },
    async readFile(relPath: string): Promise<string> {
      if (window.evidraDesktop && caseRoot) {
        return window.evidraDesktop.readFile(caseRoot, relPath);
      }
      return client.readFile(caseId, relPath);
    },
    async writeFile(relPath: string, content: string): Promise<string> {
      if (window.evidraDesktop && caseRoot) {
        return window.evidraDesktop.writeFile(caseRoot, relPath, content);
      }
      return client.writeFile(caseId, relPath, content);
    },
    async createFolder(relPath: string): Promise<string> {
      if (window.evidraDesktop && caseRoot) {
        return window.evidraDesktop.createFolder(caseRoot, relPath);
      }
      return client.createFolder(caseId, relPath);
    },
    async rename(fromPath: string, toPath: string): Promise<string> {
      if (window.evidraDesktop && caseRoot) {
        return window.evidraDesktop.rename(caseRoot, fromPath, toPath);
      }
      return client.rename(caseId, fromPath, toPath);
    },
    async delete(relPath: string): Promise<boolean> {
      if (window.evidraDesktop && caseRoot) {
        return window.evidraDesktop.delete(caseRoot, relPath);
      }
      return client.delete(caseId, relPath);
    },
  };

  const refreshTree = async () => {
    try {
      const nodes = await caseFs.tree();
      setTree(nodes);
    } catch {
      setNotice("The case folder tree could not be read.");
    }
  };

  const refresh = async () => {
    try {
      setSnapshot(await client.getSnapshot(caseId));
    } catch {
      setNotice("Local runtime is offline. Start python runtime/server.py before using case or JOCKY actions.");
    }
    await refreshTree();
  };

  useEffect(() => {
    void refresh();
    const defaultPath = "investigation.jocky";
    void caseFs.readFile(defaultPath).then(
      async (content) => {
        if (!content) {
          await caseFs.writeFile(defaultPath, blankSource).catch(() => {});
          setOpenDocs([{ path: defaultPath, name: defaultPath, content: blankSource, type: "jocky" }]);
        } else {
          setOpenDocs([{ path: defaultPath, name: defaultPath, content, type: "jocky" }]);
        }
        setActiveDocPath(defaultPath);
      },
      async () => {
        await caseFs.writeFile(defaultPath, blankSource).catch(() => {});
        setOpenDocs([{ path: defaultPath, name: defaultPath, content: blankSource, type: "jocky" }]);
        setActiveDocPath(defaultPath);
      }
    );
  }, []);

  useEffect(() => {
    sourceInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  const openFileByNode = async (node: FsNode) => {
    if (node.kind === "directory") return;
    const existing = openDocs.find((d) => d.path === node.path);
    if (existing) {
      setActiveDocPath(node.path);
      setView("JOCKY");
      return;
    }
    try {
      const content = await caseFs.readFile(node.path);
      const newDoc: OpenDoc = {
        path: node.path,
        name: node.name,
        content: content ?? "",
        type: getFileType(node.name),
      };
      setOpenDocs((docs) => [...docs, newDoc]);
      setActiveDocPath(node.path);
      setView("JOCKY");
    } catch (err) {
      setNotice(`Could not open ${node.name}: ${err instanceof Error ? err.message : "read error"}`);
    }
  };

  const closeDoc = (path: string) => {
    const remaining = openDocs.filter((doc) => doc.path !== path);
    setOpenDocs(remaining);
    if (activeDocPath === path) {
      setActiveDocPath(remaining.length ? remaining[remaining.length - 1].path : null);
    }
  };

  const updateActiveContent = (newContent: string) => {
    if (!activeDocPath) return;
    setOpenDocs((docs) =>
      docs.map((doc) =>
        doc.path === activeDocPath ? { ...doc, content: newContent, isDirty: true } : doc
      )
    );
  };

  const saveActiveDoc = async () => {
    if (!activeDoc) return;
    try {
      await caseFs.writeFile(activeDoc.path, activeDoc.content);
      setOpenDocs((docs) =>
        docs.map((doc) => (doc.path === activeDoc.path ? { ...doc, isDirty: false } : doc))
      );
      setNotice(`Saved ${activeDoc.name}`);
      await refreshTree();
    } catch (err) {
      setNotice(`Save failed: ${err instanceof Error ? err.message : "write error"}`);
    }
  };

  const handleDialogSubmit = async (inputValue: string) => {
    if (!dialog) return;
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setDialog(null);
      return;
    }

    try {
      if (dialog.type === "new-file") {
        const fullRel = dialog.targetDir ? `${dialog.targetDir}/${trimmed}` : trimmed;
        const initialContent = trimmed.endsWith(".jocky") ? blankSource : "";
        await caseFs.writeFile(fullRel, initialContent);
        await refreshTree();
        const newDoc: OpenDoc = {
          path: fullRel,
          name: trimmed,
          content: initialContent,
          type: getFileType(trimmed),
        };
        setOpenDocs((docs) => [...docs.filter((d) => d.path !== fullRel), newDoc]);
        setActiveDocPath(fullRel);
        setView("JOCKY");
        setNotice(`Created file: ${fullRel}`);
      } else if (dialog.type === "new-folder") {
        const fullRel = dialog.targetDir ? `${dialog.targetDir}/${trimmed}` : trimmed;
        await caseFs.createFolder(fullRel);
        await refreshTree();
        setNotice(`Created folder: ${fullRel}`);
      } else if (dialog.type === "rename") {
        const parts = dialog.targetPath.split("/");
        parts.pop();
        const newRel = parts.length ? `${parts.join("/")}/${trimmed}` : trimmed;
        await caseFs.rename(dialog.targetPath, newRel);
        await refreshTree();
        setOpenDocs((docs) =>
          docs.map((d) =>
            d.path === dialog.targetPath ? { ...d, path: newRel, name: trimmed } : d
          )
        );
        if (activeDocPath === dialog.targetPath) setActiveDocPath(newRel);
        setNotice(`Renamed to ${newRel}`);
      } else if (dialog.type === "delete") {
        await caseFs.delete(dialog.targetPath);
        await refreshTree();
        setOpenDocs((docs) => docs.filter((d) => !d.path.startsWith(dialog.targetPath)));
        if (activeDocPath && activeDocPath.startsWith(dialog.targetPath)) {
          setActiveDocPath(null);
        }
        setNotice(`Deleted ${dialog.targetPath}`);
      }
    } catch (err) {
      setNotice(`Operation failed: ${err instanceof Error ? err.message : "error"}`);
    } finally {
      setDialog(null);
    }
  };

  const addSource = async () => {
    setMenu(null);
    if (window.evidraDesktop) {
      const sourcePath = await window.evidraDesktop.chooseSource();
      if (!sourcePath) return;
      const suggestedName = sourcePath.split(/[\\/]/).filter(Boolean).pop() || "Source";
      const name = window.prompt("Source name used in Evidra and JOCKY", suggestedName);
      if (!name?.trim()) return;
      try {
        const result = await client.registerSource(caseId, sourcePath, name.trim());
        setSnapshot(result.snapshot);
        setSideView("SOURCES");
        setNotice(result.source.existing ? "Source was already registered." : `Registered source: Sources/${result.source.name}`);
        await refreshTree();
        await refresh();
      } catch (error) {
        setNotice(`Could not register source: ${error instanceof Error ? error.message : "runtime unavailable"}`);
      }
      return;
    }
    setNotice("Select folder to add browser-accessible evidence.");
    sourceInput.current?.click();
  };

  const browserSource = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    try {
      const payload = await Promise.all(
        files.map(async (file) => ({
          path: file.webkitRelativePath || file.name,
          content: encodeFile(await file.arrayBuffer()),
        }))
      );
      const result = await client.importEvidence(caseId, files[0].webkitRelativePath.split("/")[0] || "Browser evidence", payload);
      setSnapshot(result.snapshot);
      setSideView("EVIDENCE");
      setNotice("Browser files imported into case evidence.");
      await refreshTree();
      await refresh();
    } catch (error) {
      setNotice(`Could not add evidence: ${error instanceof Error ? error.message : "runtime unavailable"}`);
    }
  };

  const materialize = async (sourceId: string, sourceName: string) => {
    const destination = window.prompt("Case-relative evidence destination", `Evidence/${sourceName}`);
    if (!destination?.trim()) return;
    try {
      const result = await client.materializeSource(caseId, sourceId, destination.trim());
      setSnapshot(result.snapshot);
      setSideView("EVIDENCE");
      setNotice(`Materialized to ${destination} as ${result.evidence.id}.`);
      await refresh();
    } catch (error) {
      setNotice(`Could not materialize source: ${error instanceof Error ? error.message : "unexpected error"}`);
    }
  };

  const run = async (source: string) => {
    try {
      const result = await client.execute(source, evidence?.root, caseId);
      setResponse(result);
      const scriptName = activeDocPath ? activeDocPath.split(/[/\\]/).pop() ?? "script.jocky" : "script.jocky";
      const docPath = activeDocPath ?? "";
      setRunHistory((prev) => {
        // Replace existing entry for the same file, or append new entry
        const existing = prev.findIndex((r) => r.docPath === docPath);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = { scriptName, docPath, response: result };
          return next;
        }
        return [...prev, { scriptName, docPath, response: result }];
      });
      setSideView("RUNS");
      await refreshTree();
      await refresh();
      return result;
    } catch (error) {
      setNotice(`JOCKY execution failed: ${error instanceof Error ? error.message : "runtime unavailable"}`);
      throw error;
    }
  };

  const addFinding = (result: RuntimeExecutionResponse["results"][number]) => {
    const newFinding: Finding = {
      id: `FIND-${Date.now().toString(36).toUpperCase()}`,
      title: `${result.type} observation (${result.id})`,
      detail: typeof result.value === "string" ? result.value : JSON.stringify(result.value).slice(0, 160) + "...",
      source: response?.context?.source_reference ?? "EVID-001",
      operationId: result.operation_id,
      timestamp: new Date().toISOString(),
      type: result.type,
    };
    setFindings((prev) => [newFinding, ...prev]);
    setNotice(`✦ Saved finding: ${newFinding.title}`);
  };

  const switchCase = () => {
    sessionStorage.removeItem("evidra.caseId");
    sessionStorage.removeItem("evidra.caseName");
    sessionStorage.removeItem("evidra.caseRoot");
    window.location.reload();
  };

  return (
    <div
      className="desktop-shell"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void saveActiveDoc();
        }
      }}
    >
      <AppMenu
        active={menu}
        onToggle={(next) => setMenu(menu === next ? null : next)}
        onAddSource={addSource}
        onNewFile={() => setDialog({ type: "new-file", targetDir: "" })}
        onView={(next) => { setView(next); setMenu(null); }}
        onSwitchCase={switchCase}
      />

      <input ref={sourceInput} className="hidden-file-input" type="file" multiple onChange={(event) => void browserSource(event)} />

      <div className="desktop-body">
        <ActivityBar sideView={sideView} sidebarOpen={sidebarOpen} view={view} onSide={handleSideSelect} onView={setView} />

        {sidebarOpen && (
          <aside
            className="case-sidebar"
            style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
          >
            <SidebarContent
              sideView={sideView}
              tree={tree}
              collapseKey={collapseKey}
              onCollapseAll={() => setCollapseKey((k) => k + 1)}
              snapshot={snapshot}
              findings={findings}
              openDocs={openDocs}
              activeDocPath={activeDocPath}
              onOpenFile={openFileByNode}
              onNewFile={(targetDir) => setDialog({ type: "new-file", targetDir })}
              onNewFolder={(targetDir) => setDialog({ type: "new-folder", targetDir })}
              onRename={(node) => setDialog({ type: "rename", targetPath: node.path, currentName: node.name, isDir: node.kind === "directory" })}
              onDelete={(node) => setDialog({ type: "delete", targetPath: node.path, isDir: node.kind === "directory" })}
              onContextMenu={(event, node) => {
                event.preventDefault();
                event.stopPropagation();
                setContextMenu({ x: event.clientX, y: event.clientY, node });
              }}
              onRefreshTree={refreshTree}
              onAddSource={addSource}
              onAddEvidence={() => sourceInput.current?.click()}
              onMaterialize={materialize}
              onSelectDoc={(path) => {
                setActiveDocPath(path);
                setView("JOCKY");
              }}
            />
            <div
              className={`sidebar-resize-handle ${isResizing ? "resizing" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizing(true);
              }}
              title="Drag to resize explorer"
            />
          </aside>
        )}

        <main className="editor-stage">
          {view === "JOCKY" && (
            <>
              <EditorTabs
                openDocs={openDocs}
                activeDocPath={activeDocPath}
                view={view}
                onSelect={(path) => {
                  setActiveDocPath(path);
                  setView("JOCKY");
                }}
                onClose={closeDoc}
                onNewFile={() => setDialog({ type: "new-file", targetDir: "" })}
                onView={setView}
              />
              <FileEditorView
                doc={activeDoc}
                onSave={saveActiveDoc}
                onChange={updateActiveContent}
                onRun={run}
                onNewFile={() => setDialog({ type: "new-file", targetDir: "" })}
              />
            </>
          )}

          {view === "WORKBENCH" && (
            <Workbench
              sourceId={snapshot?.sources?.[0]?.name}
              onRun={run}
              response={response}
              onBookmarkFinding={addFinding}
            />
          )}

          {view === "GRAPH" && <Graph response={response} runHistory={runHistory} />}

          {view === "BLOCKS" && <Blocks activeSource={activeDoc?.content ?? blankSource} />}

          {view === "DOCS" && <Docs />}

          {view === "HELP" && <Help />}
        </main>

        <Results response={response} onBookmarkFinding={addFinding} />
      </div>

      <footer className="status-bar">
        <span>● Case: {caseName}</span>
        <span>ID: {caseId}</span>
        <span>Docs: {openDocs.length}</span>
        <span>Sources: {snapshot?.sources.length ?? 0}</span>
        <span>Evidence: {snapshot?.evidence.length ?? 0}</span>
        <span>Findings: {findings.length}</span>
        <div className="status-spacer" />
        <span className="status-notice">{notice || "Ready"}</span>
      </footer>

      {contextMenu && (
        <div
          className="tree-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node.kind === "directory" ? (
            <>
              <button onClick={() => { setDialog({ type: "new-file", targetDir: contextMenu.node.path }); setContextMenu(null); }}>
                <Icon name="newFile" /> New File inside...
              </button>
              <button onClick={() => { setDialog({ type: "new-folder", targetDir: contextMenu.node.path }); setContextMenu(null); }}>
                <Icon name="newFolder" /> New Folder inside...
              </button>
            </>
          ) : (
            <button onClick={() => { void openFileByNode(contextMenu.node); setContextMenu(null); }}>
              <Icon name="file" /> Open in Editor
            </button>
          )}
          <button onClick={() => {
            setDialog({ type: "rename", targetPath: contextMenu.node.path, currentName: contextMenu.node.name, isDir: contextMenu.node.kind === "directory" });
            setContextMenu(null);
          }}>
            <Icon name="edit" /> Rename
          </button>
          <button className="danger" onClick={() => {
            setDialog({ type: "delete", targetPath: contextMenu.node.path, isDir: contextMenu.node.kind === "directory" });
            setContextMenu(null);
          }}>
            <Icon name="trash" /> Delete
          </button>
        </div>
      )}

      {dialog && (
        <ActionModal dialog={dialog} onClose={() => setDialog(null)} onSubmit={handleDialogSubmit} />
      )}
    </div>
  );
}

function ActionModal({
  dialog,
  onClose,
  onSubmit,
}: {
  dialog: NonNullable<FileDialog>;
  onClose: () => void;
  onSubmit: (val: string) => Promise<void>;
}) {
  const [val, setVal] = useState(dialog.type === "rename" ? dialog.currentName : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const title =
    dialog.type === "new-file"
      ? `Create New File ${dialog.targetDir ? `in ${dialog.targetDir}` : "at Case Root"}`
      : dialog.type === "new-folder"
      ? `Create New Folder ${dialog.targetDir ? `in ${dialog.targetDir}` : "at Case Root"}`
      : dialog.type === "rename"
      ? `Rename ${dialog.isDir ? "Folder" : "File"}: ${dialog.currentName}`
      : `Delete ${dialog.isDir ? "Folder" : "File"}`;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {dialog.type === "delete" ? (
          <p className="dialog-warning">
            Are you sure you want to permanently delete <code>{dialog.targetPath}</code>?
            {dialog.isDir && " All contents inside this folder will be deleted."}
          </p>
        ) : (
          <input
            ref={inputRef}
            className="dialog-input"
            value={val}
            placeholder={dialog.type === "new-file" ? "e.g. procedure.jocky or notes.txt" : "Folder name"}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSubmit(val);
              if (e.key === "Escape") onClose();
            }}
          />
        )}
        <div className="dialog-buttons">
          <button className="dialog-cancel" onClick={onClose}>Cancel</button>
          <button
            className={dialog.type === "delete" ? "dialog-confirm danger" : "dialog-confirm"}
            onClick={() => void onSubmit(val || "confirm")}
          >
            {dialog.type === "delete" ? "Delete" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AppMenu({
  active,
  onToggle,
  onAddSource,
  onNewFile,
  onView,
  onSwitchCase,
}: {
  active: Menu;
  onToggle: (menu: Menu) => void;
  onAddSource: () => void;
  onNewFile: () => void;
  onView: (view: View) => void;
  onSwitchCase?: () => void;
}) {
  const menuContent = (item: Exclude<Menu, null>) => (
    <>
      {item === "File" && (
        <>
          <button onClick={onAddSource}>Add Source Reference…</button>
          <button onClick={onNewFile}>New File…</button>
          <button onClick={() => onView("WORKBENCH")}>Open Workbench</button>
          {onSwitchCase && <button onClick={onSwitchCase} style={{ color: "#e8ad6b", fontWeight: 700 }}>Switch / Change Case Folder…</button>}
        </>
      )}
      {item === "Edit" && (
        <>
          <button disabled>Undo (Ctrl+Z)</button>
          <button disabled>Redo (Ctrl+Y)</button>
        </>
      )}
      {item === "View" && (
        <>
          <button onClick={() => onView("JOCKY")}>Editor</button>
          <button onClick={() => onView("WORKBENCH")}>Workbench</button>
          <button onClick={() => onView("GRAPH")}>Investigation Graph</button>
          <button onClick={() => onView("BLOCKS")}>Building Blocks</button>
        </>
      )}
      {item === "Run" && (
        <>
          <button onClick={() => onView("JOCKY")}>Run Active JOCKY</button>
          <button onClick={() => onView("WORKBENCH")}>Open Workbench</button>
        </>
      )}
      {item === "Help" && (
        <>
          <button onClick={() => onView("DOCS")}>JOCKY Reference</button>
          <button onClick={() => onView("HELP")}>About Evidra</button>
        </>
      )}
      {item === "More" && (
        <>
          <button onClick={onAddSource}>File · Add Source Reference</button>
          <button onClick={onNewFile}>File · New File</button>
          {onSwitchCase && <button onClick={onSwitchCase} style={{ color: "#e8ad6b" }}>File · Switch / Change Case Folder…</button>}
          <button onClick={() => onView("WORKBENCH")}>View · Workbench</button>
          <button onClick={() => onView("BLOCKS")}>View · Building Blocks</button>
          <button onClick={() => onView("DOCS")}>Help · JOCKY Reference</button>
        </>
      )}
    </>
  );

  return (
    <header className="app-menubar">
      <div className="app-logo">E</div>
      <strong className="app-name">Evidra</strong>
      <nav className="menu-row">
        {(["File", "Edit", "View", "Run", "Help"] as const).map((item) => (
          <div className="menu-item" key={item}>
            <button onClick={() => onToggle(item)}>{item}</button>
            {active === item && <div className="menu-dropdown">{menuContent(item)}</div>}
          </div>
        ))}
      </nav>
      <div className="menu-item menu-hamburger">
        <button onClick={() => onToggle("More")}>☰</button>
        {active === "More" && <div className="menu-dropdown">{menuContent("More")}</div>}
      </div>
      <div className="menu-spacer" />
      <div className="menu-search">⌕ Search <kbd>Ctrl K</kbd></div>
      <button className="menu-settings" onClick={() => onView("HELP")} title="Settings">⚙</button>
      {isDesktop() && (
        <div className="window-controls">
          <button onClick={() => window.evidraDesktop?.windowControl("minimize")}>—</button>
          <button onClick={() => window.evidraDesktop?.windowControl("maximize")}>□</button>
          <button className="window-close" onClick={() => window.evidraDesktop?.windowControl("close")}>×</button>
        </div>
      )}
    </header>
  );
}

function ActivityBar({
  sideView,
  sidebarOpen,
  view,
  onSide,
  onView,
}: {
  sideView: SideView;
  sidebarOpen: boolean;
  view: View;
  onSide: (view: SideView) => void;
  onView: (view: View) => void;
}) {
  const side: Array<[SideView, string, string]> = [
    ["EXPLORER", "explorer", "Explorer"],
    ["SOURCES", "source", "Sources"],
    ["EVIDENCE", "evidence", "Evidence"],
    ["PROCEDURES", "procedure", "Procedures"],
    ["RUNS", "runs", "Runs"],
    ["FINDINGS", "findings", "Findings"],
  ];
  return (
    <aside className="activity-bar">
      {side.map(([id, icon, label]) => (
        <button
          key={id}
          className={sidebarOpen && sideView === id ? "active" : ""}
          title={label}
          onClick={() => onSide(id)}
        >
          <Icon name={icon} />
          <span>{label}</span>
        </button>
      ))}
      <div className="activity-divider" />
      <button className={view === "GRAPH" ? "active" : ""} title="Graph" onClick={() => onView("GRAPH")}>
        <Icon name="graph" />
        <span>Graph</span>
      </button>
      <button className={view === "BLOCKS" ? "active" : ""} title="Building Blocks" onClick={() => onView("BLOCKS")}>
        <Icon name="blocks" />
        <span>Blocks</span>
      </button>
      <button className="activity-bottom" title="Settings" onClick={() => onView("HELP")}>
        <Icon name="settings" />
        <span>Settings</span>
      </button>
    </aside>
  );
}

function SidebarContent({
  sideView,
  tree,
  collapseKey,
  onCollapseAll,
  snapshot,
  findings,
  openDocs,
  activeDocPath,
  onOpenFile,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onContextMenu,
  onRefreshTree,
  onAddSource,
  onAddEvidence,
  onMaterialize,
  onSelectDoc,
}: {
  sideView: SideView;
  tree: FsNode[];
  collapseKey: number;
  onCollapseAll: () => void;
  snapshot: CaseSnapshot | null;
  findings: Finding[];
  openDocs: OpenDoc[];
  activeDocPath: string | null;
  onOpenFile: (node: FsNode) => void;
  onNewFile: (dir: string) => void;
  onNewFolder: (dir: string) => void;
  onRename: (node: FsNode) => void;
  onDelete: (node: FsNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FsNode) => void;
  onRefreshTree: () => void;
  onAddSource: () => void;
  onAddEvidence: () => void;
  onMaterialize: (id: string, name: string) => void;
  onSelectDoc: (path: string) => void;
}) {
  const title = {
    EXPLORER: "EXPLORER",
    SOURCES: "SOURCES",
    EVIDENCE: "EVIDENCE",
    PROCEDURES: "PROCEDURES",
    RUNS: "RUNS",
    FINDINGS: "FINDINGS",
  }[sideView];

  return (
    <>
      <div className="sidebar-title">
        <span>{title}</span>
        {sideView === "EXPLORER" ? (
          <div className="explorer-header-actions">
            <button title="New File" onClick={() => onNewFile("")}>
              <Icon name="newFile" />
            </button>
            <button title="New Folder" onClick={() => onNewFolder("")}>
              <Icon name="newFolder" />
            </button>
            <button title="Refresh Case Tree" onClick={onRefreshTree}>
              <Icon name="refresh" />
            </button>
            <button title="Collapse Folders" onClick={onCollapseAll}>
              <Icon name="collapse" />
            </button>
          </div>
        ) : (
          <button title="More actions">•••</button>
        )}
      </div>

      {sideView === "EXPLORER" && (
        <FileTree
          nodes={tree}
          collapseKey={collapseKey}
          onOpen={onOpenFile}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onRename={onRename}
          onDelete={onDelete}
          onContextMenu={onContextMenu}
        />
      )}

      {sideView === "SOURCES" && (
        <div className="sidebar-scrollable-content">
          <button className="side-action source-add-btn" onClick={onAddSource}>
            <Icon name="plus" /> Register External Source…
          </button>
          <LogicalList
            empty="No source references registered. Click above to register an evidence folder or disk image."
            items={snapshot?.sources.map((source) => (
              <div className="logical-card" key={source.id}>
                <strong>Sources/{source.name}</strong>
                <span>{source.name}</span>
                <small>Local reference · {source.status}</small>
                <code>evidence.import "Sources/{source.name}"</code>
                <button onClick={() => onMaterialize(source.id, source.name)}>
                  Materialize into case…
                </button>
              </div>
            )) ?? []}
          />
        </div>
      )}

      {sideView === "EVIDENCE" && (
        <div className="sidebar-scrollable-content">
          <button className="side-action evidence-add-btn" onClick={onAddEvidence}>
            <Icon name="plus" /> Import Evidence Files…
          </button>
          <LogicalList
            empty="No case evidence yet. Materialize a source reference or import evidence into the case."
            items={snapshot?.evidence.map((item) => (
              <div className="logical-card" key={item.id}>
                <strong>Evidence/{item.name}</strong>
                <span>{item.name}</span>
                <small>{item.file_count} files · {item.root}</small>
                <code>evidence.import "Evidence/{item.name}"</code>
              </div>
            )) ?? []}
          />
        </div>
      )}

      {sideView === "PROCEDURES" && (
        <div className="procedures-list">
          {openDocs.filter((d) => d.type === "jocky").map((doc) => (
            <button
              className={doc.path === activeDocPath ? "side-file selected" : "side-file"}
              key={doc.path}
              onClick={() => onSelectDoc(doc.path)}
            >
              <Icon name="jockyFile" />
              <span>{doc.name}</span>
              {doc.isDirty && <span className="tab-dirty">●</span>}
            </button>
          ))}
          <button className="side-action" onClick={() => onNewFile("")}>
            <Icon name="plus" /> New JOCKY procedure
          </button>
        </div>
      )}

      {sideView === "RUNS" && (
        <LogicalList
          empty="No formal procedure runs recorded yet. Execute JOCKY to trace runs."
          items={snapshot?.runs.map((run) => (
            <div className="side-file" key={run.id}>
              <Icon name="runs" />
              <span>{run.id} · {run.status}</span>
            </div>
          )) ?? []}
        />
      )}

      {sideView === "FINDINGS" && (
        <div className="findings-pane">
          {findings.length === 0 ? (
            <Empty text="No findings saved yet. Run JOCKY operations and click '✦ Bookmark' in Results Explorer to log findings here." />
          ) : (
            <div className="findings-list">
              {findings.map((f) => (
                <article className="finding-card" key={f.id}>
                  <header>
                    <Icon name="bookmark" />
                    <strong>{f.title}</strong>
                  </header>
                  <p>{f.detail}</p>
                  <footer>
                    <small>{f.source} · {new Date(f.timestamp).toLocaleTimeString()}</small>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function LogicalList({ items, empty }: { items: ReactNode[]; empty: string }) {
  return items.length ? <div className="logical-list">{items}</div> : <Empty text={empty} />;
}

function Empty({ text }: { text: string }) {
  return <div className="sidebar-empty">{text}</div>;
}

function FileTree({
  nodes,
  depth = 0,
  collapseKey,
  onOpen,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onContextMenu,
}: {
  nodes: FsNode[];
  depth?: number;
  collapseKey: number;
  onOpen: (node: FsNode) => void;
  onNewFile: (dir: string) => void;
  onNewFolder: (dir: string) => void;
  onRename: (node: FsNode) => void;
  onDelete: (node: FsNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FsNode) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (collapseKey > 0) setExpanded({});
  }, [collapseKey]);

  if (!nodes.length && depth === 0) {
    return <div className="sidebar-empty">Case folder is empty. Click 📄+ above to create an investigation procedure.</div>;
  }

  return (
    <div className="file-tree">
      {nodes.map((node) => {
        const isDir = node.kind === "directory";
        const isExp = expanded[node.path] ?? false;

        return (
          <div key={node.path} className="tree-node-wrapper">
            <div
              className="filesystem-row"
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={() => {
                if (isDir) {
                  setExpanded((prev) => ({ ...prev, [node.path]: !isExp }));
                } else {
                  onOpen(node);
                }
              }}
              onContextMenu={(e) => onContextMenu(e, node)}
            >
              <span className="twisty">{isDir ? (isExp ? "⌄" : "›") : ""}</span>
              <Icon name={getFileIcon(node.name, node.kind, isExp)} />
              <span className="tree-node-name">{node.name}</span>

              <div className="tree-item-actions" onClick={(e) => e.stopPropagation()}>
                {isDir && (
                  <>
                    <button title="New File inside this folder" onClick={() => onNewFile(node.path)}>
                      <Icon name="plus" />
                    </button>
                    <button title="New Folder inside this folder" onClick={() => onNewFolder(node.path)}>
                      <Icon name="folder" />
                    </button>
                  </>
                )}
                <button title="Rename" onClick={() => onRename(node)}>
                  <Icon name="edit" />
                </button>
                <button title="Delete" className="trash" onClick={() => onDelete(node)}>
                  <Icon name="trash" />
                </button>
              </div>
            </div>

            {isDir && isExp && (
              <FileTree
                nodes={node.children ?? []}
                depth={depth + 1}
                collapseKey={collapseKey}
                onOpen={onOpen}
                onNewFile={onNewFile}
                onNewFolder={onNewFolder}
                onRename={onRename}
                onDelete={onDelete}
                onContextMenu={onContextMenu}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function EditorTabs({
  openDocs,
  activeDocPath,
  view,
  onSelect,
  onClose,
  onNewFile,
  onView,
}: {
  openDocs: OpenDoc[];
  activeDocPath: string | null;
  view: View;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onNewFile: () => void;
  onView: (view: View) => void;
}) {
  return (
    <div className="editor-tabs">
      {openDocs.map((doc) => {
        const isActive = view === "JOCKY" && doc.path === activeDocPath;
        return (
          <div
            key={doc.path}
            className={isActive ? "editor-tab active" : "editor-tab"}
            onClick={() => onSelect(doc.path)}
          >
            <Icon name={getFileIcon(doc.name, "file")} />
            <span className="tab-title">{doc.name}</span>
            {doc.isDirty && <span className="tab-dirty" title="Unsaved changes">●</span>}
            <button
              className="tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                onClose(doc.path);
              }}
            >
              ×
            </button>
          </div>
        );
      })}

      <button className="add-tab" title="New file" onClick={onNewFile}>
        +
      </button>

      <button
        className={view === "WORKBENCH" ? "editor-tab workbench-tab active" : "editor-tab workbench-tab"}
        onClick={() => onView("WORKBENCH")}
      >
        <Icon name="procedure" /> Workbench
      </button>
    </div>
  );
}

function FileEditorView({
  doc,
  onSave,
  onChange,
  onRun,
  onNewFile,
}: {
  doc?: OpenDoc;
  onSave: () => Promise<void>;
  onChange: (source: string) => void;
  onRun: (source: string) => Promise<RuntimeExecutionResponse>;
  onNewFile: () => void;
}) {
  const [state, setState] = useState("Ready");

  if (!doc) {
    return (
      <div className="editor-empty">
        <Icon name="procedure" />
        <strong>No File Open</strong>
        <span>Select or create a file in Explorer.</span>
        <button onClick={onNewFile}>Create New File</button>
      </div>
    );
  }

  const runProcedure = async () => {
    setState("Running");
    try {
      const res = await onRun(doc.content);
      setState(res.status);
    } catch {
      setState("Failed");
    }
  };

  return (
    <div className="editor-view">
      <div className="editor-toolbar">
        <span className="editor-toolbar-meta">
          <strong>{doc.name}</strong>
          <small>· {doc.type.toUpperCase()} · {state}</small>
          {doc.isDirty && <span className="tab-dirty-notice">(unsaved)</span>}
        </span>
        <div className="editor-toolbar-actions">
          <button className="btn-secondary" onClick={() => void onSave()} title="Save file (Ctrl+S)">
            <Icon name="save" /> Save
          </button>
          {doc.type === "jocky" && (
            <button className="btn-primary" onClick={() => void runProcedure()}>
              <Icon name="play" /> Run Procedure
            </button>
          )}
        </div>
      </div>

      <textarea
        className={`jocky-editor ${doc.type !== "jocky" ? "generic-text" : ""}`}
        value={doc.content}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

function Workbench({
  sourceId,
  onRun,
  response,
  onBookmarkFinding,
}: {
  sourceId?: string;
  onRun: (source: string) => Promise<RuntimeExecutionResponse>;
  response: RuntimeExecutionResponse | null;
  onBookmarkFinding: (res: RuntimeExecutionResponse["results"][number]) => void;
}) {
  const [cells, setCells] = useState([
    { label: "Source", source: `source = evidence.import "Sources/${sourceId ?? "EVID-001"}"` },
    { label: "Artifacts", source: "artifacts = files.list source" },
    { label: "Filter", source: `suspicious = filter(extension == ".zip" | ".elf") from artifacts` },
  ]);
  const [state, setState] = useState("Ready");

  const run = async (index: number) => {
    setState("Running");
    try {
      const script = `[workbench]\n${cells.slice(0, index + 1).map((c) => c.source).join("\n")}`;
      const res = await onRun(script);
      setState(res.status);
    } catch {
      setState("Failed");
    }
  };

  const latest = response?.results[response.results.length - 1];

  return (
    <div className="workbench">
      <div className="workbench-head">
        <strong>Exploratory Workbench</strong>
        <small>Interactive cells · Non-destructive hypothesis testing · {state}</small>
      </div>
      <div className="workbench-grid">
        <div className="cell-stack">
          {cells.map((cell, index) => (
            <article className="workbench-cell" key={`${cell.label}-${index}`}>
              <header>
                <span>CELL {String(index + 1).padStart(2, "0")} · {cell.label}</span>
                <button onClick={() => void run(index)}>
                  <Icon name="play" /> Run Cell
                </button>
              </header>
              <textarea
                value={cell.source}
                onChange={(event) =>
                  setCells((items) =>
                    items.map((item, position) =>
                      position === index ? { ...item, source: event.target.value } : item
                    )
                  )
                }
              />
            </article>
          ))}
          <button
            className="side-action"
            onClick={() => setCells((items) => [...items, { label: "Query", source: "# JOCKY operation" }])}
          >
            <Icon name="plus" /> Add Cell
          </button>
        </div>
        <div className="workbench-result">
          {latest ? (
            <ResultCard result={latest} context={response?.context} onBookmarkFinding={onBookmarkFinding} />
          ) : (
            <ResultEmpty />
          )}
        </div>
      </div>
    </div>
  );
}

function Results({
  response,
  onBookmarkFinding,
}: {
  response: RuntimeExecutionResponse | null;
  onBookmarkFinding: (res: RuntimeExecutionResponse["results"][number]) => void;
}) {
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  const results = response?.results ?? [];
  const currentResult =
    results.find((r) => r.id === selectedResultId) ??
    results[results.length - 1];

  return (
    <aside className="results-pane">
      {results.length > 0 && (
        <div className="results-step-selector">
          <div className="step-selector-title">OPERATIONS ({results.length}):</div>
          <div className="step-chips-scroll">
            {results.map((res, idx) => {
              const step = response?.steps.find((s) => s.operation_id === res.operation_id);
              const isSelected = currentResult?.id === res.id;
              return (
                <button
                  key={res.id}
                  className={`step-chip ${isSelected ? "active" : ""}`}
                  onClick={() => setSelectedResultId(res.id)}
                  title={`${step?.capability ?? res.operation_id} → ${res.type}`}
                >
                  <span className="step-num">0{idx + 1}</span>
                  <span className="step-cap">{step?.capability ?? res.operation_id}</span>
                  <span className="step-type-pill">{res.type.replace("Collection", "")}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {currentResult ? (
        <ResultCard
          key={currentResult.id}
          result={currentResult}
          context={response?.context}
          onBookmarkFinding={onBookmarkFinding}
        />
      ) : (
        <ResultEmpty />
      )}
    </aside>
  );
}

function ResultEmpty() {
  return (
    <div className="result-empty">
      <Icon name="evidence" />
      <strong>Results Explorer</strong>
      <span>Run a JOCKY procedure or cell to inspect typed results here.</span>
    </div>
  );
}

function ResultCard({
  result,
  context,
  onBookmarkFinding,
}: {
  result: RuntimeExecutionResponse["results"][number];
  context?: RuntimeExecutionResponse["context"];
  onBookmarkFinding: (res: RuntimeExecutionResponse["results"][number]) => void;
}) {
  const [tab, setTab] = useState<"structured" | "raw">("structured");
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 1800);
  };

  return (
    <div className="result-card">
      <header>
        <div>
          <small>RESULTS EXPLORER</small>
          <strong>{result.type} · {result.id}</strong>
        </div>
        <div className="result-header-actions">
          <span className={`badge ${result.status}`}>{result.status}</span>
          <button className="btn-bookmark" title="Bookmark as Finding" onClick={() => onBookmarkFinding(result)}>
            <Icon name="bookmark" /> Bookmark
          </button>
        </div>
      </header>

      <nav>
        <button className={tab === "structured" ? "active" : ""} onClick={() => setTab("structured")}>
          Structured View
        </button>
        <button className={tab === "raw" ? "active" : ""} onClick={() => setTab("raw")}>
          Raw JSON
        </button>
      </nav>

      {tab === "raw" ? (
        <pre className="result-pre">{JSON.stringify(result.value, null, 2)}</pre>
      ) : (
        <div className="result-content-body">
          {renderSpecializedResult(result, copyToClipboard, copiedHash)}
        </div>
      )}

      <footer>
        <span>Source: {context?.source_reference ?? "EVID-001"}</span>
        <span>Op: {result.operation_id ?? "n/a"}</span>
      </footer>
    </div>
  );
}

function renderSpecializedResult(
  result: RuntimeExecutionResponse["results"][number],
  copyToClipboard: (text: string) => void,
  copiedHash: string | null
) {
  const { type, value } = result;

  // 1. ArtifactCollection Renderer
  if (type === "ArtifactCollection" && Array.isArray(value)) {
    const items = value as Array<{
      id: string;
      name: string;
      relative_path: string;
      extension: string;
      size_bytes: number;
      modified_at: string;
      sha256: string;
    }>;

    return (
      <div className="specialized-artifact-view">
        <div className="result-summary-bar">
          <span>Total Artifacts: <strong>{items.length}</strong></span>
          <span>
            Total Size: <strong>{(items.reduce((acc, i) => acc + (i.size_bytes || 0), 0) / 1024).toFixed(1)} KB</strong>
          </span>
        </div>
        <div className="result-table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th>Artifact</th>
                <th>Path</th>
                <th>Type</th>
                <th>Size</th>
                <th>Modified (UTC)</th>
                <th>SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {items.map((art) => (
                <tr key={art.id}>
                  <td>
                    <div className="art-name-cell">
                      <Icon name={getFileIcon(art.name, "file")} />
                      <strong>{art.name}</strong>
                    </div>
                  </td>
                  <td><code className="path-code">{art.relative_path}</code></td>
                  <td><span className="ext-badge">{art.extension || "none"}</span></td>
                  <td>{art.size_bytes < 1024 ? `${art.size_bytes} B` : `${(art.size_bytes / 1024).toFixed(1)} KB`}</td>
                  <td><small className="mono-time">{art.modified_at ? art.modified_at.replace("T", " ").replace("Z", "") : "-"}</small></td>
                  <td>
                    <button
                      className="hash-copy-btn"
                      title={art.sha256}
                      onClick={() => copyToClipboard(art.sha256)}
                    >
                      <code>{art.sha256 ? `${art.sha256.slice(0, 10)}…` : "-"}</code>
                      <small>{copiedHash === art.sha256 ? "✓" : "📋"}</small>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 2. MetadataCollection Renderer
  if (type === "MetadataCollection" && Array.isArray(value)) {
    const records = value as Array<{
      id: string;
      artifact_id: string;
      common: { name: string; path: string; size: number; type: string };
      filesystem: { modified_at: string; read_only: boolean };
      namespaces: {
        archive?: {
          entries_count?: number;
          entries?: Array<{ name: string; size: number; compressed_size: number; is_dir: boolean }>;
          suspicious_members?: string[];
          is_encrypted?: boolean;
          error?: string;
        };
        image?: { format: string; width: number; height: number; aspect_ratio: string };
        binary?: { format: string; platform: string; architecture?: string; magic?: string };
        text?: { line_count?: number; preview?: string; error?: string };
        tabular?: { columns?: string[]; row_count?: number };
      };
    }>;

    return (
      <div className="specialized-metadata-view">
        {records.map((rec) => (
          <div className="meta-card" key={rec.id}>
            <div className="meta-card-header">
              <div className="meta-card-title">
                <Icon name={getFileIcon(rec.common.name, "file")} />
                <strong>{rec.common.name}</strong>
                <span className="meta-id-tag">{rec.artifact_id}</span>
              </div>
              <div className="meta-card-badges">
                <span className="ext-badge">{rec.common.type}</span>
                <span className="badge completed">READ-ONLY</span>
              </div>
            </div>

            <div className="meta-details-grid">
              <div><small>Path:</small> <code>{rec.common.path}</code></div>
              <div><small>Size:</small> <strong>{rec.common.size} bytes</strong></div>
              <div><small>Modified:</small> <span>{rec.filesystem.modified_at}</span></div>
            </div>

            {/* Archive Namespace */}
            {rec.namespaces.archive && (
              <div className="namespace-section archive-section">
                <div className="namespace-header">
                  <Icon name="archive" />
                  <strong>Archive Deep Inspection ({rec.namespaces.archive.entries_count ?? 0} members)</strong>
                  {rec.namespaces.archive.is_encrypted && <span className="badge failed">ENCRYPTED</span>}
                </div>
                {rec.namespaces.archive.suspicious_members && rec.namespaces.archive.suspicious_members.length > 0 && (
                  <div className="suspicious-alert">
                    ⚠️ <strong>High-Risk Members:</strong> {rec.namespaces.archive.suspicious_members.join(", ")}
                  </div>
                )}
                {rec.namespaces.archive.entries && rec.namespaces.archive.entries.length > 0 && (
                  <div className="archive-entries-list">
                    {rec.namespaces.archive.entries.map((ent, idx) => (
                      <div className="archive-entry-item" key={idx}>
                        <span>{ent.is_dir ? "📁" : "📄"} {ent.name}</span>
                        <small>{ent.size} bytes</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Image Namespace */}
            {rec.namespaces.image && (
              <div className="namespace-section image-section">
                <div className="namespace-header">
                  <Icon name="file" />
                  <strong>Image Metadata ({rec.namespaces.image.format})</strong>
                </div>
                <div className="meta-details-grid">
                  <div><small>Dimensions:</small> <strong>{rec.namespaces.image.width} × {rec.namespaces.image.height} px</strong></div>
                  <div><small>Aspect Ratio:</small> <span>{rec.namespaces.image.aspect_ratio}</span></div>
                  <div><small>Format:</small> <span className="ext-badge">{rec.namespaces.image.format}</span></div>
                </div>
              </div>
            )}

            {/* Binary / Executable Namespace */}
            {rec.namespaces.binary && (
              <div className="namespace-section binary-section">
                <div className="namespace-header">
                  <Icon name="procedure" />
                  <strong>Binary Format ({rec.namespaces.binary.format})</strong>
                </div>
                <div className="meta-details-grid">
                  <div><small>Platform:</small> <strong>{rec.namespaces.binary.platform}</strong></div>
                  <div><small>Format:</small> <span>{rec.namespaces.binary.format}</span></div>
                  {rec.namespaces.binary.architecture && <div><small>Arch:</small> <span className="ext-badge">{rec.namespaces.binary.architecture}</span></div>}
                </div>
              </div>
            )}

            {/* Tabular Namespace */}
            {rec.namespaces.tabular && (
              <div className="namespace-section tabular-section">
                <div className="namespace-header">
                  <Icon name="csv" />
                  <strong>Tabular Structure ({rec.namespaces.tabular.row_count} rows)</strong>
                </div>
                <div className="column-pills">
                  {rec.namespaces.tabular.columns?.map((col) => (
                    <span className="col-pill" key={col}>{col}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Text / Preview Namespace */}
            {rec.namespaces.text && (
              <div className="namespace-section text-section">
                <div className="namespace-header">
                  <Icon name="txt" />
                  <strong>Text Content ({rec.namespaces.text.line_count} lines)</strong>
                </div>
                {rec.namespaces.text.preview && (
                  <pre className="text-preview-block">{rec.namespaces.text.preview}</pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // 3. EventCollection or Timeline Renderer
  if ((type === "EventCollection" || type === "Timeline") && Array.isArray(value)) {
    const events = value as Array<{
      id: string;
      artifact_id?: string;
      kind: string;
      timestamp: string;
      description: string;
      level?: string;
    }>;

    return (
      <div className="specialized-events-view">
        <div className="result-summary-bar">
          <span>Total Events: <strong>{events.length}</strong></span>
          <span>Timeline Span: <strong>{events[0]?.timestamp?.slice(0, 10) ?? ""} → {events[events.length - 1]?.timestamp?.slice(0, 10) ?? ""}</strong></span>
        </div>
        <div className="timeline-stream">
          {events.map((evt) => {
            const level = evt.level || (evt.kind.includes("error") ? "ERROR" : evt.kind.includes("warn") ? "WARN" : "INFO");
            return (
              <div className={`timeline-row ${level.toLowerCase()}`} key={evt.id}>
                <div className="timeline-time-col">
                  <span className="time-badge">{evt.timestamp ? evt.timestamp.replace("T", " ").replace("Z", "") : "N/A"}</span>
                </div>
                <div className="timeline-bullet-col">
                  <div className={`timeline-dot ${level.toLowerCase()}`} />
                </div>
                <div className="timeline-content-col">
                  <div className="timeline-content-header">
                    <span className={`event-kind-tag ${evt.kind.replace(".", "-")}`}>{evt.kind}</span>
                    {evt.artifact_id && <span className="art-ref-pill">{evt.artifact_id}</span>}
                    <span className={`level-pill ${level.toLowerCase()}`}>{level}</span>
                  </div>
                  <div className="timeline-desc">{evt.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 3b. PrefetchCollection Renderer
  if ((type === "PrefetchCollection" || type === "ArtifactInspection") && Array.isArray(value)) {
    const items = value as Array<{
      id: string;
      executable_name: string;
      prefetch_file: string;
      run_count: number;
      last_execution_utc: string;
      file_path: string;
      sha256: string;
    }>;

    return (
      <div className="specialized-artifact-view">
        <div className="result-summary-bar">
          <span>Prefetch Executables: <strong>{items.length}</strong></span>
        </div>
        <div className="result-table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th>Executable</th>
                <th>Exec Count</th>
                <th>Last Executed (UTC)</th>
                <th>Prefetch Artifact</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              {items.map((pf) => (
                <tr key={pf.id}>
                  <td><strong>{pf.executable_name}</strong></td>
                  <td><span className="ext-badge">{pf.run_count} runs</span></td>
                  <td><small className="mono-time">{pf.last_execution_utc ? pf.last_execution_utc.replace("T", " ") : "-"}</small></td>
                  <td><code className="path-code">{pf.prefetch_file}</code></td>
                  <td><code className="path-code">{pf.file_path}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 3c. IOCCollection Renderer
  if ((type === "IOCCollection" || type === "ThreatMatch") && Array.isArray(value)) {
    const items = value as Array<{
      id: string;
      matched_rule: string;
      indicator: string;
      severity: string;
      artifact_path: string;
      description: string;
    }>;

    return (
      <div className="specialized-artifact-view">
        <div className="result-summary-bar">
          <span>Matched Threat Indicators: <strong style={{ color: "#c93c3c" }}>{items.length}</strong></span>
        </div>
        <div className="result-table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Matched Rule</th>
                <th>Indicator</th>
                <th>Artifact Path</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ioc) => (
                <tr key={ioc.id}>
                  <td><span className={`status-tag ${ioc.severity.toLowerCase()}`}>{ioc.severity}</span></td>
                  <td><strong>{ioc.matched_rule}</strong></td>
                  <td><code className="path-code">{ioc.indicator}</code></td>
                  <td><code className="path-code">{ioc.artifact_path}</code></td>
                  <td>{ioc.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 4. FindingCollection Renderer
  if (type === "FindingCollection" && Array.isArray(value)) {
    const findings = value as Array<{
      id: string;
      title?: string;
      severity: string;
      kind?: string;
      summary: string;
      confidence?: number;
      artifact_refs?: string[];
      event_refs?: string[];
      indicators?: string[];
      evidence_sources?: string[];
    }>;

    return (
      <div className="specialized-findings-view">
        <div className="result-summary-bar">
          <span>Correlated Findings: <strong>{findings.length}</strong></span>
          <span>High Severity: <strong>{findings.filter((f) => f.severity === "HIGH").length}</strong></span>
        </div>
        <div className="findings-stream">
          {findings.map((fnd) => (
            <div className={`forensic-finding-card severity-${fnd.severity.toLowerCase()}`} key={fnd.id}>
              <div className="fnd-header">
                <div className="fnd-title-wrap">
                  <span className={`fnd-severity-pill ${fnd.severity.toLowerCase()}`}>{fnd.severity}</span>
                  <strong>{fnd.title || fnd.id}</strong>
                </div>
                {fnd.confidence && (
                  <div className="fnd-confidence">
                    <small>Confidence:</small>
                    <span className="confidence-meter">{(fnd.confidence * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>

              <p className="fnd-summary-text">{fnd.summary}</p>

              {fnd.indicators && fnd.indicators.length > 0 && (
                <div className="fnd-indicators">
                  <small>KEY INDICATORS & ARTIFACT STRINGS:</small>
                  <div className="indicators-chip-list">
                    {fnd.indicators.map((ind, i) => (
                      <span className="indicator-chip" key={i}>{ind}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="fnd-refs-footer">
                {fnd.artifact_refs && fnd.artifact_refs.length > 0 && (
                  <div className="ref-group">
                    <small>Artifacts:</small>
                    {fnd.artifact_refs.map((ref) => (
                      <span className="ref-tag" key={ref}>{ref}</span>
                    ))}
                  </div>
                )}
                {fnd.event_refs && fnd.event_refs.length > 0 && (
                  <div className="ref-group">
                    <small>Events ({fnd.event_refs.length}):</small>
                    {fnd.event_refs.slice(0, 5).map((ref) => (
                      <span className="ref-tag event-tag" key={ref}>{ref}</span>
                    ))}
                    {fnd.event_refs.length > 5 && <span className="ref-tag more">+{fnd.event_refs.length - 5} more</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 5. Export Result Renderer
  if (type === "Export" && typeof value === "object" && value !== null) {
    const exp = value as {
      status?: string;
      destination?: string;
      file_path?: string;
      relative_path?: string;
      records_count?: number;
      size_bytes?: number;
      sha256?: string;
    };

    return (
      <div className="specialized-export-view">
        <div className="export-success-box">
          <div className="export-icon">💾</div>
          <div className="export-info">
            <strong>Export Written to Workspace</strong>
            <span>Destination: <code>{exp.destination || exp.relative_path}</code></span>
          </div>
        </div>
        <div className="export-details-grid">
          <div><small>Full Disk Path:</small> <code className="path-code">{exp.file_path}</code></div>
          <div><small>Records Exported:</small> <strong>{exp.records_count}</strong></div>
          <div><small>File Size:</small> <strong>{exp.size_bytes} bytes</strong></div>
          <div>
            <small>SHA-256:</small>
            <button className="hash-copy-btn" onClick={() => copyToClipboard(exp.sha256 || "")}>
              <code>{exp.sha256}</code>
              <small>{copiedHash === exp.sha256 ? "✓" : "📋"}</small>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback Generic Table View
  const values = Array.isArray(value) ? value : [value];
  const columns =
    values.length && typeof values[0] === "object" && values[0] !== null
      ? Object.keys(values[0] as Record<string, unknown>).slice(0, 6)
      : [];

  if (columns.length > 0) {
    return (
      <div className="result-table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((val, idx) => (
              <tr key={idx}>
                {columns.map((col) => (
                  <td key={col}>{String((val as Record<string, unknown>)[col] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <pre className="result-pre">{JSON.stringify(value, null, 2)}</pre>;
}

type GraphMode = "pipeline" | "tree";

function GraphNode({
  id,
  label,
  sub,
  kind,
  typeStr,
  count,
  selected,
  dimmed,
  offset,
  onSelect,
  onDragStart,
  children,
}: {
  id: string;
  label: string;
  sub?: string;
  kind: "source" | "op" | "result";
  typeStr?: string;
  count?: number;
  selected?: boolean;
  dimmed?: boolean;
  offset?: { x: number; y: number };
  onSelect: (id: string) => void;
  onDragStart?: (id: string, e: React.MouseEvent) => void;
  children?: ReactNode;
}) {
  const typeClass = typeStr
    ? typeStr.toLowerCase().replace("collection", "").trim() + "-type"
    : "";

  return (
    <div
      id={id}
      className={`graph-card-node ${kind}-card ${typeClass} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""}`}
      style={offset ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
      onMouseDown={(e) => {
        if (onDragStart) onDragStart(id, e);
        onSelect(id);
      }}
    >
      <div className="graph-card-head">
        <span className="graph-card-type">{kind === "source" ? "EVIDENCE" : kind === "op" ? "CAPABILITY" : typeStr ?? "RESULT"}</span>
        {count !== undefined && <span className="graph-badge-pill">{count} items</span>}
      </div>
      <div className="graph-card-title">{label}</div>
      {sub && <div className="graph-card-detail">{sub}</div>}
      {children}
    </div>
  );
}

function BezierEdge({
  fromId,
  toId,
  containerRef,
  zoom,
  highlighted,
  dimmed,
  portIndex,
  portTotal,
  dragTick,
}: {
  fromId: string;
  toId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  highlighted?: boolean;
  dimmed?: boolean;
  portIndex?: number;
  portTotal?: number;
  dragTick?: number;
}) {
  const [path, setPath] = useState("");

  useEffect(() => {
    const calculate = () => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      const scaler = container.querySelector<HTMLDivElement>(".graph-content-scaler") || container.querySelector<HTMLDivElement>(".blocks-canvas-area");
      if (!scaler) return;
      const sRect = scaler.getBoundingClientRect();
      const fromEl = container.querySelector(`#${fromId}`);
      const toEl = container.querySelector(`#${toId}`);
      if (!fromEl || !toEl) return;
      const fRect = fromEl.getBoundingClientRect();
      const tRect = toEl.getBoundingClientRect();

      const x1 = (fRect.right - sRect.left) / zoom;
      let y1 = (fRect.top + fRect.height / 2 - sRect.top) / zoom;
      if (portIndex !== undefined && portTotal !== undefined && portTotal > 0) {
        y1 = (fRect.top + ((portIndex + 0.5) / portTotal) * fRect.height - sRect.top) / zoom;
      }

      const x2 = (tRect.left - sRect.left) / zoom;
      const y2 = (tRect.top + tRect.height / 2 - sRect.top) / zoom;

      const dx = Math.max(45, (x2 - x1) * 0.45);
      const cx1 = x1 + dx;
      const cy1 = y1;
      const cx2 = x2 - dx;
      const cy2 = y2;
      setPath(`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`);
    };

    calculate();
    const timer = setTimeout(calculate, 16);
    const handleScroll = () => calculate();
    const container = containerRef.current;
    if (container) container.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", calculate);
    return () => {
      clearTimeout(timer);
      if (container) container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", calculate);
    };
  }, [fromId, toId, containerRef, zoom, portIndex, portTotal, dragTick]);

  if (!path) return null;
  const pathClass = highlighted ? "graph-bezier-path highlighted" : dimmed ? "graph-bezier-path dimmed" : "graph-bezier-path";
  const markerId = highlighted ? "arr-highlighted" : "arr";

  return (
    <svg
      className="graph-svg-layer"
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: highlighted ? 3 : 1, overflow: "visible" }}
    >
      <defs>
        <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <polygon points="0 0, 7 3.5, 0 7" fill="#6b9eb8" />
        </marker>
        <marker id="arr-highlighted" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
          <polygon points="0 0, 9 4.5, 0 9" fill="#1b6088" />
        </marker>
      </defs>
      <path d={path} className={pathClass} markerEnd={`url(#${markerId})`} />
    </svg>
  );
}

function getConnectedNodes(selectedId: string | null, edges: { from: string; to: string }[]) {
  if (!selectedId) return new Set<string>();
  const connected = new Set<string>([selectedId]);
  let added = true;
  while (added) {
    added = false;
    for (const e of edges) {
      if (connected.has(e.from) && !connected.has(e.to)) {
        connected.add(e.to);
        added = true;
      }
      if (connected.has(e.to) && !connected.has(e.from)) {
        connected.add(e.from);
        added = true;
      }
    }
  }
  return connected;
}

function Graph({
  response,
  runHistory,
}: {
  response: RuntimeExecutionResponse | null;
  runHistory: { scriptName: string; docPath: string; response: RuntimeExecutionResponse }[];
}) {
  const [graphMode, setGraphMode] = useState<GraphMode>("pipeline");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["artifacts"]));
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [dragTick, setDragTick] = useState(0);
  const [selectedRunIdx, setSelectedRunIdx] = useState<number>(0);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; initX: number; initY: number } | null>(null);

  // When runHistory changes, auto-select the latest run
  const prevHistLen = useRef(0);
  if (runHistory.length !== prevHistLen.current) {
    prevHistLen.current = runHistory.length;
    if (runHistory.length > 0) setSelectedRunIdx(runHistory.length - 1);
  }

  const handleDragStart = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const init = nodeOffsets[id] || { x: 0, y: 0 };
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, initX: init.x, initY: init.y };

    const handleMouseMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = (me.clientX - dragRef.current.startX) / zoom;
      const dy = (me.clientY - dragRef.current.startY) / zoom;
      const targetId = dragRef.current.id;
      setNodeOffsets((prev) => ({ ...prev, [targetId]: { x: dragRef.current!.initX + dx, y: dragRef.current!.initY + dy } }));
      setDragTick((t) => t + 1);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Resolve which response to display — prefer runHistory selection, fallback to last response
  const activeResponse: RuntimeExecutionResponse | null =
    runHistory.length > 0 ? runHistory[Math.min(selectedRunIdx, runHistory.length - 1)].response : response;

  if (!activeResponse) {
    return (
      <div className="placeholder">
        <small>INVESTIGATION GRAPH</small>
        <h1>No Graph Lineage</h1>
        <p>Run a JOCKY procedure to trace how source evidence flows through capabilities into typed results and findings.</p>
      </div>
    );
  }

  // Script selector bar (shown if more than one run exists)
  const scriptSelectorBar = runHistory.length > 1 ? (
    <div className="graph-script-selector-bar">
      <small>SCRIPT RUN:</small>
      {runHistory.map((r, i) => (
        <button
          key={i}
          className={`graph-script-tab ${i === Math.min(selectedRunIdx, runHistory.length - 1) ? "active" : ""}`}
          onClick={() => { setSelectedRunIdx(i); setNodeOffsets({}); setSelectedNodeId(null); setZoom(1); }}
        >
          {r.scriptName}
        </button>
      ))}
    </div>
  ) : null;

  // Use activeResponse for all graph computation below
  const response2 = activeResponse;

  const srcRef = response2.context?.source_reference ?? "EVID-001";
  const srcName = response2.context?.source_path
    ? response2.context.source_path.split(/[/\\]/).pop()
    : "Evidence Root";

  const toggleFolder = (key: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  /* ── Pipeline Lineage Graph ── */
  if (graphMode === "pipeline") {
    const edges: { from: string; to: string }[] = [];
    response2.results.forEach((r, i) => {
      if (i === 0) {
        edges.push({ from: "node-source", to: `node-op-${r.id}` });
      } else {
        edges.push({ from: `node-result-${response2.results[i - 1].id}`, to: `node-op-${r.id}` });
      }
      edges.push({ from: `node-op-${r.id}`, to: `node-result-${r.id}` });
    });

    const connectedSet = getConnectedNodes(selectedNodeId, edges);

    return (
      <div className="graph-view-wrapper">
        <div className="graph-top-toolbar">
          <div className="graph-title-group">
            <small>INVESTIGATION GRAPH</small>
            <h2>Pipeline Lineage Graph</h2>
          </div>
          <div className="graph-mode-switch">
            <button className="graph-mode-btn active">⌘ Pipeline</button>
            <button className="graph-mode-btn" onClick={() => setGraphMode("tree")}>◇ Evidence Tree</button>
          </div>
          <div className="graph-controls-group">
            <button className="graph-zoom-btn" onClick={() => setZoom((z) => Math.min(z + 0.15, 2))}>＋ Zoom</button>
            <button className="graph-zoom-btn" onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}>－ Zoom</button>
            <button className="graph-zoom-btn" onClick={() => { setZoom(1); setNodeOffsets({}); }}>↺ Reset</button>
          </div>
        </div>

        {scriptSelectorBar}

        <div className="graph-canvas-container" ref={canvasRef}>
          <div className="graph-content-scaler" style={{ transform: `scale(${zoom})` }}>
            <div className="graph-nodes-layer">
              <div className="graph-stage-column">
                <div className="graph-stage-header">Source <span className="graph-stage-badge">1</span></div>
                <GraphNode
                  id="node-source"
                  label={srcRef}
                  sub={srcName}
                  kind="source"
                  selected={selectedNodeId === "node-source"}
                  dimmed={Boolean(selectedNodeId && !connectedSet.has("node-source"))}
                  offset={nodeOffsets["node-source"]}
                  onSelect={setSelectedNodeId}
                  onDragStart={handleDragStart}
                />
              </div>

              {response2.results.map((result) => {
                const step = response2.steps.find((s) => s.operation_id === result.operation_id);
                const cap = step?.capability ?? result.operation_id ?? "operation";
                const count = Array.isArray(result.value) ? result.value.length : undefined;
                const opId = `node-op-${result.id}`;
                const resId = `node-result-${result.id}`;
                return (
                  <div className="graph-stage-column" key={result.id}>
                    <div className="graph-stage-header">
                      {cap} <span className="graph-stage-badge">{result.type.replace("Collection", "")}</span>
                    </div>
                    <GraphNode
                      id={opId}
                      label={cap}
                      sub={result.operation_id}
                      kind="op"
                      selected={selectedNodeId === opId}
                      dimmed={Boolean(selectedNodeId && !connectedSet.has(opId))}
                      offset={nodeOffsets[opId]}
                      onSelect={setSelectedNodeId}
                      onDragStart={handleDragStart}
                    />
                    <GraphNode
                      id={resId}
                      label={result.id}
                      sub={result.status}
                      kind="result"
                      typeStr={result.type}
                      count={count}
                      selected={selectedNodeId === resId}
                      dimmed={Boolean(selectedNodeId && !connectedSet.has(resId))}
                      offset={nodeOffsets[resId]}
                      onSelect={setSelectedNodeId}
                      onDragStart={handleDragStart}
                    />
                  </div>
                );
              })}
            </div>

            {edges.map((e, idx) => {
              const isHi = selectedNodeId ? connectedSet.has(e.from) && connectedSet.has(e.to) : false;
              const isDim = selectedNodeId ? !isHi : false;
              return (
                <BezierEdge
                  key={idx}
                  fromId={e.from}
                  toId={e.to}
                  containerRef={canvasRef}
                  zoom={zoom}
                  highlighted={isHi}
                  dimmed={isDim}
                  dragTick={dragTick}
                />
              );
            })}
          </div>
        </div>

        <div className="graph-bottom-legend">
          <span className="legend-item"><span className="legend-color-dot source" /> Evidence Source</span>
          <span className="legend-item"><span className="legend-color-dot op" /> Capability</span>
          <span className="legend-item"><span className="legend-color-dot artifact" /> ArtifactCollection</span>
          <span className="legend-item"><span className="legend-color-dot meta" /> MetadataCollection</span>
          <span className="legend-item"><span className="legend-color-dot event" /> EventCollection</span>
          <span className="legend-item"><span className="legend-color-dot finding" /> FindingCollection</span>
          <span className="legend-item"><span className="legend-color-dot export" /> Export</span>
          <span style={{ marginLeft: "auto", fontStyle: "italic", fontSize: 8 }}>Drag nodes to rearrange · Click node to trace lineage path</span>
        </div>
      </div>
    );
  }

  /* ── Evidence & Artifact Tree Graph ── */
  const artifactResult = response2.results.find((r) => r.type === "ArtifactCollection" && Array.isArray(r.value));
  const artifacts = (artifactResult?.value as Array<{ id: string; name: string; extension: string; size_bytes: number }> | undefined) ?? [];

  const extGroups: Record<string, typeof artifacts> = {};
  for (const art of artifacts) {
    const grp = art.extension || "other";
    if (!extGroups[grp]) extGroups[grp] = [];
    extGroups[grp].push(art);
  }

  const treeEdges = response2.results.map((r) => ({ from: "tree-evidence-node", to: `tree-result-${r.id}` }));
  const connectedSet = getConnectedNodes(selectedNodeId, treeEdges);

  return (
    <div className="graph-view-wrapper">
      <div className="graph-top-toolbar">
        <div className="graph-title-group">
          <small>INVESTIGATION GRAPH</small>
          <h2>Evidence &amp; Artifact Tree</h2>
        </div>
        <div className="graph-mode-switch">
          <button className="graph-mode-btn" onClick={() => setGraphMode("pipeline")}>⌘ Pipeline</button>
          <button className="graph-mode-btn active">◇ Evidence Tree</button>
        </div>
        <div className="graph-controls-group">
          <button className="graph-zoom-btn" onClick={() => setZoom((z) => Math.min(z + 0.15, 2))}>＋ Zoom</button>
          <button className="graph-zoom-btn" onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}>－ Zoom</button>
          <button className="graph-zoom-btn" onClick={() => { setZoom(1); setNodeOffsets({}); }}>↺ Reset</button>
        </div>
      </div>

      {scriptSelectorBar}

      <div className="graph-canvas-container" ref={canvasRef}>
        <div className="graph-content-scaler" style={{ transform: `scale(${zoom})` }}>
          <div className="graph-nodes-layer" style={{ alignItems: "flex-start", gap: 56 }}>
            {/* Evidence root with expandable tree */}
            <div className="graph-stage-column" style={{ minWidth: 260, maxWidth: 320 }}>
              <div className="graph-stage-header">Evidence Root <span className="graph-stage-badge">{artifacts.length} files</span></div>
              <div
                id="tree-evidence-node"
                className={`graph-card-node source-card ${selectedNodeId === "tree-evidence-node" ? "selected" : ""} ${selectedNodeId && !connectedSet.has("tree-evidence-node") ? "dimmed" : ""}`}
                style={nodeOffsets["tree-evidence-node"] ? { transform: `translate(${nodeOffsets["tree-evidence-node"].x}px, ${nodeOffsets["tree-evidence-node"].y}px)` } : undefined}
                onMouseDown={(e) => handleDragStart("tree-evidence-node", e)}
                onClick={() => setSelectedNodeId("tree-evidence-node")}
              >
                <div className="graph-card-head">
                  <span className="graph-card-type">EVIDENCE SOURCE</span>
                  <span className="graph-badge-pill">{srcRef}</span>
                </div>
                <div className="graph-card-title"><Icon name="evidence" /> {srcName}</div>

                {artifacts.length > 0 && (
                  <div className="graph-tree-container">
                    {Object.entries(extGroups).map(([ext, arts]) => {
                      const folderKey = `ext-${ext}`;
                      const isOpen = expandedFolders.has(folderKey);
                      return (
                        <div className="graph-tree-folder" key={ext}>
                          <div className="graph-tree-folder-head" onClick={(e) => { e.stopPropagation(); toggleFolder(folderKey); }}>
                            {isOpen ? "▼" : "▶"} <Icon name={isOpen ? "folderOpen" : "folder"} />
                            <span>.{ext}</span>
                            <span className="graph-badge-pill" style={{ marginLeft: "auto" }}>{arts.length}</span>
                          </div>
                          {isOpen && arts.map((art) => (
                            <div
                              key={art.id}
                              className={`graph-tree-file-item ${selectedNodeId === art.id ? "selected" : ""}`}
                              onClick={(e) => { e.stopPropagation(); setSelectedNodeId(art.id); }}
                            >
                              <span><Icon name="file" /> {art.name}</span>
                              <span className="graph-file-size">{art.size_bytes < 1024 ? `${art.size_bytes}B` : `${(art.size_bytes / 1024).toFixed(1)}K`}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Analysis columns */}
            <div className="graph-stage-column" style={{ gap: 20 }}>
              <div className="graph-stage-header">Analysis &amp; Outputs <span className="graph-stage-badge">{response2.results.length} ops</span></div>
              {response2.results.map((result) => {
                const step = response2.steps.find((s) => s.operation_id === result.operation_id);
                const cap = step?.capability ?? result.operation_id ?? "operation";
                const count = Array.isArray(result.value) ? result.value.length : undefined;
                const typeKey = result.type.toLowerCase().replace("collection", "").trim();
                const resId = `tree-result-${result.id}`;
                return (
                  <div
                    key={result.id}
                    id={resId}
                    className={`graph-card-node result-card-node ${typeKey}-type ${selectedNodeId === resId ? "selected" : ""} ${selectedNodeId && !connectedSet.has(resId) ? "dimmed" : ""}`}
                    style={nodeOffsets[resId] ? { transform: `translate(${nodeOffsets[resId].x}px, ${nodeOffsets[resId].y}px)` } : undefined}
                    onMouseDown={(e) => handleDragStart(resId, e)}
                    onClick={() => setSelectedNodeId(resId)}
                  >
                    <div className="graph-card-head">
                      <span className="graph-card-type">{result.type}</span>
                      {count !== undefined && <span className="graph-badge-pill">{count} items</span>}
                    </div>
                    <div className="graph-card-title">{cap}</div>
                    <div className="graph-card-detail">{result.id} · {result.status}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {treeEdges.map((e, idx) => {
            const isHi = selectedNodeId ? connectedSet.has(e.from) && connectedSet.has(e.to) : false;
            const isDim = selectedNodeId ? !isHi : false;
            return (
              <BezierEdge
                key={idx}
                fromId={e.from}
                toId={e.to}
                containerRef={canvasRef}
                zoom={zoom}
                highlighted={isHi}
                dimmed={isDim}
                portIndex={idx}
                portTotal={treeEdges.length}
                dragTick={dragTick}
              />
            );
          })}
        </div>
      </div>

      <div className="graph-bottom-legend">
        <span className="legend-item"><span className="legend-color-dot source" /> Evidence Source</span>
        <span className="legend-item"><span className="legend-color-dot artifact" /> Artifact</span>
        <span className="legend-item"><span className="legend-color-dot meta" /> Metadata</span>
        <span className="legend-item"><span className="legend-color-dot event" /> Events</span>
        <span className="legend-item"><span className="legend-color-dot finding" /> Findings</span>
        <span style={{ marginLeft: "auto", fontStyle: "italic", fontSize: 8 }}>Evenly spaced ports · Drag nodes to arrange · Select node to highlight lineage</span>
      </div>
    </div>
  );
}

type BlockCategory = "import-source" | "transform" | "export";

interface VisualBlock {
  id: string;
  category: BlockCategory;
  title: string;
  operation: string;
  detail: string;
}

function Blocks({ activeSource }: { activeSource: string }) {
  const [blockList, setBlockList] = useState<VisualBlock[]>([
    { id: "blk-1", category: "import-source", title: "Evidence Source Provider", operation: 'evidence.import "Sources/Valora"', detail: "Source provider block · Registers external evidence" },
    { id: "blk-2", category: "transform", title: "Materialize Evidence", operation: 'copy source as "working_evidence"', detail: "Creates read-only materialized working copy" },
    { id: "blk-3", category: "transform", title: "List Artifacts", operation: "files.list working", detail: "Enumerates all files & directories inside workspace" },
    { id: "blk-4", category: "transform", title: "Filter Suspicious Files", operation: 'filter(extension == ".zip" | ".elf" | ".exe") from artifacts', detail: "Criteria-based narrow triage filter" },
    { id: "blk-5", category: "transform", title: "Deep Metadata Extraction", operation: "metadata.extract suspicious", detail: "Extracts archive, binary, image & filesystem metadata" },
    { id: "blk-6", category: "transform", title: "Extract Log Events", operation: "events.extract from artifacts", detail: "Parses ISO 8601 UTC timestamped event streams" },
    { id: "blk-7", category: "transform", title: "Multi-Vector Correlation", operation: "correlate(suspicious, metadata, events)", detail: "Cross-correlates artifacts, metadata & timeline events" },
    { id: "blk-8", category: "export", title: "Disk Export Sink", operation: 'export findings > "./Outputs/findings.json"', detail: "Persists deterministic JSON report to disk" },
  ]);

  const addBlock = (cat: BlockCategory) => {
    const newId = `blk-${Date.now().toString(36).slice(-4)}`;
    if (cat === "import-source") {
      setBlockList((prev) => [...prev, { id: newId, category: cat, title: "Import Source Provider", operation: 'evidence.import "Sources/Evidence"', detail: "Output-only source block" }]);
    } else if (cat === "transform") {
      setBlockList((prev) => [...prev, { id: newId, category: cat, title: "Analysis Transform", operation: "metadata.extract artifacts", detail: "Transforms connected inputs into typed collections" }]);
    } else {
      setBlockList((prev) => [...prev, { id: newId, category: cat, title: "Export Sink", operation: 'export findings > "./Outputs/export.json"', detail: "Exports connected results to workspace disk" }]);
    }
  };

  const removeBlock = (id: string) => {
    setBlockList((prev) => prev.filter((b) => b.id !== id));
  };

  const resetDemoBlocks = () => {
    setBlockList([
      { id: "blk-1", category: "import-source", title: "Evidence Source Provider", operation: 'evidence.import "Sources/Valora"', detail: "Source provider block · Registers external evidence" },
      { id: "blk-2", category: "transform", title: "Materialize Evidence", operation: 'copy source as "working_evidence"', detail: "Creates read-only materialized working copy" },
      { id: "blk-3", category: "transform", title: "List Artifacts", operation: "files.list working", detail: "Enumerates all files & directories inside workspace" },
      { id: "blk-4", category: "transform", title: "Filter Suspicious Files", operation: 'filter(extension == ".zip" | ".elf" | ".exe") from artifacts', detail: "Criteria-based narrow triage filter" },
      { id: "blk-5", category: "transform", title: "Deep Metadata Extraction", operation: "metadata.extract suspicious", detail: "Extracts archive, binary, image & filesystem metadata" },
      { id: "blk-6", category: "transform", title: "Extract Log Events", operation: "events.extract from artifacts", detail: "Parses ISO 8601 UTC timestamped event streams" },
      { id: "blk-7", category: "transform", title: "Multi-Vector Correlation", operation: "correlate(suspicious, metadata, events)", detail: "Cross-correlates artifacts, metadata & timeline events" },
      { id: "blk-8", category: "export", title: "Disk Export Sink", operation: 'export findings > "./Outputs/findings.json"', detail: "Persists deterministic JSON report to disk" },
    ]);
  };

  const imports = blockList.filter((b) => b.category === "import-source");
  const transforms = blockList.filter((b) => b.category === "transform");
  const exports = blockList.filter((b) => b.category === "export");

  return (
    <div className="building-blocks-wrapper">
      <header className="blocks-top-toolbar">
        <div className="blocks-title-group">
          <small>BUILDING BLOCKS WORKSPACE</small>
          <h2>Visual Forensic Workflow Blocks</h2>
        </div>
        <div className="blocks-action-btns">
          <button className="btn-block-action" onClick={() => addBlock("import-source")}>+ Import Source Block</button>
          <button className="btn-block-action" onClick={() => addBlock("transform")}>+ Transform Block</button>
          <button className="btn-block-action" onClick={() => addBlock("export")}>+ Export Sink Block</button>
          <button className="btn-block-action primary" onClick={resetDemoBlocks}>⚡ Reset Demo Blocks</button>
        </div>
      </header>

      <div className="blocks-canvas-area">
        <div className="blocks-grid-flow">
          {/* Column 1: Import Sources */}
          <div className="block-column-group">
            <div className="block-column-header">
              <span>01 · SOURCES &amp; IMPORTS</span>
              <span className="graph-stage-badge">{imports.length}</span>
            </div>
            {imports.map((b) => (
              <div key={b.id} className="block-card-item type-import">
                <div className="block-card-head">
                  <span>SOURCE PROVIDER</span>
                  <button className="tiny-button" onClick={() => removeBlock(b.id)}>×</button>
                </div>
                <div className="block-card-title"><Icon name="source" /> {b.title}</div>
                <code className="block-card-code">{b.operation}</code>
                <small className="graph-card-detail">{b.detail}</small>
                <div className="block-port-out" title="Connects to transform blocks" />
              </div>
            ))}
          </div>

          {/* Column 2: Transform / Analysis Blocks */}
          <div className="block-column-group" style={{ minWidth: 260 }}>
            <div className="block-column-header">
              <span>02 · TRANSFORM &amp; ANALYSIS</span>
              <span className="graph-stage-badge">{transforms.length}</span>
            </div>
            {transforms.map((b) => (
              <div key={b.id} className="block-card-item type-transform">
                <div className="block-card-head">
                  <span>IMPLICIT CONNECTED CAPABILITY</span>
                  <button className="tiny-button" onClick={() => removeBlock(b.id)}>×</button>
                </div>
                <div className="block-card-title"><Icon name="procedure" /> {b.title}</div>
                <code className="block-card-code">{b.operation}</code>
                <small className="graph-card-detail">{b.detail}</small>
                <div className="block-port-in" title="Receives input from upstream blocks" />
                <div className="block-port-out" title="Passes output to downstream blocks" />
              </div>
            ))}
          </div>

          {/* Column 3: Export Sinks */}
          <div className="block-column-group">
            <div className="block-column-header">
              <span>03 · PERSISTENCE &amp; EXPORT</span>
              <span className="graph-stage-badge">{exports.length}</span>
            </div>
            {exports.map((b) => (
              <div key={b.id} className="block-card-item type-export">
                <div className="block-card-head">
                  <span>DISK EXPORT SINK</span>
                  <button className="tiny-button" onClick={() => removeBlock(b.id)}>×</button>
                </div>
                <div className="block-card-title"><Icon name="save" /> {b.title}</div>
                <code className="block-card-code">{b.operation}</code>
                <small className="graph-card-detail">{b.detail}</small>
                <div className="block-port-in" title="Receives connected findings / collections" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Docs() {
  const [copiedScript, setCopiedScript] = useState(false);

  const demoScript = `# JOCKY Forensic Investigation Procedure
# Digital Forensics DSL

[prepare]
    source = evidence.import "C:\\Users\\XYLA\\Downloads\\Valora"
    working = copy source as "working_evidence"

[examine]
    artifacts = files.list working
    suspicious = filter(extension == ".zip" | ".elf" | ".exe" | ".png") from artifacts
    metadata = metadata.extract suspicious
    prefetch = prefetch.extract artifacts
    iocs = ioc.match artifacts

[analysis]
    events = events.extract from artifacts
    timeline = timeline.build from events
    findings = correlate(suspicious, metadata, events, prefetch, iocs)

[export]
    export findings > "./Outputs/findings.json"`;

  const copyScript = () => {
    void navigator.clipboard.writeText(demoScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="docs-view">
      <header className="docs-header">
        <small>EVIDRA · JOCKY DOMAIN-SPECIFIC LANGUAGE</small>
        <h1>JOCKY Specification, Rules & Capabilities</h1>
        <p>Reference guide for non-destructive digital forensic automation, deterministic lowering, and multi-vector correlation.</p>
      </header>

      {/* 1. Core Principles & Philosophy */}
      <section className="docs-section">
        <h2>1. Investigation Lifecycle & Architectural Rules</h2>
        <p>
          JOCKY structures digital forensic procedures into four deterministic stages aligned with standard forensic frameworks (NIST SP 800-86 & ISO/IEC 27037):
        </p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Investigative Scope</th>
              <th>Permitted Actions & Invariants</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>[prepare]</code></td>
              <td>Evidence Registration</td>
              <td>Read-only external source registration (<code>evidence.import</code>) and cryptographic materialization (<code>copy ... as</code>). Original evidence is never modified.</td>
            </tr>
            <tr>
              <td><code>[examine]</code></td>
              <td>Artifact Enumeration & Triage</td>
              <td>Artifact discovery (<code>files.list</code>), criteria-based narrowing (<code>filter</code>, <code>files.search</code>), and normalized metadata extraction (<code>metadata.extract</code>).</td>
            </tr>
            <tr>
              <td><code>[analysis]</code></td>
              <td>Event Reconstruction &amp; Correlation</td>
              <td>Timestamped event extraction (<code>events.extract</code>), prefetch execution analysis (<code>prefetch.extract</code>), threat IOC matching (<code>ioc.match</code>), timeline sequencing (<code>timeline.build</code>), and cross-collection correlation (<code>correlate</code>).</td>
            </tr>
            <tr>
              <td><code>[export]</code></td>
              <td>Reporting & Persistence</td>
              <td>Deterministic export of typed findings, timelines, or artifact manifests to the active workspace (<code>export &gt; "./path.json"</code>).</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 2. Standard Capability Catalog */}
      <section className="docs-section">
        <h2>2. Forensic Capability Reference Table</h2>
        <p>All JOCKY operations map to typed Investigation IR capabilities executed through auditable local providers:</p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Input Type</th>
              <th>Output Type</th>
              <th>Syntax Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>evidence.import</code></td>
              <td>String Path</td>
              <td><code>EvidenceReference</code></td>
              <td><code>source = evidence.import "C:\\path\\evidence"</code></td>
            </tr>
            <tr>
              <td><code>copy</code></td>
              <td><code>EvidenceReference</code></td>
              <td><code>EvidenceReference</code></td>
              <td><code>working = copy source as "working_evidence"</code></td>
            </tr>
            <tr>
              <td><code>hash</code></td>
              <td><code>EvidenceReference</code> | <code>ArtifactCollection</code></td>
              <td><code>IntegrityRecord</code></td>
              <td><code>hash working</code></td>
            </tr>
            <tr>
              <td><code>files.list</code></td>
              <td><code>EvidenceReference</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>artifacts = files.list working</code></td>
            </tr>
            <tr>
              <td><code>filter</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>suspicious = filter(extension == ".zip" | ".exe") from artifacts</code></td>
            </tr>
            <tr>
              <td><code>files.search</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>logs = files.search "*.log" from artifacts</code></td>
            </tr>
            <tr>
              <td><code>metadata.extract</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>MetadataCollection</code></td>
              <td><code>metadata = metadata.extract suspicious</code></td>
            </tr>
            <tr>
              <td><code>events.extract</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>EventCollection</code></td>
              <td><code>events = events.extract from artifacts</code></td>
            </tr>
            <tr>
              <td><code>prefetch.extract</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>PrefetchCollection</code></td>
              <td><code>prefetch = prefetch.extract artifacts</code></td>
            </tr>
            <tr>
              <td><code>ioc.match</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>IOCCollection</code></td>
              <td><code>iocs = ioc.match artifacts</code></td>
            </tr>
            <tr>
              <td><code>timeline.build</code></td>
              <td><code>EventCollection</code></td>
              <td><code>Timeline</code></td>
              <td><code>timeline = timeline.build from events</code></td>
            </tr>
            <tr>
              <td><code>correlate</code></td>
              <td>Multiple Collections</td>
              <td><code>FindingCollection</code></td>
              <td><code>findings = correlate(suspicious, metadata, events, prefetch, iocs)</code></td>
            </tr>
            <tr>
              <td><code>export</code></td>
              <td>Any Collection</td>
              <td><code>Export</code></td>
              <td><code>export findings &gt; "./Outputs/findings.json"</code></td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 3. Normalized Metadata Schema */}
      <section className="docs-section">
        <h2>3. Normalized Metadata Contract</h2>
        <p>
          <code>metadata.extract</code> returns a structured <code>MetadataCollection</code> populated by provider capabilities:
        </p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Namespace</th>
              <th>Target File Types</th>
              <th>Extracted Forensic Fields</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>common</code></td>
              <td>All artifacts</td>
              <td><code>name</code>, <code>relative_path</code>, <code>size_bytes</code>, <code>extension</code>, <code>sha256</code></td>
            </tr>
            <tr>
              <td><code>filesystem</code></td>
              <td>All artifacts</td>
              <td><code>modified_at</code> (ISO 8601 UTC), <code>read_only: true</code></td>
            </tr>
            <tr>
              <td><code>archive</code></td>
              <td><code>.zip</code>, compressed containers</td>
              <td><code>entries_count</code>, member listing, compressed/uncompressed sizes, encryption status, high-risk member alerts (<code>.ps1</code>, <code>.bat</code>, <code>.exe</code>, passwords)</td>
            </tr>
            <tr>
              <td><code>image</code></td>
              <td><code>.png</code>, <code>.jpg</code>, <code>.bmp</code>, <code>.gif</code></td>
              <td>Image dimensions (<code>width × height</code>), <code>aspect_ratio</code>, container format</td>
            </tr>
            <tr>
              <td><code>binary</code></td>
              <td><code>.exe</code>, <code>.dll</code>, <code>.elf</code></td>
              <td>Binary format (<code>PE/COFF</code>, <code>ELF</code>), platform, architecture (32/64-bit), magic headers</td>
            </tr>
            <tr>
              <td><code>tabular</code></td>
              <td><code>.csv</code></td>
              <td>Header column schema, row counts</td>
            </tr>
            <tr>
              <td><code>text</code></td>
              <td><code>.log</code>, <code>.txt</code>, <code>.md</code>, <code>.json</code></td>
              <td>Line counts, UTF-8 preview text snippet</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 4. Complete Presentation Script */}
      <section className="docs-section">
        <h2>4. Live Judge Demonstration Script</h2>
        <p>Copy and run this verified end-to-end investigation procedure during the demonstration:</p>
        <div className="docs-code-card">
          <button className="copy-code-floating-btn" onClick={copyScript}>
            {copiedScript ? "✓ Copied!" : "📋 Copy Script"}
          </button>
          <pre>{demoScript}</pre>
        </div>
      </section>
    </div>
  );
}

function Help() {
  return (
    <div className="placeholder">
      <small>ABOUT EVIDRA</small>
      <h1>Evidra Forensic Workstation</h1>
      <p>Evidra is a local-first digital forensics platform for forensic examination and investigation.</p>
      <p>It combines the JOCKY Domain-Specific Language, typed Investigation IR, and capability negotiation into an auditable, portable investigation workflow.</p>
    </div>
  );
}
