import { useState, useEffect } from 'react';
import { Icon, getFileIcon } from './Icon';
import { LogicalList, Empty } from './UI';
import type { FsNode, SideView, Finding, OpenDoc, CaseSnapshot } from '../types';

export function SidebarContent({
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
  const title = {
    EXPLORER: "EXPLORER",
    SOURCES: "SOURCES",
    EVIDENCE: "EVIDENCE",
    PROCEDURES: "PROCEDURES",
    RUNS: "RUNS",
    EXPORTS: "EXPORTS",
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
            <div className="side-file" key={run.id} onClick={() => onLoadRun(run.id)}>
              <Icon name="runs" />
              <span>{run.script_name || run.id} · {run.status}</span>
            </div>
          )) ?? []}
        />
      )}

      {sideView === "EXPORTS" && (
        <div className="findings-pane">
          {findings.length === 0 ? (
            <Empty text="No exports saved yet. Run JOCKY export operations to log exported results here." />
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
