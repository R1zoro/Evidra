import { useState, useRef, useEffect, useCallback } from 'react';
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

interface SuggestionItem {
  label: string;
  kind: "stage" | "capability" | "snippet" | "keyword";
  insertText: string;
  detail: string;
}

const JOCKY_SUGGESTIONS: SuggestionItem[] = [
  { label: "[prepare]", kind: "stage", insertText: "[prepare]\n", detail: "Initial evidence referencing stage" },
  { label: "[examine]", kind: "stage", insertText: "[examine]\n", detail: "File enumeration and filtering stage" },
  { label: "[analysis]", kind: "stage", insertText: "[analysis]\n", detail: "Event extraction, timeline, and correlation stage" },
  { label: "[export]", kind: "stage", insertText: "[export]\n", detail: "Forensic artifact output stage" },

  { label: "evidence.import", kind: "capability", insertText: 'source = evidence.import "Sources/..."', detail: "Register reference to external evidence" },
  { label: "copy", kind: "capability", insertText: 'copy source as "Evidence/..."', detail: "Materialize evidence into case workspace" },
  { label: "files.list", kind: "capability", insertText: 'artifacts = files.list source', detail: "Enumerate all artifacts in evidence" },
  { label: "filter", kind: "capability", insertText: 'suspicious = filter(extension == ".exe" | ".ps1" | ".zip") from artifacts', detail: "Filter artifacts by extension" },
  { label: "files.search", kind: "capability", insertText: 'matches = files.search "*.log" from artifacts', detail: "Search artifacts by wildcard pattern" },
  { label: "files.inspect", kind: "capability", insertText: 'inspection = files.inspect artifacts', detail: "Inspect single artifact record" },
  { label: "metadata.extract", kind: "capability", insertText: 'metadata = metadata.extract suspicious', detail: "Extract metadata properties from files" },
  { label: "events.extract", kind: "capability", insertText: 'events = events.extract from artifacts', detail: "Extract forensic event records from files" },
  { label: "timeline.build", kind: "capability", insertText: 'timeline = timeline.build from events', detail: "Construct chronological timeline" },
  { label: "prefetch.extract", kind: "capability", insertText: 'prefetch = prefetch.extract artifacts', detail: "Parse Windows Prefetch execution artifacts" },
  { label: "yara.scan", kind: "capability", insertText: 'yara_hits = yara.scan suspicious with "threat_triage.yar"', detail: "VirusTotal YARA signature threat scan" },
  { label: "pcap.analyze", kind: "capability", insertText: 'network = pcap.analyze pcap_evidence', detail: "Wireshark / Zeek network flow & C2 analysis" },
  { label: "registry.parse", kind: "capability", insertText: 'reg = registry.parse reg_evidence', detail: "RECmd / RegRipper registry persistence analysis" },
  { label: "ioc.match", kind: "capability", insertText: 'threats = ioc.match artifacts', detail: "Match threat intelligence indicators" },
  { label: "correlate", kind: "capability", insertText: 'findings = correlate(suspicious, events, timeline)', detail: "Correlate artifacts and events into findings" },
  { label: "export", kind: "capability", insertText: 'export findings > "./Outputs/findings.json"', detail: "Export deliverables to disk" },
  { label: "hash", kind: "capability", insertText: 'hashes = hash artifacts', detail: "Compute SHA-256 integrity digests" },
];

export const FORENSIC_TEMPLATES = [
  {
    name: "Incident Triage (Full Spectrum)",
    lineage: "Multi-Tool Spectrum",
    code: `# JOCKY Forensic Investigation Procedure
# Full Spectrum Incident Triage Pipeline

[prepare]
    source = evidence.import "Evidence"
    working = copy source as "working_evidence"
    hash_record = hash working

[examine]
    artifacts = files.list working
    suspicious = filter(extension == ".exe" | ".dll" | ".ps1" | ".bat") from artifacts
    pcap_files = filter(extension == ".pcap" | ".cap" | ".pcapng") from artifacts
    reg_hives = filter(extension == ".reg" | ".dat" | ".hive") from artifacts
    pf_files = filter(extension == ".pf") from artifacts

    # 1. VirusTotal YARA signature scanning
    yara_hits = yara.scan suspicious with "default_triage.yar"

    # 2. Wireshark / Zeek PCAP network extraction & C2 beacon triage
    net_traffic = pcap.analyze pcap_files

    # 3. Eric Zimmerman RECmd / Harlan Carvey RegRipper registry persistence
    reg_persistence = registry.parse reg_hives

    # 4. Eric Zimmerman PECmd prefetch execution history parsing
    prefetch_data = prefetch.extract pf_files

[analysis]
    events = events.extract from artifacts
    timeline = timeline.build from events
    findings = correlate(suspicious, yara_hits, net_traffic, reg_persistence, prefetch_data, timeline)

[export]
    export findings > "./Outputs/incident_findings.json"
    export timeline > "./Outputs/incident_timeline.csv"
`,
  },
  {
    name: "Network Traffic & C2 Triage",
    lineage: "Wireshark / Zeek",
    code: `# JOCKY Network Forensic Procedure
# Lineage: Wireshark / Zeek Network Analysis Specification

[prepare]
    source = evidence.import "Evidence"
    working = copy source as "working_network"

[examine]
    packets = files.list working
    pcap_files = filter(extension == ".pcap" | ".cap" | ".pcapng") from packets
    network_flows = pcap.analyze pcap_files

[analysis]
    findings = correlate(pcap_files, network_flows)

[export]
    export findings > "./Outputs/network_findings.json"
`,
  },
  {
    name: "Windows Registry & Persistence Triage",
    lineage: "Eric Zimmerman RECmd / RegRipper",
    code: `# JOCKY Windows Registry Forensics Procedure
# Lineage: Eric Zimmerman RECmd / Harlan Carvey RegRipper Specification

[prepare]
    source = evidence.import "Evidence"
    working = copy source as "working_registry"

[examine]
    reg_items = files.list working
    hives = filter(extension == ".reg" | ".dat" | ".hive") from reg_items
    reg_findings = registry.parse hives

[analysis]
    findings = correlate(hives, reg_findings)

[export]
    export findings > "./Outputs/registry_persistence.json"
`,
  },
  {
    name: "Malware & YARA Signature Triage",
    lineage: "VirusTotal YARA",
    code: `# JOCKY Threat Signature Analysis Procedure
# Lineage: VirusTotal YARA Specification

[prepare]
    source = evidence.import "Evidence"
    working = copy source as "working_binaries"

[examine]
    binaries = files.list working
    suspicious = filter(extension == ".exe" | ".dll" | ".ps1" | ".bat") from binaries
    yara_hits = yara.scan suspicious with "default_triage.yar"

[analysis]
    findings = correlate(suspicious, yara_hits)

[export]
    export findings > "./Outputs/yara_triage.json"
`,
  },
  {
    name: "Execution History Triage",
    lineage: "Eric Zimmerman PECmd",
    code: `# JOCKY Prefetch Execution History Procedure
# Lineage: Eric Zimmerman PECmd Specification

[prepare]
    source = evidence.import "Evidence"
    working = copy source as "working_prefetch"

[examine]
    raw_files = files.list working
    prefetches = filter(extension == ".pf") from raw_files
    prefetch_data = prefetch.extract prefetches

[analysis]
    timeline = timeline.build from prefetch_data
    findings = correlate(prefetches, prefetch_data, timeline)

[export]
    export findings > "./Outputs/execution_history.json"
    export timeline > "./Outputs/execution_timeline.csv"
`,
  },
  {
    name: "Unified Supertimeline Reconstruction",
    lineage: "Plaso / log2timeline",
    code: `# JOCKY Unified Supertimeline Reconstruction
# Lineage: Plaso / log2timeline Methodology

[prepare]
    source = evidence.import "Evidence"
    working = copy source as "working_timeline"

[examine]
    artifacts = files.list working
    events = events.extract from artifacts

[analysis]
    timeline = timeline.build from events
    findings = correlate(artifacts, events, timeline)

[export]
    export timeline > "./Outputs/supertimeline.csv"
    export findings > "./Outputs/timeline_summary.json"
`,
  },
];

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Undo / Redo history stacks
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const lastPushedContent = useRef<string>("");

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [queryPrefix, setQueryPrefix] = useState("");

  useEffect(() => {
    if (doc) {
      if (!lastPushedContent.current) {
        lastPushedContent.current = doc.content;
      }
    }
  }, [doc]);

  const pushUndo = useCallback((newContent: string) => {
    if (lastPushedContent.current !== newContent) {
      undoStackRef.current.push(lastPushedContent.current);
      if (undoStackRef.current.length > 50) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      lastPushedContent.current = newContent;
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length > 0 && doc) {
      const prev = undoStackRef.current.pop();
      if (prev !== undefined) {
        redoStackRef.current.push(doc.content);
        lastPushedContent.current = prev;
        onChange(prev);
      }
    }
  }, [doc, onChange]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length > 0 && doc) {
      const next = redoStackRef.current.pop();
      if (next !== undefined) {
        undoStackRef.current.push(doc.content);
        lastPushedContent.current = next;
        onChange(next);
      }
    }
  }, [doc, onChange]);

  const runProcedure = async () => {
    if (!doc) return;
    setState("Running");
    try {
      const res = await onRun(doc.content);
      setState(res.status);
    } catch {
      setState("Failed");
    }
  };

  const insertSuggestion = (item: SuggestionItem) => {
    if (!textareaRef.current || !doc) return;
    const textarea = textareaRef.current;
    const pos = textarea.selectionStart;
    const content = doc.content;

    // Find word boundary before cursor
    const beforeCursor = content.slice(0, pos);
    const afterCursor = content.slice(pos);
    const lastWordMatch = beforeCursor.match(/([a-zA-Z0-9_\[\]\.]+)$/);
    const replaceLength = lastWordMatch ? lastWordMatch[1].length : 0;

    const newBefore = beforeCursor.slice(0, beforeCursor.length - replaceLength) + item.insertText;
    const newContent = newBefore + afterCursor;

    pushUndo(newContent);
    onChange(newContent);
    setShowSuggestions(false);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = newBefore.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  const handleContentChange = (newVal: string) => {
    pushUndo(newVal);
    onChange(newVal);

    if (doc?.type === "jocky" && textareaRef.current) {
      const pos = textareaRef.current.selectionStart;
      const textBefore = newVal.slice(0, pos);
      const match = textBefore.match(/([a-zA-Z0-9_\[\]\.]+)$/);

      if (match && match[1].length >= 1) {
        const query = match[1].toLowerCase();
        setQueryPrefix(query);
        const filtered = JOCKY_SUGGESTIONS.filter((s) =>
          s.label.toLowerCase().includes(query) || s.insertText.toLowerCase().includes(query)
        );
        if (filtered.length > 0) {
          setSuggestions(filtered);
          setSelectedIdx(0);
          setShowSuggestions(true);
          return;
        }
      }
    }
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 1. Shortcuts: Ctrl+Enter or F5 -> Run Procedure
    if (((e.ctrlKey || e.metaKey) && e.key === "Enter") || e.key === "F5") {
      e.preventDefault();
      void runProcedure();
      return;
    }

    // 2. Shortcut: Ctrl+S -> Save
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void onSave();
      return;
    }

    // 3. Shortcut: Ctrl+Z -> Undo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
      return;
    }

    // 4. Shortcut: Ctrl+Y or Ctrl+Shift+Z -> Redo
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
      e.preventDefault();
      handleRedo();
      return;
    }

    // 5. Autocomplete popup controls
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        insertSuggestion(suggestions[selectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }

    // 6. Tab key indentation when autocomplete is closed
    if (e.key === "Tab" && !showSuggestions) {
      e.preventDefault();
      if (!textareaRef.current || !doc) return;
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const newContent = doc.content.substring(0, start) + "    " + doc.content.substring(end);
      pushUndo(newContent);
      onChange(newContent);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 4;
        }
      }, 0);
    }
  };

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

  return (
    <div className="editor-view" style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="editor-toolbar">
        <span className="editor-toolbar-meta">
          <strong>{doc.name}</strong>
          <small>· {doc.type.toUpperCase()} · {state}</small>
          {doc.isDirty && <span className="tab-dirty-notice">(unsaved)</span>}
        </span>
        <div className="editor-toolbar-actions">
          <button className="btn-secondary" onClick={handleUndo} title="Undo (Ctrl+Z)" disabled={undoStackRef.current.length === 0}>
            ↶ Undo
          </button>
          <button className="btn-secondary" onClick={handleRedo} title="Redo (Ctrl+Y)" disabled={redoStackRef.current.length === 0}>
            ↷ Redo
          </button>
          {doc.type === "jocky" && (
            <select
              className="btn-secondary"
              style={{
                background: "#0f172a",
                color: "#94a3b8",
                border: "1px solid #334155",
                borderRadius: "4px",
                padding: "3px 8px",
                fontSize: "11px",
                cursor: "pointer",
                outline: "none",
              }}
              value=""
              onChange={(e) => {
                const tmpl = FORENSIC_TEMPLATES.find((t) => t.name === e.target.value);
                if (!tmpl || !doc) return;
                if (doc.content.trim().length > 0) {
                  if (!window.confirm(`Load template "${tmpl.name}"?\n(This will replace current editor content)`)) {
                    return;
                  }
                }
                pushUndo(tmpl.code);
                onChange(tmpl.code);
              }}
              title="Insert Forensic Template"
            >
              <option value="" disabled>📋 Templates ▾</option>
              {FORENSIC_TEMPLATES.map((tmpl) => (
                <option key={tmpl.name} value={tmpl.name} style={{ background: "#0b1118", color: "#f8fafc" }}>
                  {tmpl.name} ({tmpl.lineage})
                </option>
              ))}
            </select>
          )}
          <button className="btn-secondary" onClick={() => void onSave()} title="Save file (Ctrl+S)">
            <Icon name="save" /> Save
          </button>
          {doc.type === "jocky" && (
            <button className="btn-primary" onClick={() => void runProcedure()} title="Run Procedure (Ctrl+Enter / F5)">
              <Icon name="play" /> Run Procedure
            </button>
          )}
        </div>
      </div>

      <div style={{ position: "relative", flex: 1, display: "flex" }}>
        <textarea
          ref={textareaRef}
          className={`jocky-editor ${doc.type !== "jocky" ? "generic-text" : ""}`}
          value={doc.content}
          onChange={(e) => handleContentChange(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />

        {/* Inline Suggestion & Autocomplete Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            className="editor-autocomplete-dropdown"
            style={{
              position: "absolute",
              bottom: "20px",
              right: "24px",
              width: "380px",
              maxHeight: "260px",
              overflowY: "auto",
              background: "#0b1118",
              border: "1px solid #38bdf8",
              borderRadius: "6px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
              zIndex: 100,
              padding: "4px 0",
            }}
          >
            <div style={{ padding: "6px 12px", fontSize: "10px", color: "#64748b", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between" }}>
              <span>SUGGESTIONS for: <strong>{queryPrefix}</strong></span>
              <span>[Tab] or [Enter] to insert · [Esc] close</span>
            </div>
            {suggestions.map((item, idx) => (
              <div
                key={item.label}
                onClick={() => insertSuggestion(item)}
                style={{
                  padding: "6px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  background: idx === selectedIdx ? "rgba(56, 189, 248, 0.15)" : "transparent",
                  borderLeft: idx === selectedIdx ? "3px solid #38bdf8" : "3px solid transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: idx === selectedIdx ? "#38bdf8" : "#f1f5f9", fontWeight: 600, fontFamily: "monospace" }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>{item.detail}</span>
                </div>
                <span
                  style={{
                    fontSize: "8px",
                    textTransform: "uppercase",
                    padding: "1px 5px",
                    borderRadius: "3px",
                    background: item.kind === "stage" ? "rgba(129,140,248,0.2)" : "rgba(56,189,248,0.15)",
                    color: item.kind === "stage" ? "#818cf8" : "#38bdf8",
                  }}
                >
                  {item.kind}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
