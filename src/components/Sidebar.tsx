import { useState, useEffect, useMemo } from 'react';
import { Icon, getFileIcon } from './Icon';
import { LogicalList, Empty } from './UI';
import type { FsNode, SideView, Finding, OpenDoc, CaseSnapshot } from '../types';
import type { RuntimeExecutionResponse } from '../api/runtimeClient';

export interface ExportItem {
  name: string;
  path: string;
  scriptName?: string;
  size?: string;
  recordsCount?: number;
  sha256?: string;
}

export function SidebarContent({
  sideView,
  tree,
  collapseKey,
  onCollapseAll,
  snapshot,
  findings,
  openDocs,
  activeDocPath,
  runHistory = [],
  response,
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
  onLoadRun,
}: {
  sideView: SideView;
  tree: FsNode[];
  collapseKey: number;
  onCollapseAll: () => void;
  snapshot: CaseSnapshot | null;
  findings: Finding[];
  openDocs: OpenDoc[];
  activeDocPath: string | null;
  runHistory?: { scriptName: string; docPath: string; response: RuntimeExecutionResponse }[];
  response?: RuntimeExecutionResponse | null;
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
  onLoadRun: (id: string) => void;
}) {
  const [exportSubTab, setExportSubTab] = useState<"deliverables" | "findings">("deliverables");

  const title = {
    EXPLORER: "EXPLORER",
    SOURCES: "SOURCES",
    EVIDENCE: "EVIDENCE",
    PROCEDURES: "PROCEDURES",
    RUNS: "RUNS",
    EXPORTS: "EXPORTS",
  }[sideView];

  // Dynamically aggregate all exports from runHistory and tree
  const exportsList = useMemo<ExportItem[]>(() => {
    const map = new Map<string, ExportItem>();

    // 1. Collect from runHistory
    runHistory.forEach((run) => {
      const results = run.response?.results || [];
      results.forEach((res) => {
        if (res.type === "Export" && res.value && typeof res.value === "object") {
          const v = res.value as Record<string, any>;
          const rel = v.relative_path || v.destination || "export.json";
          const name = rel.split(/[\\/]/).pop() || rel;
          const sizeKb = v.size_bytes !== undefined ? (v.size_bytes < 1024 ? `${v.size_bytes} B` : `${(v.size_bytes / 1024).toFixed(1)} KB`) : "";

          map.set(rel, {
            name,
            path: rel,
            scriptName: run.scriptName,
            size: sizeKb,
            recordsCount: v.records_count,
            sha256: v.sha256,
          });
        }
      });
    });

    // 2. Also check current response
    if (response) {
      const results = response.results || [];
      results.forEach((res) => {
        if (res.type === "Export" && res.value && typeof res.value === "object") {
          const v = res.value as Record<string, any>;
          const rel = v.relative_path || v.destination || "export.json";
          const name = rel.split(/[\\/]/).pop() || rel;
          const sizeKb = v.size_bytes !== undefined ? (v.size_bytes < 1024 ? `${v.size_bytes} B` : `${(v.size_bytes / 1024).toFixed(1)} KB`) : "";

          if (!map.has(rel)) {
            map.set(rel, {
              name,
              path: rel,
              scriptName: response.context?.script_name || "procedure.jocky",
              size: sizeKb,
              recordsCount: v.records_count,
              sha256: v.sha256,
            });
          }
        }
      });
    }

    // 3. Scan tree for files in Outputs/ or Exports/ folders
    const scanTree = (nodes: FsNode[]) => {
      nodes.forEach((n) => {
        if (n.kind === "file") {
          const cleanPath = n.path.replace(/\\/g, "/");
          if (cleanPath.startsWith("Outputs/") || cleanPath.startsWith("Exports/") || cleanPath.includes("/Outputs/")) {
            if (!map.has(cleanPath)) {
              map.set(cleanPath, {
                name: n.name,
                path: cleanPath,
                scriptName: "Case Export",
              });
            }
          }
        } else if (n.kind === "directory" && n.children) {
          scanTree(n.children);
        }
      });
    };
    scanTree(tree);

    return Array.from(map.values());
  }, [runHistory, response, tree]);

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
            <div className="side-file" key={run.id} onClick={() => onLoadRun(run.id)}>
              <Icon name="runs" />
              <span>{run.script_name || run.id} · {run.status}</span>
            </div>
          )) ?? []}
        />
      )}

      {sideView === "EXPORTS" && (
        <div className="exports-panel-view" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          {/* Subtabs: Deliverables vs Bookmarks */}
          <div className="export-subtabs" style={{ display: "flex", borderBottom: "1px solid #1e293b", background: "#090d14", padding: "0 8px" }}>
            <button
              style={{
                flex: 1,
                padding: "8px 4px",
                background: "transparent",
                border: 0,
                borderBottom: exportSubTab === "deliverables" ? "2px solid #10b981" : "2px solid transparent",
                color: exportSubTab === "deliverables" ? "#10b981" : "#64748b",
                fontSize: "10px",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
              onClick={() => setExportSubTab("deliverables")}
            >
              Deliverables ({exportsList.length})
            </button>
            <button
              style={{
                flex: 1,
                padding: "8px 4px",
                background: "transparent",
                border: 0,
                borderBottom: exportSubTab === "findings" ? "2px solid #38bdf8" : "2px solid transparent",
                color: exportSubTab === "findings" ? "#38bdf8" : "#64748b",
                fontSize: "10px",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
              onClick={() => setExportSubTab("findings")}
            >
              Findings ({findings.length})
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
            {exportSubTab === "deliverables" ? (
              exportsList.length === 0 ? (
                <Empty text="No exports created yet. Execute JOCKY export operations or generate reports to view deliverables here." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {exportsList.map((exp) => (
                    <article
                      key={exp.path}
                      className="export-deliverable-card"
                      style={{
                        background: "#0d1520",
                        border: "1px solid #1e293b",
                        borderRadius: "6px",
                        padding: "10px 12px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      onClick={() => onOpenFile({ name: exp.name, path: exp.path, kind: "file" })}
                      title={`Click to open ${exp.path}`}
                    >
                      <header style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <div style={{ color: "#10b981", fontSize: "14px" }}>
                          <Icon name="save" />
                        </div>
                        <strong style={{ fontSize: "11px", color: "#f8fafc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {exp.name}
                        </strong>
                        <span style={{ fontSize: "8.5px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "1px 5px", borderRadius: "3px", fontWeight: 700 }}>
                          EXPORT
                        </span>
                      </header>

                      <div style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "4px" }}>
                        <code>{exp.path}</code>
                      </div>

                      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "9px", color: "#64748b", borderTop: "1px solid #162030", paddingTop: "6px", marginTop: "6px" }}>
                        <span>{exp.scriptName ? `📄 ${exp.scriptName}` : "Case Workspace"}</span>
                        <span>{exp.size ? `${exp.size} ${exp.recordsCount ? `· ${exp.recordsCount} recs` : ""}` : "Ready"}</span>
                      </footer>
                    </article>
                  ))}
                </div>
              )
            ) : (
              findings.length === 0 ? (
                <Empty text="No bookmarks saved yet. Click the bookmark button on any result card to save findings." />
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
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function FileTree({
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
    return (
      <div className="sidebar-empty">
        <Empty text="Empty folder. Use + to create a file or folder." />
      </div>
    );
  }

  return (
    <div className="file-tree" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {nodes.map((node) => {
        const isDir = node.kind === "directory";
        const isExpanded = expanded[node.path] ?? false;

        return (
          <div key={node.path} className="tree-node">
            <div
              className={`tree-row ${isDir ? "directory" : "file"}`}
              onClick={() => {
                if (isDir) {
                  setExpanded((prev) => ({ ...prev, [node.path]: !prev[node.path] }));
                } else {
                  onOpen(node);
                }
              }}
              onContextMenu={(e) => onContextMenu(e, node)}
            >
              <span className="tree-indent-guide" />
              {isDir ? (
                <span className={`twisty ${isExpanded ? "open" : ""}`}>
                  {isExpanded ? "⌄" : "›"}
                </span>
              ) : (
                <span className="file-spacer" />
              )}
              <Icon name={isDir ? (isExpanded ? "folderOpen" : "folder") : getFileIcon(node.name, "file")} />
              <span className="node-name" title={node.name}>{node.name}</span>
            </div>

            {isDir && isExpanded && node.children && (
              <FileTree
                nodes={node.children}
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
