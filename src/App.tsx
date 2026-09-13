import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { LocalRuntimeClient, type CaseSnapshot, type RuntimeExecutionResponse } from "./api/runtimeClient";

import {
  type FsNode,
  type View,
  type SideView,
  type Menu,
  type DocumentType,
  type OpenDoc,
  type Finding,
  type FileDialog,
  type ContextMenu,
} from "./types";
import { getFileType, encodeFile, isDesktop } from "./utils";
import { Icon, getFileIcon } from "./components/Icon";
import { CaseGate } from "./components/CaseGate";
import { Docs } from "./components/Docs";
import { Help } from "./components/Help";
import { LogicalList, Empty, ResultEmpty } from "./components/UI";
import { Graph } from "./components/Graph";
import { Blocks } from "./components/Blocks";
import { SidebarContent, FileTree } from "./components/Sidebar";
import { EditorTabs, FileEditorView } from "./components/Editor";
import { Workbench } from "./components/Workbench";
import { Results } from "./components/Results";

export const blankSource = `# JOCKY Forensic Investigation Procedure
# Express high-level investigative intent; Evidra executes through approved providers.

[prepare]
    source = evidence.import "Sources/Evidence"
    working = copy source as "working_evidence"
    hash working

[examine]
    artifacts = files.list working
    suspicious = filter(extension == ".zip" | ".elf" | ".exe" | ".png") from artifacts
    metadata = metadata.extract suspicious

[analysis]
    events = events.extract from artifacts
    findings = correlate(suspicious, metadata, events)

[export]
    export findings > "./Outputs/findings.json"
`;



export default function App() {
  const [opened, setOpened] = useState(Boolean(sessionStorage.getItem("evidra.caseId")));
  return opened ? (
    <Workspace onSwitchCase={() => setOpened(false)} />
  ) : (
    <CaseGate onOpen={() => setOpened(true)} />
  );
}

function Workspace({ onSwitchCase }: { onSwitchCase?: () => void }) {
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
      let snap = await client.getSnapshot(caseId);
      // Restore persisted external sources from localStorage if backend restarted
      try {
        const storageKey = `evidra.sources.${caseId}`;
        const persistedRaw = localStorage.getItem(storageKey);
        if (persistedRaw) {
          const persisted: { path: string; name: string }[] = JSON.parse(persistedRaw);
          if (Array.isArray(persisted)) {
            let reloadedAny = false;
            for (const s of persisted) {
              if (s.path && !snap.sources?.some((existing) => existing.source_path === s.path)) {
                await client.registerSource(caseId, s.path, s.name).catch(() => {});
                reloadedAny = true;
              }
            }
            if (reloadedAny) {
              snap = await client.getSnapshot(caseId).catch(() => snap);
            }
          }
        } else if (snap.sources && snap.sources.length > 0) {
          const toStore = snap.sources.map((s) => ({ path: s.source_path, name: s.name }));
          localStorage.setItem(storageKey, JSON.stringify(toStore));
        }
      } catch {}

      setSnapshot(snap);
      if (snap.runs && snap.runs.length > 0 && runHistory.length === 0) {
        const latestRun = snap.runs[0];
        try {
          const run = await client.getRun(caseId, latestRun.id);
          const scriptName = latestRun.script_name || "investigation.jocky";
          setRunHistory((prev) => [...prev, { scriptName, docPath: "", response: run }]);
          setResponse(run);
        } catch {
          // ignore if individual run fetch fails
        }
      }
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
          const nodes = await caseFs.tree().catch(() => []);
          const firstFile = nodes.find((n) => n.kind === "file");
          if (firstFile) {
            const firstContent = await caseFs.readFile(firstFile.path).catch(() => "");
            setOpenDocs([{ path: firstFile.path, name: firstFile.name, content: firstContent, type: getFileType(firstFile.name) }]);
            setActiveDocPath(firstFile.path);
          } else {
            await caseFs.writeFile(defaultPath, blankSource).catch(() => {});
            setOpenDocs([{ path: defaultPath, name: defaultPath, content: blankSource, type: "jocky" }]);
            setActiveDocPath(defaultPath);
          }
        } else {
          setOpenDocs([{ path: defaultPath, name: defaultPath, content, type: "jocky" }]);
          setActiveDocPath(defaultPath);
        }
      },
      async () => {
        const nodes = await caseFs.tree().catch(() => []);
        if (nodes.length === 0) {
          await caseFs.writeFile(defaultPath, blankSource).catch(() => {});
          setOpenDocs([{ path: defaultPath, name: defaultPath, content: blankSource, type: "jocky" }]);
          setActiveDocPath(defaultPath);
        }
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

  const openOrFocusDoc = async (targetPathOrName: string) => {
    if (!targetPathOrName) return;
    const cleanTarget = targetPathOrName.replace(/\\/g, "/");
    const targetName = cleanTarget.split("/").pop() || cleanTarget;

    // 1. Check if already open in openDocs
    const existing = openDocs.find(
      (d) =>
        d.path === targetPathOrName ||
        d.path === cleanTarget ||
        d.name === targetName ||
        d.path.endsWith("/" + targetName)
    );
    if (existing) {
      setActiveDocPath(existing.path);
      setView("JOCKY");
      return;
    }

    // 2. Search case tree recursively
    const findInTree = (nodes: FsNode[]): FsNode | null => {
      for (const node of nodes) {
        const cleanNodePath = node.path.replace(/\\/g, "/");
        if (
          node.kind === "file" &&
          (cleanNodePath === cleanTarget ||
            cleanNodePath === targetPathOrName ||
            node.name === targetName ||
            cleanNodePath.endsWith("/" + targetName))
        ) {
          return node;
        }
        if (node.kind === "directory" && node.children) {
          const match = findInTree(node.children);
          if (match) return match;
        }
      }
      return null;
    };

    const treeMatch = findInTree(tree);
    if (treeMatch) {
      await openFileByNode(treeMatch);
      setView("JOCKY");
      return;
    }

    // 3. Fallback: try direct caseFs.readFile
    try {
      const content = await caseFs.readFile(cleanTarget);
      if (content !== null && content !== undefined) {
        const newDoc: OpenDoc = {
          path: cleanTarget,
          name: targetName,
          content,
          type: getFileType(targetName),
        };
        setOpenDocs((docs) => [...docs, newDoc]);
        setActiveDocPath(cleanTarget);
        setView("JOCKY");
        return;
      }
    } catch {
      // ignore read error
    }

    setNotice(`Script ${targetName} could not be located in workspace.`);
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
        try {
          const storageKey = `evidra.sources.${caseId}`;
          const currentList: { path: string; name: string }[] = JSON.parse(localStorage.getItem(storageKey) || "[]");
          if (!currentList.some((s) => s.path === sourcePath)) {
            currentList.push({ path: sourcePath, name: name.trim() });
            localStorage.setItem(storageKey, JSON.stringify(currentList));
          }
        } catch {}
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
      const scriptName = activeDocPath ? activeDocPath.split(/[/\\]/).pop() ?? "investigation.jocky" : "investigation.jocky";
      const result = await client.execute(source, evidence?.root, caseId, scriptName);
      setResponse(result);
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
      // Silently complete without forcing navigation
      // setSideView("RUNS");
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
    setNotice(`Saved finding: ${newFinding.title}`);
  };

  const switchCase = () => {
    sessionStorage.removeItem("evidra.caseId");
    sessionStorage.removeItem("evidra.caseName");
    sessionStorage.removeItem("evidra.caseRoot");
    setRunHistory([]);
    setResponse(null);
    setOpenDocs([]);
    setActiveDocPath(null);
    setFindings([]);
    setSnapshot(null);
    setTree([]);
    if (onSwitchCase) {
      onSwitchCase();
    } else {
      window.location.reload();
    }
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
              runHistory={runHistory}
              response={response}
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
              onLoadRun={async (runId: string) => {
                try {
                  const run = await client.getRun(caseId, runId);
                  const matchingRun = snapshot?.runs.find((r) => r.id === runId);
                  const scriptName = matchingRun?.script_name || (run as { script_name?: string }).script_name || "investigation.jocky";
                  setRunHistory((prev) => [...prev, { scriptName, docPath: "", response: run }]);
                  setResponse(run);
                  setSideView("EXPLORER");
                  setView("WORKBENCH");
                } catch (e) {
                  console.error("Failed to load run", e);
                }
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

          {view === "GRAPH" && (
            <Graph
              response={response}
              runHistory={runHistory}
              tree={tree}
              caseName={caseName}
              activeDocPath={activeDocPath}
              onSelectDoc={(path) => {
                void openOrFocusDoc(path);
              }}
              onRunAll={() => {
                if (activeDoc?.content) void run(activeDoc.content);
              }}
            />
          )}

          {view === "BLOCKS" && (
            <Blocks
              activeDocPath={activeDocPath}
              sourceCode={activeDoc?.content ?? blankSource}
              response={response}
              onSyncToEditor={(newSource) => {
                updateActiveContent(newSource);
                setNotice("Building blocks synchronized with editor.");
              }}
              onRunWorkflow={(code) => {
                updateActiveContent(code);
                void run(code);
              }}
            />
          )}

          {view === "DOCS" && <Docs />}

          {view === "HELP" && <Help />}
        </main>

        {view === "JOCKY" && (
          <Results
            response={response}
            runHistory={runHistory}
            activeDocPath={activeDocPath}
            onBookmarkFinding={addFinding}
          />
        )}
      </div>

      <footer className="status-bar">
        <span>Case: {caseName}</span>
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
          <button onClick={onAddSource}>Add Source Reference...</button>
          <button onClick={onNewFile}>New File...</button>
          <button onClick={() => onView("WORKBENCH")}>Open Workbench</button>
          {onSwitchCase && <button onClick={onSwitchCase} style={{ color: "#e8ad6b", fontWeight: 700 }}>Switch / Change Case Folder...</button>}
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
          {onSwitchCase && <button onClick={onSwitchCase} style={{ color: "#e8ad6b" }}>File · Switch / Change Case Folder...</button>}
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
        <button onClick={() => onToggle("More")} title="Menu">☰</button>
        {active === "More" && <div className="menu-dropdown">{menuContent("More")}</div>}
      </div>
      <div className="menu-spacer" />
      <div className="menu-search"><Icon name="search" /> Search <kbd>Ctrl K</kbd></div>
      <button className="menu-settings" onClick={() => onView("HELP")} title="About & Help"><Icon name="help" /></button>
      {isDesktop() && (
        <div className="window-controls">
          <button className="window-control-btn" onClick={() => window.evidraDesktop?.windowControl("minimize")} title="Minimize">─</button>
          <button className="window-control-btn" onClick={() => window.evidraDesktop?.windowControl("maximize")} title="Maximize">□</button>
          <button className="window-control-btn window-close" onClick={() => window.evidraDesktop?.windowControl("close")} title="Close">✕</button>
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
    ["EXPORTS", "findings", "Exports"],
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

