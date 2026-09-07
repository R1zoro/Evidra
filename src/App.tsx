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
      sessionStorage.setItem("evidra.caseId", id);
      sessionStorage.setItem("evidra.caseName", snapshot.case?.name ?? name);
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
      (content) => {
        setOpenDocs([{ path: defaultPath, name: defaultPath, content, type: "jocky" }]);
        setActiveDocPath(defaultPath);
      },
      () => {
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
        content,
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
        const parent = parts.join("/");
        const newRel = parent ? `${parent}/${trimmed}` : trimmed;
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

        <main className="main-workspace">
          {notice && (
            <div className="notice">
              <span>{notice}</span>
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}

          {(view === "JOCKY" || view === "WORKBENCH") && (
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
          )}

          <div className="workspace-content">
            <section className="primary-view">
              {view === "JOCKY" && (
                <FileEditorView
                  doc={activeDoc}
                  onSave={saveActiveDoc}
                  onChange={updateActiveContent}
                  onRun={run}
                  onNewFile={() => setDialog({ type: "new-file", targetDir: "" })}
                />
              )}
              {view === "WORKBENCH" && (
                <Workbench
                  sourceId={snapshot?.sources?.[0]?.name ?? evidence?.name}
                  onRun={run}
                  response={response}
                  onBookmarkFinding={addFinding}
                />
              )}
              {view === "GRAPH" && <Graph response={response} />}
              {view === "BLOCKS" && <Blocks activeSource={activeDoc?.content ?? blankSource} />}
              {view === "DOCS" && <Docs />}
              {view === "HELP" && <Help />}
            </section>

            {view !== "WORKBENCH" && (
              <Results response={response} onBookmarkFinding={addFinding} />
            )}
          </div>

          <footer className="statusbar">
            <span>{caseName} · {caseRoot || "Workspace active"}</span>
            <span>JOCKY v0.1.0 · {isDesktop() ? "Desktop bridge ready" : "Local API mode"}</span>
          </footer>
        </main>
      </div>

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
}: {
  active: Menu;
  onToggle: (menu: Menu) => void;
  onAddSource: () => void;
  onNewFile: () => void;
  onView: (view: View) => void;
}) {
  const menuContent = (item: Exclude<Menu, null>) => (
    <>
      {item === "File" && (
        <>
          <button onClick={onAddSource}>Add Source Reference…</button>
          <button onClick={onNewFile}>New File…</button>
          <button onClick={() => onView("WORKBENCH")}>Open Workbench</button>
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
        <LogicalList
          empty="No source references registered. Use File → Add Source Reference to register evidence images or host roots."
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
      )}

      {sideView === "EVIDENCE" && (
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
  const result = response?.results[response.results.length - 1];
  return (
    <aside className="results-pane">
      {result ? (
        <ResultCard result={result} context={response?.context} onBookmarkFinding={onBookmarkFinding} />
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
  const values = Array.isArray(result.value) ? result.value : [result.value];
  const columns =
    values.length && typeof values[0] === "object" && values[0] !== null
      ? Object.keys(values[0] as Record<string, unknown>).slice(0, 6)
      : [];

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

      {tab === "structured" && columns.length > 0 ? (
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
      ) : (
        <pre className="result-pre">{JSON.stringify(result.value, null, 2)}</pre>
      )}

      <footer>
        <span>Source: {context?.source_reference ?? "EVID-001"}</span>
        <span>Op: {result.operation_id ?? "n/a"}</span>
      </footer>
    </div>
  );
}

function Graph({ response }: { response: RuntimeExecutionResponse | null }) {
  if (!response) {
    return (
      <div className="placeholder">
        <small>INVESTIGATION GRAPH</small>
        <h1>No Graph Lineage</h1>
        <p>Run a JOCKY procedure to trace how source evidence lowers through capabilities into typed results and findings.</p>
      </div>
    );
  }

  return (
    <div className="placeholder">
      <small>GRAPH · LINEAGE & PROVENANCE</small>
      <h1>Investigation Provenance Graph</h1>
      <p>Demonstrates data flow: <strong>Evidence Source → Operation Capability → Typed Result → Findings</strong>.</p>
      <div className="run-graph">
        <div className="graph-object source-node">
          <Icon name="evidence" />
          <strong>{response.context?.source_reference ?? "Evidence Source"}</strong>
        </div>
        {response.results.map((result) => {
          const step = response.steps.find((s) => s.operation_id === result.operation_id);
          return (
            <div className="graph-chain" key={result.id}>
              <span>→</span>
              <div className="graph-object operation-node">
                <small>OPERATION</small>
                <strong>{step?.capability ?? result.operation_id}</strong>
              </div>
              <span>→</span>
              <div className="graph-object result-node">
                <small>{result.type}</small>
                <strong>{result.id}</strong>
                <span className={`status-tag ${result.status}`}>{result.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Blocks({ activeSource }: { activeSource: string }) {
  const blocks: Array<{ name: string; operations: string[] }> = [];
  let curBlock = { name: "initial", operations: [] as string[] };

  for (const raw of activeSource.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const stageMatch = line.match(/^\[([a-zA-Z0-9_\-]+)\]$/);
    if (stageMatch) {
      if (curBlock.operations.length || curBlock.name !== "initial") {
        blocks.push(curBlock);
      }
      curBlock = { name: stageMatch[1], operations: [] };
    } else {
      curBlock.operations.push(line);
    }
  }
  if (curBlock.operations.length || curBlock.name !== "initial") {
    blocks.push(curBlock);
  }

  return (
    <div className="placeholder blocks-view-container">
      <small>BUILDING BLOCKS</small>
      <h1>Visual Workflow Preview</h1>
      <p>Dual representation: JOCKY source synchronized with Investigation IR execution stages.</p>
      <div className="blocks-canvas">
        {blocks.length === 0 ? (
          <div className="sidebar-empty">No investigation stages found in active procedure.</div>
        ) : (
          blocks.map((b, idx) => (
            <div key={b.name} className="block-stage-wrapper">
              <article className="flow-block">
                <header className="flow-block-header">
                  <span className="stage-num">0{idx + 1}</span>
                  <strong>[{b.name}]</strong>
                </header>
                <div className="flow-block-ops">
                  {b.operations.map((op, opIdx) => (
                    <div key={opIdx} className="op-chip">
                      <code>{op}</code>
                    </div>
                  ))}
                </div>
              </article>
              {idx < blocks.length - 1 && <div className="block-connector">↓</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Docs() {
  return (
    <div className="placeholder docs">
      <small>JOCKY REFERENCE</small>
      <h1>Language & Capability Contract</h1>
      <div>
        <strong>Stages & Scopes</strong>
        <code>[prepare]</code>
        <code>[examine]</code>
        <code>[analysis]</code>
        <code>[export]</code>
        <strong>Evidence Lifecycle</strong>
        <code>evidence.import "Sources/host.img" as EVID-001</code>
        <code>working = copy EVID-001 as "working"</code>
        <code>hash working</code>
        <strong>Artifacts & Filtering</strong>
        <code>artifacts = files.list working</code>
        <code>suspicious = filter(extension == ".zip" | ".elf") from artifacts</code>
        <strong>Analysis & Correlation</strong>
        <code>metadata = metadata.extract suspicious</code>
        <code>events = events.extract from artifacts</code>
        <code>findings = correlate(suspicious, metadata, events)</code>
        <strong>Exporting</strong>
        <code>export findings &gt; "./Outputs/findings.json"</code>
      </div>
    </div>
  );
}

function Help() {
  return (
    <div className="placeholder">
      <small>ABOUT EVIDRA</small>
      <h1>Evidra Forensic Workstation</h1>
      <p>Evidra is a local-first digital forensics platform designed for SIH Problem Statement 26148.</p>
      <p>It combines the JOCKY Domain-Specific Language, typed Investigation IR, and capability negotiation into an auditable, portable investigation workflow.</p>
    </div>
  );
}
