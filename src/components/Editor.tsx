import { useState } from 'react';
import { Icon, getFileIcon } from './Icon';
import type { View, OpenDoc } from '../types';
import type { RuntimeExecutionResponse } from '../api/runtimeClient';

export function EditorTabs({
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

export function FileEditorView({
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