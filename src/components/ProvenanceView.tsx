import React, { useState, useMemo, useRef } from "react";
import { Icon } from "./Icon";
import type { RuntimeExecutionResponse } from "../api/runtimeClient";
import type { FsNode } from "../types";

export interface ProvenanceViewProps {
  tree: FsNode[];
  response: RuntimeExecutionResponse | null;
  runHistory: { scriptName: string; docPath: string; response: RuntimeExecutionResponse }[];
  caseName?: string;
  onSelectDoc?: (path: string) => void;
  activeDocPath?: string | null;
}

interface DynamicEvidenceFile {
  id: string;
  name: string;
  path: string;
  folder: string;
  size?: number;
  isContributory: boolean;
  scriptName?: string;
}

interface DynamicExportItem {
  id: string;
  name: string;
  type: string;
  path: string;
  scriptName: string;
  format: string;
  size: string;
  generatedAt: string;
  description: string;
  recordsCount: number;
  sha256?: string;
  previewData?: any;
  inputSources: string[];
}

export function ProvenanceView({
  tree = [],
  response,
  runHistory = [],
  caseName = "Company_Investigation",
  onSelectDoc,
  activeDocPath,
}: ProvenanceViewProps) {
  const [selectedExportId, setSelectedExportId] = useState<string>("");
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"details" | "lineage" | "preview">("details");
  const [filterMode, setFilterMode] = useState<string>("all");
  const [groupByScript, setGroupByScript] = useState(true);
  const [showFileNodes, setShowFileNodes] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  // Extract all distinct script names in runHistory
  const allScriptNames = useMemo(() => {
    const set = new Set<string>();
    runHistory.forEach((r) => {
      if (r.scriptName) set.add(r.scriptName);
    });
    return Array.from(set);
  }, [runHistory]);

  const activeScriptName = useMemo(() => {
    if (activeDocPath) {
      return activeDocPath.split(/[\\/]/).pop() || null;
    }
    return response?.context?.script_name || null;
  }, [activeDocPath, response]);

  // 1. Group runs by scriptName
  const allUniqueScripts = useMemo(() => {
    const map = new Map<string, { scriptName: string; runsCount: number; stepsCount: number; lastStatus: string; docPath: string }>();
    runHistory.forEach((r) => {
      const existing = map.get(r.scriptName);
      if (!existing) {
        map.set(r.scriptName, {
          scriptName: r.scriptName,
          runsCount: 1,
          stepsCount: r.response.steps?.length || 0,
          lastStatus: r.response.status || "completed",
          docPath: r.docPath,
        });
      } else {
        existing.runsCount += 1;
        existing.stepsCount = r.response.steps?.length || existing.stepsCount;
        existing.lastStatus = r.response.status || existing.lastStatus;
      }
    });
    return Array.from(map.values());
  }, [runHistory]);

  // Apply filterMode to uniqueScripts
  const uniqueScripts = useMemo(() => {
    if (filterMode === "all") return allUniqueScripts;
    if (filterMode === "recent") {
      if (runHistory.length === 0) return [];
      const latest = runHistory[runHistory.length - 1].scriptName;
      return allUniqueScripts.filter((s) => s.scriptName === latest);
    }
    if (filterMode === "active") {
      if (!activeScriptName) return allUniqueScripts;
      return allUniqueScripts.filter((s) => s.scriptName === activeScriptName);
    }
    if (filterMode.startsWith("script:")) {
      const target = filterMode.slice("script:".length);
      return allUniqueScripts.filter((s) => s.scriptName === target);
    }
    return allUniqueScripts;
  }, [allUniqueScripts, filterMode, runHistory, activeScriptName]);

  const allowedScriptNames = useMemo(() => new Set(uniqueScripts.map((s) => s.scriptName)), [uniqueScripts]);

  // 2. Dynamically extract export artifacts across runs
  const dynamicExports = useMemo<DynamicExportItem[]>(() => {
    const list: DynamicExportItem[] = [];
    runHistory.forEach((run, rIdx) => {
      if (!allowedScriptNames.has(run.scriptName)) return;

      const results = run.response?.results || [];
      results.forEach((res, resIdx) => {
        if (res.type === "Export" && res.value && typeof res.value === "object") {
          const v = res.value as Record<string, any>;
          const dest = v.relative_path || v.destination || "export.json";
          const ext = dest.split(".").pop()?.toUpperCase() || "JSON";
          const sizeFormatted =
            typeof v.size_bytes === "number"
              ? v.size_bytes < 1024
                ? `${v.size_bytes} B`
                : `${(v.size_bytes / 1024).toFixed(1)} KB`
              : "Unknown";

          list.push({
            id: `exp-${rIdx}-${resIdx}`,
            name: dest.split(/[\\/]/).pop() || dest,
            type: `${ext} Deliverable`,
            path: v.file_path || v.destination || dest,
            scriptName: run.scriptName,
            format: ext,
            size: sizeFormatted,
            generatedAt: new Date().toLocaleTimeString(),
            description: `Forensic export artifact produced by procedure ${run.scriptName}`,
            recordsCount: typeof v.records_count === "number" ? v.records_count : 0,
            sha256: v.sha256,
            previewData: v.preview,
            inputSources: [],
          });
        }
      });
    });
    return list;
  }, [runHistory, allowedScriptNames]);

  // 3. Dynamically extract evidence files from results or tree
  const dynamicFiles = useMemo<DynamicEvidenceFile[]>(() => {
    const filesMap = new Map<string, DynamicEvidenceFile>();

    // Check ArtifactCollection results in runHistory
    runHistory.forEach((run) => {
      if (!allowedScriptNames.has(run.scriptName)) return;
      const results = run.response?.results || [];
      results.forEach((res) => {
        if (res.type === "ArtifactCollection" && Array.isArray(res.value)) {
          res.value.forEach((art: any, aIdx: number) => {
            const relPath = art.relative_path || art.name || `file_${aIdx}`;
            const cleanPath = relPath.replace(/\\/g, "/");
            const parts = cleanPath.split("/");
            const fileName = parts.pop() || cleanPath;
            const folder = parts.length > 0 ? parts.join("/") : "Evidence";

            filesMap.set(cleanPath, {
              id: `evid-f-${cleanPath}`,
              name: fileName,
              path: cleanPath,
              folder: folder,
              size: art.size_bytes,
              isContributory: true,
              scriptName: run.scriptName,
            });
          });
        }
      });
    });

    // If no artifact collection produced, look at tree for evidence files
    if (filesMap.size === 0 && tree.length > 0) {
      const walk = (nodes: FsNode[], parentFolder = "") => {
        nodes.forEach((n) => {
          if (n.kind === "file") {
            const cleanPath = n.path.replace(/\\/g, "/");
            const folder = parentFolder || "Evidence";
            filesMap.set(cleanPath, {
              id: `evid-tree-${cleanPath}`,
              name: n.name,
              path: cleanPath,
              folder: folder,
              isContributory: true,
            });
          } else if (n.kind === "directory" && n.children) {
            walk(n.children, parentFolder ? `${parentFolder}/${n.name}` : n.name);
          }
        });
      };
      walk(tree);
    }

    return Array.from(filesMap.values());
  }, [runHistory, allowedScriptNames, tree]);

  // Group dynamic files by folder
  const foldersMap = useMemo(() => {
    const map = new Map<string, DynamicEvidenceFile[]>();
    dynamicFiles.forEach((f) => {
      const list = map.get(f.folder) || [];
      list.push(f);
      map.set(f.folder, list);
    });
    return map;
  }, [dynamicFiles]);

  const folderNames = Array.from(foldersMap.keys());

  // Distinct higher-level materialized sources inside the main Evidence folder (e.g. downloads, processes, zip files)
  const evidenceRoots = useMemo(() => {
    // 1. First, search tree for the main Evidence directory
    const evidenceDir = tree.find(
      (n) => n.kind === "directory" && (n.name.toLowerCase() === "evidence" || n.name.toLowerCase() === "sources")
    ) || tree.find((n) => n.name.toLowerCase().includes("evidence") && n.kind === "directory");

    if (evidenceDir && evidenceDir.children && evidenceDir.children.length > 0) {
      // Each direct child of Evidence is a materialized source at the higher level!
      return evidenceDir.children.map((child, idx) => {
        const files: DynamicEvidenceFile[] = [];
        const collect = (node: FsNode) => {
          if (node.kind === "file") {
            files.push({
              id: `evid-${node.path}`,
              name: node.name,
              path: node.path.replace(/\\/g, "/"),
              folder: child.name,
              isContributory: true,
            });
          } else if (node.children) {
            node.children.forEach(collect);
          }
        };
        collect(child);

        return {
          id: `root-${child.name}-${idx}`,
          name: child.name,
          path: child.path.replace(/\\/g, "/"),
          files,
        };
      });
    }

    // 2. Fallback: inspect tree paths starting with Evidence/
    const sourceMap = new Map<string, DynamicEvidenceFile[]>();
    const walkTree = (nodes: FsNode[]) => {
      nodes.forEach((n) => {
        const clean = n.path.replace(/\\/g, "/");
        if (clean.toLowerCase().startsWith("evidence/")) {
          const parts = clean.split("/");
          if (parts.length >= 2) {
            const sourceName = parts[1];
            if (n.kind === "file") {
              const list = sourceMap.get(sourceName) || [];
              list.push({
                id: `evid-${clean}`,
                name: n.name,
                path: clean,
                folder: sourceName,
                isContributory: true,
              });
              sourceMap.set(sourceName, list);
            }
          }
        } else if (n.kind === "directory" && n.children) {
          walkTree(n.children);
        }
      });
    };
    walkTree(tree);

    if (sourceMap.size > 0) {
      return Array.from(sourceMap.entries()).map(([name, files], idx) => ({
        id: `root-${name}-${idx}`,
        name,
        path: `Evidence/${name}`,
        files,
      }));
    }

    // 3. Fallback to dynamicFiles grouped by the first path segment after Evidence
    if (dynamicFiles.length > 0) {
      const fallbackMap = new Map<string, DynamicEvidenceFile[]>();
      dynamicFiles.forEach((f) => {
        const clean = f.path.replace(/\\/g, "/");
        const parts = clean.split("/");
        const sourceName = parts[0].toLowerCase() === "evidence" && parts.length > 1 ? parts[1] : parts[0] || caseName;
        const list = fallbackMap.get(sourceName) || [];
        list.push(f);
        fallbackMap.set(sourceName, list);
      });

      return Array.from(fallbackMap.entries()).map(([name, files], idx) => ({
        id: `root-${name}-${idx}`,
        name,
        path: `Evidence/${name}`,
        files,
      }));
    }

    // 4. Default single node
    return [
      {
        id: "root-default",
        name: caseName.replace(/[^A-Za-z0-9_]/g, "_"),
        path: "Evidence",
        files: [],
      },
    ];
  }, [tree, dynamicFiles, caseName]);

  // Calculate dynamic vertical positions for each card and its right port
  const sourceCardLayout = useMemo(() => {
    let currentY = 56;
    return evidenceRoots.map((root) => {
      const isExpanded = expandedFolders[root.name] ?? false;
      const fileCount = root.files.length;
      const headerHeight = 52;
      const filesHeight = isExpanded && fileCount > 0 ? Math.min(fileCount * 22 + 10, 160) : 0;
      const totalHeight = headerHeight + filesHeight;
      const portY = currentY + headerHeight / 2;
      const pos = { top: currentY, portY, totalHeight };
      currentY += totalHeight + 14;
      return pos;
    });
  }, [evidenceRoots, expandedFolders]);

  const getEvidenceRootY = (rootIdx: number) => {
    if (sourceCardLayout[rootIdx]) {
      return sourceCardLayout[rootIdx].portY;
    }
    return 60 + rootIdx * 72;
  };

  const isRootConnectedToScript = (rootName: string, scriptName: string) => {
    if (evidenceRoots.length <= 1) return true;
    const rLower = rootName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const sLower = scriptName.toLowerCase().replace(/[^a-z0-9]/g, "");

    // 1. Check runHistory steps for explicit reference to rootName
    const run = runHistory.find((r) => r.scriptName === scriptName);
    if (run && run.response?.steps) {
      const touchedInSteps = run.response.steps.some((st: any) => {
        const dest = (st.destination || "").toLowerCase();
        const expr = (st.expression || "").toLowerCase();
        const inps: string[] = Array.isArray(st.inputs) ? st.inputs.map((i: any) => String(i).toLowerCase()) : [];
        return (
          dest.includes(rLower) ||
          expr.includes(rLower) ||
          inps.some((i) => i.includes(rLower))
        );
      });
      if (touchedInSteps) return true;
    }

    // 2. Check if any files in this root were processed in this script's results
    const rootItem = evidenceRoots.find((r) => r.name === rootName);
    if (rootItem && rootItem.files.some((f) => f.scriptName === scriptName)) {
      return true;
    }

    // 3. Name containment
    if (sLower.includes(rLower) || rLower.includes(sLower.replace(/\.jocky$/, ""))) {
      return true;
    }

    // 4. Semantic roles
    if (sLower.includes("host") || sLower.includes("endpoint") || sLower.includes("triage")) {
      if (rLower.includes("host") || rLower.includes("endpoint") || rLower.includes("workstation") || rLower.includes("company")) {
        return true;
      }
    }
    if (sLower.includes("perimeter") || sLower.includes("network") || sLower.includes("c2") || sLower.includes("memory") || sLower.includes("hunt")) {
      if (
        rLower.includes("net") ||
        rLower.includes("perimeter") ||
        rLower.includes("ram") ||
        rLower.includes("server") ||
        rLower.includes("dc") ||
        rLower.includes("hunt") ||
        rLower.includes("prior")
      ) {
        return true;
      }
    }
    // Cross-source enterprise correlation links to all roots
    if (sLower.includes("correlat") || sLower.includes("enterprise") || sLower.includes("matrix") || sLower.includes("apex") || sLower.includes("full")) {
      return true;
    }

    return false;
  };

  // Automatically select first export if none selected and exports exist
  const selectedExport = useMemo(() => {
    if (!dynamicExports.length) return null;
    return dynamicExports.find((e) => e.id === selectedExportId) || dynamicExports[0];
  }, [dynamicExports, selectedExportId]);

  // Detect cross-script dependencies: when a script imports an export deliverable from an upstream script
  const crossScriptFeeds = useMemo(() => {
    const feeds: {
      fromExportId: string;
      fromExportName: string;
      fromExportIdx: number;
      fromScriptName: string;
      toScriptName: string;
      toScriptIdx: number;
    }[] = [];

    uniqueScripts.forEach((toScript, toIdx) => {
      const run = runHistory.find((r) => r.scriptName === toScript.scriptName);
      if (!run || !run.response?.steps) return;

      const scriptSteps = run.response.steps;
      dynamicExports.forEach((exp, expIdx) => {
        if (exp.scriptName === toScript.scriptName) return; // ignore self
        const expNameClean = exp.name.toLowerCase();
        const baseName = expNameClean.replace(/\.[^/.]+$/, "");

        const isImported = scriptSteps.some((st: any) => {
          const dest = (st.destination || "").toLowerCase();
          const expr = (st.expression || "").toLowerCase();
          const inps = Array.isArray(st.inputs) ? st.inputs.map((i: any) => String(i).toLowerCase()) : [];
          return (
            dest.includes(expNameClean) ||
            dest.includes(baseName) ||
            expr.includes(expNameClean) ||
            expr.includes(baseName) ||
            inps.some((i: string) => i.includes(expNameClean) || i.includes(baseName))
          );
        });

        if (isImported) {
          feeds.push({
            fromExportId: exp.id,
            fromExportName: exp.name,
            fromExportIdx: expIdx,
            fromScriptName: exp.scriptName,
            toScriptName: toScript.scriptName,
            toScriptIdx: toIdx,
          });
        }
      });
    });

    return feeds;
  }, [uniqueScripts, runHistory, dynamicExports]);

  // Selective file highlighting: only files contributing to the active export or script are highlighted
  const isFileContributory = (file: DynamicEvidenceFile, rootName: string) => {
    if (!selectedExport && !selectedScriptId) return true;

    const targetScript = selectedExport ? selectedExport.scriptName : selectedScriptId;
    if (!targetScript) return true;

    if (!isRootConnectedToScript(rootName, targetScript)) return false;
    if (!selectedExport) return true;

    const expName = selectedExport.name.toLowerCase();
    const fName = file.name.toLowerCase();
    const fExt = fName.split(".").pop() || "";

    if (expName.includes("execution") || expName.includes("prefetch")) {
      return fExt === "pf" || fName.includes("payload") || fName.includes("powershell");
    }
    if (expName.includes("beacon") || expName.includes("network") || expName.includes("c2")) {
      return fExt === "pcap" || fExt === "log";
    }
    if (expName.includes("intel") || expName.includes("perimeter")) {
      return fExt === "pcap" || fExt === "raw" || fExt === "yar" || fExt === "log" || fName.includes("manifest");
    }
    return true;
  };

  // If runHistory is completely empty, show clean empty state
  if (runHistory.length === 0) {
    return (
      <div className="provenance-view-container" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "#090d14", color: "#cbd5e1" }}>
        <div className="provenance-topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", background: "#0b1118", borderBottom: "1px solid #1e293b" }}>
          <div className="topbar-left" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#38bdf8" }}>
              <Icon name="tree" /> Input-Output Lineage
            </span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "42px", color: "#38bdf8", marginBottom: "16px" }}>
            <Icon name="tree" />
          </div>
          <h3 style={{ fontSize: "17px", fontWeight: 600, color: "#f8fafc", margin: "0 0 8px" }}>
            No Evidence Lineage Available
          </h3>
          <p style={{ fontSize: "12px", color: "#94a3b8", maxWidth: "460px", lineHeight: 1.6, margin: 0 }}>
            Execute one or more JOCKY procedure scripts from the editor to automatically map input evidence sources, active procedures, and generated export artifacts.
          </p>
        </div>
      </div>
    );
  }

  // Column Gap & Dynamic Positioning State
  const [gap1, setGap1] = useState<number>(80);
  const [gap2, setGap2] = useState<number>(80);
  const col1Width = 260;
  const col2Width = 200;
  const col3Width = 220;

  // Dragging state for column gutters
  const dragRef = useRef<{ isDragging: boolean; target: "gap1" | "gap2" | null; startX: number; initialGap: number }>({
    isDragging: false,
    target: null,
    startX: 0,
    initialGap: 0,
  });

  const handleStartDrag = (target: "gap1" | "gap2", e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      isDragging: true,
      target,
      startX: e.clientX,
      initialGap: target === "gap1" ? gap1 : gap2,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current.isDragging || !dragRef.current.target) return;
      const delta = ev.clientX - dragRef.current.startX;
      const nextGap = Math.max(30, Math.min(600, dragRef.current.initialGap + delta));
      if (dragRef.current.target === "gap1") {
        setGap1(nextGap);
      } else {
        setGap2(nextGap);
      }
    };

    const onMouseUp = () => {
      dragRef.current.isDragging = false;
      dragRef.current.target = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Dynamic layout coordinates for SVG wires and columns
  // Column 1 (Evidence Hierarchy) starts at X = 0 within mapping-grid
  const col1Right = col1Width;
  const evidPortX = col1Right;
  const evidPortY = 32; // Center of Case Evidence header card

  // Column 2 (Active Procedures) starts at col1Width + gap1
  const col2Left = col1Width + gap1;
  const col2Right = col2Left + col2Width;
  const getScriptY = (sIdx: number) => 60 + sIdx * 72; // Header 16px + Gap 16px + Card/2 (28px) = 60px

  // Column 3 (Export Deliverables) starts at col2Right + gap2
  const col3Left = col2Right + gap2;
  const col3Right = col3Left + col3Width;
  const getExportY = (eIdx: number) => 60 + eIdx * 72; // Header 16px + Gap 16px + Card/2 (28px) = 60px

  const minCanvasWidth = col3Right + 60;

  return (
    <div className="provenance-view-container">
      {/* Top Controls Bar */}
      <div className="provenance-topbar">
        <div className="topbar-left">
          <label className="view-dropdown-label">
            <span>View:</span>
            <select
              className="prov-select"
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
            >
              <option value="all">All Scripts (Unified · {allUniqueScripts.length})</option>
              {runHistory.length > 0 && (
                <option value="recent">
                  Recent: {runHistory[runHistory.length - 1].scriptName}
                </option>
              )}
              {activeScriptName && (
                <option value="active">
                  Active Editor: {activeScriptName}
                </option>
              )}
              {allScriptNames.length > 1 && (
                <optgroup label="Per-Script Isolation">
                  {allScriptNames.map((name) => (
                    <option key={name} value={`script:${name}`}>
                      Script: {name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <label className="prov-checkbox-label">
            <input
              type="checkbox"
              checked={groupByScript}
              onChange={(e) => setGroupByScript(e.target.checked)}
            />
            Group by Script
          </label>

          <label className="prov-checkbox-label">
            <input
              type="checkbox"
              checked={showFileNodes}
              onChange={(e) => setShowFileNodes(e.target.checked)}
            />
            Show File Nodes
          </label>
        </div>

        <div className="prov-legend-chips">
          <span className="prov-chip cyan">
            <span className="dot cyan" /> Evidence ({dynamicFiles.length})
          </span>
          <span className="prov-chip purple">
            <span className="dot purple" /> Procedures ({uniqueScripts.length})
          </span>
          <span className="prov-chip green">
            <span className="dot green" /> Exports ({dynamicExports.length})
          </span>
        </div>

        <div className="topbar-right" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "10.5px", color: "#64748b" }}>Spacing:</span>
            <button
              className="prov-btn secondary"
              style={{ padding: "2px 6px", fontSize: "10px" }}
              onClick={() => { setGap1(40); setGap2(40); }}
              title="Compact spacing between columns"
            >
              Compact
            </button>
            <button
              className="prov-btn secondary"
              style={{ padding: "2px 6px", fontSize: "10px" }}
              onClick={() => { setGap1(80); setGap2(80); }}
              title="Standard balanced spacing"
            >
              Default
            </button>
            <button
              className="prov-btn secondary"
              style={{ padding: "2px 6px", fontSize: "10px" }}
              onClick={() => { setGap1(160); setGap2(160); }}
              title="Wide spacing for deep graph inspection"
            >
              Wide
            </button>
          </div>
          <button className="prov-btn secondary" onClick={() => { setZoomLevel(100); setGap1(80); setGap2(80); }}>
            Fit to View
          </button>
        </div>
      </div>

      {/* Main Mapping Area + Selected Item Drawer */}
      <div className="provenance-main-split" style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Graph Canvas Area */}
        <div className="provenance-canvas" style={{ zoom: `${zoomLevel}%`, flex: 1, overflow: "auto", position: "relative", padding: "24px" }}>
          <div className="canvas-header-title" style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "16px", color: "#f8fafc", margin: "0 0 4px" }}>Evidence Provenance & Data Flow</h2>
            <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>
              Lineage tracing across {filterMode === "all" ? "all procedures" : filterMode.replace("script:", "")} in <strong>{caseName}</strong>
            </p>
          </div>

          <div className="mapping-grid" style={{ display: "flex", position: "relative", minHeight: "520px", minWidth: `${minCanvasWidth}px` }}>
            {/* Column 1: Evidence Hierarchy */}
            <div className="mapping-column evidence-column" style={{ width: `${col1Width}px`, flexShrink: 0, zIndex: 2, display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", color: "#38bdf8", height: "16px", lineHeight: "16px" }}>
                Evidence Sources ({evidenceRoots.length})
              </div>

              {evidenceRoots.map((root, rIdx) => {
                const isExpanded = expandedFolders[root.name] ?? false;
                const isRootActive = selectedScriptId
                  ? isRootConnectedToScript(root.name, selectedScriptId)
                  : selectedExport
                  ? isRootConnectedToScript(root.name, selectedExport.scriptName)
                  : false;

                return (
                  <div
                    key={root.id}
                    className="evidence-root-card"
                    style={{
                      background: isRootActive ? "rgba(56, 189, 248, 0.08)" : "#0d1520",
                      border: `1px solid ${isRootActive ? "#38bdf8" : "#1e293b"}`,
                      borderRadius: "8px",
                      padding: "10px 12px",
                      position: "relative",
                      transition: "all 0.15s ease",
                      boxShadow: isRootActive ? "0 0 14px rgba(56, 189, 248, 0.22)" : "none",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        right: "-5px",
                        top: "26px",
                        transform: "translateY(-50%)",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#0d1520",
                        border: `2px solid ${isRootActive ? "#38bdf8" : "#334155"}`,
                        pointerEvents: "none",
                        zIndex: 3,
                      }}
                    />
                    <div
                      className="evidence-card-header"
                      onClick={() => toggleFolder(root.name)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
                      title={`Click to ${isExpanded ? "contract" : "expand"} ${root.name}`}
                    >
                      <div className="card-icon-title" style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                        <div className="evidence-folder-icon" style={{ color: "#38bdf8", flexShrink: 0 }}>
                          <Icon name="folder" />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong style={{ fontSize: "11px", color: "#f1f5f9", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {root.name}
                          </strong>
                          <span className="card-sub" style={{ display: "block", fontSize: "9px", color: "#64748b" }}>
                            Materialized Import
                          </span>
                        </div>
                      </div>
                      <div className="header-badges" style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                        <span className="count-pill cyan" style={{ fontSize: "9px", background: "rgba(56,189,248,0.15)", color: "#38bdf8", padding: "1px 5px", borderRadius: "3px" }}>
                          {root.files.length} file{root.files.length !== 1 ? "s" : ""}
                        </span>
                        <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: "bold", width: "10px", textAlign: "center" }}>
                          {isExpanded ? "▾" : "▸"}
                        </span>
                      </div>
                    </div>

                    {/* Files list when expanded */}
                    {isExpanded && (
                      <div
                        className="files-list"
                        style={{
                          paddingLeft: "6px",
                          marginTop: "8px",
                          borderTop: "1px solid #1e293b",
                          paddingTop: "6px",
                          maxHeight: "160px",
                          overflowY: "auto",
                        }}
                      >
                        {root.files.length === 0 ? (
                          <div style={{ fontSize: "9.5px", color: "#64748b", fontStyle: "italic", padding: "4px 0" }}>
                            Empty directory
                          </div>
                        ) : (
                          root.files.map((f) => {
                            const isContributory = isFileContributory(f, root.name);
                            return (
                              <div
                                key={f.id}
                                className={`file-item-row ${isContributory ? "contributory-active" : "file-dimmed"}`}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontSize: "9.5px",
                                  color: isContributory ? "#38bdf8" : "#475569",
                                  background: isContributory ? "rgba(56, 189, 248, 0.08)" : "transparent",
                                  borderRadius: "4px",
                                  padding: "2px 4px",
                                  margin: "1px 0",
                                  transition: "all 0.15s ease",
                                }}
                                title={f.path}
                              >
                                <span className="file-check-icon" style={{ color: isContributory ? "#38bdf8" : "#475569" }}>
                                  <Icon name="file" />
                                </span>
                                <span className="file-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                  {f.name}
                                </span>
                                {isContributory && selectedExport && (
                                  <span style={{ fontSize: "8px", color: "#10b981", fontWeight: 700, padding: "0 4px", background: "rgba(16, 185, 129, 0.15)", borderRadius: "3px" }}>
                                    CONTRIBUTORY
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Interactive Column 1 -> 2 Drag Divider Handle */}
            <div
              className="col-drag-gutter"
              onMouseDown={(e) => handleStartDrag("gap1", e)}
              style={{
                width: `${gap1}px`,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                paddingTop: "20px",
                cursor: "col-resize",
                position: "relative",
                zIndex: 4,
              }}
              title="Drag horizontally to move procedure column and stretch wires"
            >
              <div
                style={{
                  padding: "4px 8px",
                  borderRadius: "12px",
                  background: "#0d1520",
                  border: "1px solid #38bdf8",
                  color: "#38bdf8",
                  fontSize: "9.5px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  userSelect: "none",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                }}
              >
                <span>‹</span>
                <span style={{ fontFamily: "monospace" }}>{gap1}px</span>
                <span>›</span>
              </div>
            </div>

            {/* SVG Connecting Flow Lines between Column 1 -> 2 -> 3 */}
            <svg
              className="flow-lines-overlay"
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              {/* Lines from Evidence Roots -> Procedures */}
              {evidenceRoots.map((root, rIdx) => {
                const x1 = col1Right;
                const y1 = getEvidenceRootY(rIdx);

                return uniqueScripts.map((sc, sIdx) => {
                  const isConnected = isRootConnectedToScript(root.name, sc.scriptName);
                  if (!isConnected) return null;

                  const isSelectedScript = selectedScriptId === sc.scriptName || selectedExport?.scriptName === sc.scriptName;
                  const x2 = col2Left;
                  const y2 = getScriptY(sIdx);
                  const dx = x2 - x1;
                  const cx1 = x1 + dx * 0.5;
                  const cx2 = x2 - dx * 0.5;

                  return (
                    <g key={`curve-evid-${root.id}-${sc.scriptName}`}>
                      {/* Shadow / glow path if selected */}
                      {isSelectedScript && (
                        <path
                          d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth={6}
                          strokeOpacity={0.25}
                        />
                      )}
                      <path
                        d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                        stroke={isSelectedScript ? "#38bdf8" : "#334155"}
                        strokeWidth={isSelectedScript ? 2.5 : 1.5}
                        strokeOpacity={isSelectedScript ? 1 : 0.45}
                        fill="none"
                      />
                      {/* Port indicator dots physically attached to card borders */}
                      <circle cx={x1} cy={y1} r={4} fill="#0d1520" stroke="#38bdf8" strokeWidth={2} />
                      <circle cx={x2} cy={y2} r={4} fill="#0d1520" stroke="#818cf8" strokeWidth={2} />
                    </g>
                  );
                });
              })}

              {/* Lines from Procedures -> Export Deliverables */}
              {dynamicExports.map((exp, eIdx) => {
                const sIdx = uniqueScripts.findIndex((s) => s.scriptName === exp.scriptName);
                if (sIdx < 0) return null;

                const x1 = col2Right;
                const y1 = getScriptY(sIdx);
                const x2 = col3Left;
                const y2 = getExportY(eIdx);
                const dx = x2 - x1;
                const cx1 = x1 + dx * 0.5;
                const cx2 = x2 - dx * 0.5;

                const isSelected = selectedExport?.id === exp.id;
                const isSelectedParent = selectedScriptId === exp.scriptName;

                const strokeColor = isSelected ? "#10b981" : isSelectedParent ? "#38bdf8" : "#334155";
                const strokeOpacity = isSelected ? 1 : isSelectedParent ? 0.8 : 0.35;
                const strokeW = isSelected ? 3 : isSelectedParent ? 2 : 1.5;

                return (
                  <g key={`curve-script-export-${exp.id}`}>
                    {isSelected && (
                      <path
                        d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth={7}
                        strokeOpacity={0.28}
                      />
                    )}
                    <path
                      d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      strokeOpacity={strokeOpacity}
                      fill="none"
                    />
                    {/* Port indicator dots physically attached to card borders */}
                    <circle cx={x1} cy={y1} r={4} fill="#0d1520" stroke="#818cf8" strokeWidth={2} />
                    <circle cx={x2} cy={y2} r={4} fill="#0d1520" stroke="#10b981" strokeWidth={2} />
                  </g>
                );
              })}

              {/* Upstream Export -> Downstream Procedure Pipeline Feed Wires */}
              {crossScriptFeeds.map((feed) => {
                const x1 = col3Left;
                const y1 = getExportY(feed.fromExportIdx);
                const x2 = col2Right;
                const y2 = getScriptY(feed.toScriptIdx);
                const arcDx = Math.max(50, Math.abs(x1 - x2) * 0.45);
                const cx1 = x1 - arcDx;
                const cx2 = x2 + arcDx;

                const isHighlighted = selectedScriptId === feed.toScriptName || selectedExport?.id === feed.fromExportId;

                return (
                  <g key={`feed-${feed.fromExportId}-${feed.toScriptName}`}>
                    <path
                      d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                      stroke={isHighlighted ? "#f59e0b" : "rgba(245, 158, 11, 0.45)"}
                      strokeWidth={isHighlighted ? 2.5 : 1.5}
                      strokeDasharray="5,4"
                      fill="none"
                    />
                    <circle cx={x1} cy={y1} r={4.5} fill="#0d1520" stroke="#f59e0b" strokeWidth={2} />
                    <circle cx={x2} cy={y2} r={4.5} fill="#0d1520" stroke="#f59e0b" strokeWidth={2} />
                  </g>
                );
              })}
            </svg>

            {/* Column 2: Script Cards */}
            <div className="mapping-column scripts-column" style={{ width: `${col2Width}px`, flexShrink: 0, zIndex: 2, display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", color: "#818cf8", height: "16px", lineHeight: "16px" }}>
                Active Procedures ({uniqueScripts.length})
              </div>

              {uniqueScripts.map((sc) => {
                const isSelected = selectedScriptId === sc.scriptName || selectedExport?.scriptName === sc.scriptName;
                const hasInboundFeed = crossScriptFeeds.some((f) => f.toScriptName === sc.scriptName);
                return (
                  <div
                    key={sc.scriptName}
                    className={`script-flow-card ${isSelected ? "selected-script" : ""}`}
                    onClick={() => {
                      setSelectedScriptId(sc.scriptName);
                      if (onSelectDoc) onSelectDoc(sc.docPath || sc.scriptName);
                    }}
                    style={{
                      background: isSelected ? "rgba(129, 140, 248, 0.14)" : "#0d1520",
                      border: `1px solid ${isSelected ? "#818cf8" : "#1e293b"}`,
                      borderRadius: "6px",
                      padding: "10px 12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      height: "56px",
                      position: "relative",
                      boxSizing: "border-box",
                      transition: "all 0.15s ease",
                      boxShadow: isSelected ? "0 0 14px rgba(129, 140, 248, 0.25)" : "none",
                    }}
                  >
                    {/* Left input port dot */}
                    <div
                      style={{
                        position: "absolute",
                        left: "-5px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#0d1520",
                        border: "2px solid #818cf8",
                        pointerEvents: "none",
                        zIndex: 3,
                      }}
                    />
                    {/* Right output port dot */}
                    <div
                      style={{
                        position: "absolute",
                        right: "-5px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#0d1520",
                        border: `2px solid ${hasInboundFeed ? "#f59e0b" : "#818cf8"}`,
                        pointerEvents: "none",
                        zIndex: 3,
                      }}
                    />
                    <div className="script-card-icon" style={{ color: "#818cf8" }}>
                      <Icon name="bolt" />
                    </div>
                    <div className="script-card-content" style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: "block", fontSize: "11px", color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sc.scriptName}
                      </strong>
                      <span style={{ fontSize: "10px", color: "#64748b" }}>
                        {sc.stepsCount} steps · {sc.runsCount} run{sc.runsCount > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Interactive Column 2 -> 3 Drag Divider Handle */}
            <div
              className="col-drag-gutter"
              onMouseDown={(e) => handleStartDrag("gap2", e)}
              style={{
                width: `${gap2}px`,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                paddingTop: "20px",
                cursor: "col-resize",
                position: "relative",
                zIndex: 4,
              }}
              title="Drag horizontally to move exports column and stretch wires"
            >
              <div
                style={{
                  padding: "4px 8px",
                  borderRadius: "12px",
                  background: "#0d1520",
                  border: "1px solid #10b981",
                  color: "#10b981",
                  fontSize: "9.5px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  userSelect: "none",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                }}
              >
                <span>‹</span>
                <span style={{ fontFamily: "monospace" }}>{gap2}px</span>
                <span>›</span>
              </div>
            </div>

            {/* Column 3: Export Artifacts */}
            <div className="mapping-column exports-column" style={{ width: `${col3Width}px`, flexShrink: 0, zIndex: 2, display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", color: "#34d399", height: "16px", lineHeight: "16px" }}>
                Export Deliverables ({dynamicExports.length})
              </div>

              {dynamicExports.length === 0 ? (
                <div style={{ padding: "16px", background: "#0d1520", border: "1px dashed #1e293b", borderRadius: "6px", color: "#64748b", fontSize: "11px" }}>
                  No export operations recorded for this view.
                </div>
              ) : (
                dynamicExports.map((exp) => {
                  const isSelected = selectedExport?.id === exp.id;
                  return (
                    <div
                      key={exp.id}
                      className={`export-flow-card ${isSelected ? "selected-export" : ""}`}
                      onClick={() => {
                        setSelectedExportId(exp.id);
                        setSelectedScriptId(exp.scriptName);
                      }}
                      style={{
                        background: isSelected ? "rgba(16, 185, 129, 0.14)" : "#0d1520",
                        border: `1px solid ${isSelected ? "#10b981" : "#1e293b"}`,
                        borderRadius: "6px",
                        padding: "10px 12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        height: "56px",
                        position: "relative",
                        boxSizing: "border-box",
                        transition: "all 0.15s ease",
                        boxShadow: isSelected ? "0 0 14px rgba(16, 185, 129, 0.25)" : "none",
                      }}
                    >
                      {/* Left input port dot */}
                      <div
                        style={{
                          position: "absolute",
                          left: "-5px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: "#0d1520",
                          border: `2px solid ${isSelected ? "#10b981" : "#34d399"}`,
                          pointerEvents: "none",
                          zIndex: 3,
                        }}
                      />
                      <div className="export-card-icon" style={{ color: "#10b981" }}>
                        <Icon name="file" />
                      </div>
                      <div className="export-card-content" style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: "11px", color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {exp.name}
                        </strong>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>
                          {exp.type} · {exp.size} · {exp.recordsCount === 0 ? "0 records (empty)" : `${exp.recordsCount} record${exp.recordsCount > 1 ? "s" : ""}`}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right-Side Item Inspector Drawer */}
        {selectedExport && (
          <aside
            className="provenance-details-drawer"
            style={{
              width: "360px",
              background: "#0b1118",
              borderLeft: "1px solid #1e293b",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              zIndex: 10,
              boxShadow: "-4px 0 20px rgba(0,0,0,0.5)",
            }}
          >
            <header className="drawer-header" style={{ padding: "14px 16px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ color: "#10b981", fontSize: "18px" }}>
                  <Icon name="file" />
                </div>
                <div>
                  <strong style={{ display: "block", fontSize: "12px", color: "#f8fafc" }}>{selectedExport.name}</strong>
                  <span style={{ fontSize: "10px", color: "#64748b" }}>{selectedExport.type}</span>
                  <div style={{ fontSize: "9px", color: "#38bdf8", marginTop: "2px", wordBreak: "break-all" }}>{selectedExport.path}</div>
                </div>
              </div>
              <button
                className="drawer-close-btn"
                onClick={() => setSelectedExportId("")}
                title="Close Drawer"
              >
                ✕
              </button>
            </header>

            {/* Tabs: Details / Lineage / Preview */}
            <div className="drawer-tabs" style={{ display: "flex", borderBottom: "1px solid #1e293b", background: "#090d14" }}>
              <button
                className={`drawer-tab ${activeTab === "details" ? "active" : ""}`}
                onClick={() => setActiveTab("details")}
                style={{ flex: 1, padding: "8px 0", background: "transparent", border: 0, borderBottom: activeTab === "details" ? "2px solid #38bdf8" : "2px solid transparent", color: activeTab === "details" ? "#38bdf8" : "#64748b", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
              >
                Details
              </button>
              <button
                className={`drawer-tab ${activeTab === "lineage" ? "active" : ""}`}
                onClick={() => setActiveTab("lineage")}
                style={{ flex: 1, padding: "8px 0", background: "transparent", border: 0, borderBottom: activeTab === "lineage" ? "2px solid #38bdf8" : "2px solid transparent", color: activeTab === "lineage" ? "#38bdf8" : "#64748b", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
              >
                Lineage
              </button>
              <button
                className={`drawer-tab ${activeTab === "preview" ? "active" : ""}`}
                onClick={() => setActiveTab("preview")}
                style={{ flex: 1, padding: "8px 0", background: "transparent", border: 0, borderBottom: activeTab === "preview" ? "2px solid #38bdf8" : "2px solid transparent", color: activeTab === "preview" ? "#38bdf8" : "#64748b", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
              >
                Preview
              </button>
            </div>

            <div className="drawer-body" style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              {activeTab === "details" && (
                <div className="details-section" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div className="detail-meta-table" style={{ background: "#090d14", border: "1px solid #1e293b", borderRadius: "6px", padding: "10px", fontSize: "11px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Format</span>
                      <strong style={{ color: "#f8fafc" }}>{selectedExport.format}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Created By</span>
                      <strong style={{ color: "#818cf8" }}>{selectedExport.scriptName}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Records</span>
                      <strong style={{ color: selectedExport.recordsCount === 0 ? "#94a3b8" : "#f8fafc" }}>
                        {selectedExport.recordsCount === 0 ? "0 (Empty Deliverable)" : selectedExport.recordsCount}
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Size</span>
                      <strong style={{ color: "#f8fafc" }}>{selectedExport.size}</strong>
                    </div>
                    {selectedExport.sha256 && (
                      <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #1e293b" }}>
                        <span style={{ display: "block", color: "#64748b", fontSize: "10px", marginBottom: "4px" }}>SHA256 Hash</span>
                        <code style={{ fontSize: "9.5px", color: "#38bdf8", wordBreak: "break-all" }}>{selectedExport.sha256}</code>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "#cbd5e1", margin: "0 0 6px" }}>Evidence Source</h4>
                    <p style={{ fontSize: "11px", color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
                      Processed from <strong>{caseName}</strong> evidence inputs via procedure <strong>{selectedExport.scriptName}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "lineage" && (
                <div className="lineage-tree-view">
                  <div style={{ padding: "10px", background: "#090d14", border: "1px solid #1e293b", borderRadius: "6px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "10px", color: "#38bdf8", fontWeight: 600 }}>LEVEL 1: SOURCE EVIDENCE</span>
                    {evidenceRoots
                      .filter((r) => isRootConnectedToScript(r.name, selectedExport.scriptName))
                      .map((r) => (
                        <div key={r.id} style={{ fontSize: "11px", color: "#f8fafc", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ color: "#38bdf8" }}>📁</span> {r.name} ({r.files.length} artifacts)
                        </div>
                      ))}
                    {evidenceRoots.filter((r) => isRootConnectedToScript(r.name, selectedExport.scriptName)).length === 0 && (
                      <div style={{ fontSize: "11px", color: "#f8fafc", marginTop: "4px" }}>{caseName} (Raw Directory)</div>
                    )}
                  </div>

                  <div style={{ textAlign: "center", color: "#64748b", fontSize: "12px", margin: "4px 0" }}>↓</div>

                  <div style={{ padding: "10px", background: "#090d14", border: "1px solid #1e293b", borderRadius: "6px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "10px", color: "#818cf8", fontWeight: 600 }}>LEVEL 2: ACTIVE PROCEDURE</span>
                    <div style={{ fontSize: "11px", color: "#f8fafc", marginTop: "4px" }}>{selectedExport.scriptName}</div>
                  </div>

                  <div style={{ textAlign: "center", color: "#64748b", fontSize: "12px", margin: "4px 0" }}>↓</div>

                  <div style={{ padding: "10px", background: "#090d14", border: "1px solid #1e293b", borderRadius: "6px" }}>
                    <span style={{ fontSize: "10px", color: "#10b981", fontWeight: 600 }}>LEVEL 3: EXPORT DELIVERABLE</span>
                    <div style={{ fontSize: "11px", color: "#f8fafc", marginTop: "4px" }}>{selectedExport.name}</div>
                  </div>
                </div>
              )}

              {activeTab === "preview" && (
                <div className="preview-code-view">
                  {selectedExport.recordsCount === 0 || (Array.isArray(selectedExport.previewData) && selectedExport.previewData.length === 0) ? (
                    <div style={{ padding: "20px 16px", background: "#090d14", border: "1px dashed #334155", borderRadius: "6px", textAlign: "center" }}>
                      <div style={{ fontSize: "24px", marginBottom: "8px" }}>📭</div>
                      <strong style={{ display: "block", fontSize: "12px", color: "#f8fafc", marginBottom: "4px" }}>
                        Zero Matching Records (0 records)
                      </strong>
                      <p style={{ fontSize: "11px", color: "#94a3b8", lineHeight: 1.5, margin: "0 0 10px 0" }}>
                        This forensic operation executed successfully with 0 records matching the filter criteria (e.g. no .pf prefetch binaries or matching threat signatures in this evidence collection). The deliverable was serialized on disk as an empty JSON array <code>[]</code>.
                      </p>
                      <code style={{ fontSize: "10px", color: "#64748b", background: "#06090e", padding: "4px 8px", borderRadius: "4px", border: "1px solid #1e293b" }}>
                        [] (2 bytes)
                      </code>
                    </div>
                  ) : (
                    <pre style={{ margin: 0, padding: "10px", background: "#090d14", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "10.5px", color: "#cbd5e1", maxHeight: "360px", overflow: "auto", fontFamily: "monospace" }}>
                      {JSON.stringify(selectedExport.previewData ?? { file: selectedExport.name, status: "exported", records_count: selectedExport.recordsCount, sha256: selectedExport.sha256 }, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
