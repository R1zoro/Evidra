import React, { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "./Icon";
import type { RuntimeExecutionResponse } from "../api/runtimeClient";

export type BlockCategory =
  | "input"
  | "preparation"
  | "examination"
  | "analysis"
  | "correlation"
  | "output"
  | "tools";

export type BlockStage = "prepare" | "examine" | "analysis" | "export";

export interface CanvasBlock {
  id: string;
  category: BlockCategory;
  title: string;
  capability: string;
  stage: BlockStage;
  x: number;
  y: number;
  outputVar: string;
  outputType: string;
  inputVars: string[];
  isCompact?: boolean;
  sources?: string[]; // for multi-source imports
  parameters: Record<string, any>;
}

export interface WireConnection {
  id: string;
  fromId: string;
  toId: string;
  color: string;
}

const CAPABILITY_DEFINITIONS: Record<
  string,
  {
    title: string;
    category: BlockCategory;
    stage: BlockStage;
    outputType: string;
    description: string;
    defaultParams: Record<string, any>;
  }
> = {
  "evidence.import": {
    title: "Import Evidence",
    category: "input",
    stage: "prepare",
    outputType: "EvidenceSource",
    description: "Registers external forensic evidence sources (folders, disk images, memory dumps).",
    defaultParams: {
      sources: ["C:\\Cases\\Evidence"],
    },
  },
  "copy": {
    title: "Materialize Copy",
    category: "preparation",
    stage: "prepare",
    outputType: "WorkingCopy",
    description: "Creates a non-destructive forensically isolated working copy of evidence.",
    defaultParams: {
      targetName: "working_evidence",
    },
  },
  "hash": {
    title: "Hash Integrity",
    category: "preparation",
    stage: "prepare",
    outputType: "HashReport",
    description: "Generates cryptographic hash verification records for chain-of-custody.",
    defaultParams: {
      algorithm: "SHA-256",
    },
  },
  "files.list": {
    title: "List Files",
    category: "examination",
    stage: "examine",
    outputType: "ArtifactList",
    description: "Enumerates all files and recursive directory entries in the target evidence.",
    defaultParams: {
      includeHidden: true,
      includeSystem: true,
    },
  },
  "filter": {
    title: "Filter Artifacts",
    category: "examination",
    stage: "examine",
    outputType: "FilteredArtifacts",
    description: "Filters evidence artifacts matching forensic extension or condition predicates.",
    defaultParams: {
      extensions: [".zip", ".exe", ".bat", ".ps1"],
      maxSizeMB: 100,
    },
  },
  "metadata.extract": {
    title: "Extract Metadata",
    category: "examination",
    stage: "examine",
    outputType: "MetadataSet",
    description: "Extracts file metadata including hashes, timestamps, size, type and extended attributes.",
    defaultParams: {
      basicMetadata: true,
      sha256: true,
      fileType: true,
      timestamps: true,
      extendedAttributes: true,
      contentSummary: false,
    },
  },
  "yara.scan": {
    title: "YARA Scan",
    category: "examination",
    stage: "examine",
    outputType: "YaraResults",
    description: "Scans evidence artifacts against signature rulesets for indicators of compromise.",
    defaultParams: {
      ruleset: "default_triage.yar",
      matchThreshold: 1,
    },
  },
  "events.extract": {
    title: "Extract Events",
    category: "analysis",
    stage: "analysis",
    outputType: "EventCollection",
    description: "Parses system, user, and execution events from discovered artifacts.",
    defaultParams: {
      extractLogonEvents: true,
      extractProcessStarts: true,
    },
  },
  "events.merge": {
    title: "Combine Metadata",
    category: "preparation",
    stage: "examine",
    outputType: "MergedDataset",
    description: "Merges multiple upstream forensic datasets into a unified examination pool.",
    defaultParams: {
      deduplicate: true,
    },
  },
  "timeline.build": {
    title: "Build Timeline",
    category: "analysis",
    stage: "analysis",
    outputType: "TimelineEvents",
    description: "Synthesizes timestamps into a chronological master investigation timeline.",
    defaultParams: {
      timeWindowHours: 48,
      alignTimezone: "UTC",
    },
  },
  "correlate": {
    title: "Correlate Findings",
    category: "correlation",
    stage: "analysis",
    outputType: "CorrelatedFindings",
    description: "Correlates multi-source forensic findings to identify attack patterns and anomalies.",
    defaultParams: {
      correlationKey: "timestamps + user_id",
      confidenceScore: 0.85,
    },
  },
  "export": {
    title: "Export Results",
    category: "output",
    stage: "export",
    outputType: "ExportReport",
    description: "Materializes verified findings and reports to a destination artifact file.",
    defaultParams: {
      format: "JSON",
      destination: "./Outputs/investigation_report.json",
    },
  },
};

const CATEGORY_COLORS: Record<BlockCategory, string> = {
  input: "#38bdf8",
  preparation: "#c084fc",
  examination: "#10b981",
  analysis: "#fb923c",
  correlation: "#f43f5e",
  output: "#0ea5e9",
  tools: "#94a3b8",
};

const CARD_WIDTH = 230;

function getCardHeight(block: CanvasBlock): number {
  if (block.isCompact) return 48;
  if (block.capability === "evidence.import") {
    const srcCount = (block.sources?.length ?? 1);
    return 100 + srcCount * 22;
  }
  if (block.inputVars.length > 1) {
    return 126;
  }
  return 112;
}

export function Blocks({
  activeDocPath,
  sourceCode: _sourceCode,
  response: _response,
  onSyncToEditor,
  onRunWorkflow,
}: {
  activeDocPath: string | null;
  sourceCode: string;
  response: RuntimeExecutionResponse | null;
  onSyncToEditor?: (updatedCode: string) => void;
  onRunWorkflow?: (code: string) => void;
}) {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [globalCompact, setGlobalCompact] = useState(false);
  const [showDslPanel, setShowDslPanel] = useState(true);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"parameters" | "general">("parameters");

  const [scriptName] = useState(
    activeDocPath ? activeDocPath.split(/[\\/]/).pop() ?? "investigation.jocky" : "investigation.jocky"
  );

  const canvasRef = useRef<HTMLDivElement>(null);

  // Initial workflow state matching reference image media_1789302097635.jpg
  const [blocks, setBlocks] = useState<CanvasBlock[]>([
    {
      id: "b-imp-1",
      category: "input",
      title: "Import Evidence",
      capability: "evidence.import",
      stage: "prepare",
      x: 60,
      y: 40,
      outputVar: "evidence_1",
      outputType: "EvidenceSource",
      inputVars: [],
      sources: ["C:\\Cases\\Laptop_1"],
      parameters: { sources: ["C:\\Cases\\Laptop_1"] },
    },
    {
      id: "b-imp-2",
      category: "input",
      title: "Import Evidence",
      capability: "evidence.import",
      stage: "prepare",
      x: 320,
      y: 40,
      outputVar: "evidence_2",
      outputType: "EvidenceSource",
      inputVars: [],
      sources: ["D:\\Forensics\\Memory"],
      parameters: { sources: ["D:\\Forensics\\Memory"] },
    },
    {
      id: "b-imp-3",
      category: "input",
      title: "Import Evidence",
      capability: "evidence.import",
      stage: "prepare",
      x: 580,
      y: 40,
      outputVar: "evidence_3",
      outputType: "EvidenceSource",
      inputVars: [],
      sources: ["E:\\Logs\\", "E:\\Registry\\"],
      parameters: { sources: ["E:\\Logs\\", "E:\\Registry\\"] },
    },
    {
      id: "b-meta-1",
      category: "examination",
      title: "Extract Metadata",
      capability: "metadata.extract",
      stage: "examine",
      x: 60,
      y: 240,
      outputVar: "metadata_1",
      outputType: "MetadataSet",
      inputVars: ["evidence_1"],
      parameters: { basicMetadata: true, sha256: true, fileType: true, timestamps: true, extendedAttributes: true },
    },
    {
      id: "b-meta-2",
      category: "examination",
      title: "Extract Metadata",
      capability: "metadata.extract",
      stage: "examine",
      x: 320,
      y: 240,
      outputVar: "metadata_2",
      outputType: "MetadataSet",
      inputVars: ["evidence_2"],
      parameters: { basicMetadata: true, sha256: true, fileType: true, timestamps: true, extendedAttributes: true },
    },
    {
      id: "b-meta-3",
      category: "examination",
      title: "Extract Metadata",
      capability: "metadata.extract",
      stage: "examine",
      x: 580,
      y: 240,
      outputVar: "metadata_3",
      outputType: "MetadataSet",
      inputVars: ["evidence_3"],
      parameters: { basicMetadata: true, sha256: true, fileType: true, timestamps: true, extendedAttributes: true },
    },
    {
      id: "b-comb-1",
      category: "preparation",
      title: "Combine Metadata",
      capability: "events.merge",
      stage: "examine",
      x: 190,
      y: 440,
      outputVar: "combined_metadata",
      outputType: "MergedDataset",
      inputVars: ["metadata_1", "metadata_2"],
      parameters: { deduplicate: true },
    },
    {
      id: "b-filt-1",
      category: "preparation",
      title: "Filter Artifacts",
      capability: "filter",
      stage: "examine",
      x: 580,
      y: 420,
      outputVar: "suspicious_files",
      outputType: "FilteredArtifacts",
      inputVars: ["metadata_3"],
      parameters: { extensions: [".zip", ".exe", ".bat", ".ps1"] },
    },
    {
      id: "b-time-1",
      category: "analysis",
      title: "Build Timeline",
      capability: "timeline.build",
      stage: "analysis",
      x: 190,
      y: 600,
      outputVar: "timeline",
      outputType: "TimelineEvents",
      inputVars: ["combined_metadata"],
      parameters: { timeWindowHours: 48 },
    },
    {
      id: "b-yara-1",
      category: "analysis",
      title: "YARA Scan",
      capability: "yara.scan",
      stage: "examine",
      x: 580,
      y: 580,
      outputVar: "yara_results",
      outputType: "YaraResults",
      inputVars: ["suspicious_files"],
      parameters: { ruleset: "default_triage.yar" },
    },
    {
      id: "b-corr-1",
      category: "correlation",
      title: "Correlate Findings",
      capability: "correlate",
      stage: "analysis",
      x: 380,
      y: 750,
      outputVar: "findings",
      outputType: "CorrelatedFindings",
      inputVars: ["timeline", "yara_results"],
      parameters: { correlationKey: "timestamps + user_id" },
    },
    {
      id: "b-exp-1",
      category: "output",
      title: "Export Results",
      capability: "export",
      stage: "export",
      x: 380,
      y: 920,
      outputVar: "investigation_report.json",
      outputType: "ExportReport",
      inputVars: ["findings"],
      parameters: { destination: "./Outputs/investigation_report.json", format: "JSON" },
    },
  ]);

  // Wire connections state
  const [connections, setConnections] = useState<WireConnection[]>([
    { id: "c-1", fromId: "b-imp-1", toId: "b-meta-1", color: "#38bdf8" },
    { id: "c-2", fromId: "b-imp-2", toId: "b-meta-2", color: "#38bdf8" },
    { id: "c-3", fromId: "b-imp-3", toId: "b-meta-3", color: "#38bdf8" },
    { id: "c-4", fromId: "b-meta-1", toId: "b-comb-1", color: "#10b981" },
    { id: "c-5", fromId: "b-meta-2", toId: "b-comb-1", color: "#10b981" },
    { id: "c-6", fromId: "b-meta-3", toId: "b-filt-1", color: "#10b981" },
    { id: "c-7", fromId: "b-comb-1", toId: "b-time-1", color: "#c084fc" },
    { id: "c-8", fromId: "b-filt-1", toId: "b-yara-1", color: "#c084fc" },
    { id: "c-9", fromId: "b-time-1", toId: "b-corr-1", color: "#fb923c" },
    { id: "c-10", fromId: "b-yara-1", toId: "b-corr-1", color: "#fb923c" },
    { id: "c-11", fromId: "b-corr-1", toId: "b-exp-1", color: "#f43f5e" },
  ]);

  // Interactive wire dragging state
  const [wireDrag, setWireDrag] = useState<{
    fromBlockId: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    color: string;
  } | null>(null);

  // Target block highlight when hovering during wire drag
  const [dropTargetBlockId, setDropTargetBlockId] = useState<string | null>(null);

  // Generate JOCKY DSL from current blocks and connections
  const generateDSL = useCallback((): string => {
    const lines: string[] = [
      "# Generated via Building Blocks",
      "# JOCKY Forensic Investigation Procedure",
      "",
    ];

    const stages: BlockStage[] = ["prepare", "examine", "analysis", "export"];
    stages.forEach((st) => {
      const stageBlocks = blocks.filter((b) => b.stage === st);
      if (stageBlocks.length > 0) {
        lines.push(`[${st}]`);
        stageBlocks.forEach((b) => {
          if (b.capability === "evidence.import") {
            const srcs = b.sources && b.sources.length > 0 ? b.sources : ["C:\\Cases\\Evidence"];
            if (srcs.length === 1) {
              lines.push(`    ${b.outputVar} = evidence.import "${srcs[0]}"`);
            } else {
              srcs.forEach((src, idx) => {
                lines.push(`    ${b.outputVar}_${idx + 1} = evidence.import "${src}"`);
              });
            }
          } else if (b.capability === "copy") {
            const inVar = b.inputVars[0] || "source";
            const tgtName = b.parameters.targetName || "working_copy";
            lines.push(`    ${b.outputVar} = copy ${inVar} as "${tgtName}"`);
          } else if (b.capability === "hash") {
            const inVar = b.inputVars[0] || "working";
            lines.push(`    ${b.outputVar} = hash ${inVar}`);
          } else if (b.capability === "files.list") {
            const inVar = b.inputVars[0] || "working";
            lines.push(`    ${b.outputVar} = files.list ${inVar}`);
          } else if (b.capability === "metadata.extract") {
            const inVar = b.inputVars[0] || "evidence_1";
            lines.push(`    ${b.outputVar} = metadata.extract ${inVar}`);
          } else if (b.capability === "events.merge") {
            const inVars = b.inputVars.join(", ") || "metadata_1, metadata_2";
            lines.push(`    ${b.outputVar} = events.merge ${inVars}`);
          } else if (b.capability === "filter") {
            const inVar = b.inputVars[0] || "artifacts";
            const exts = (b.parameters.extensions || [".zip", ".exe"])
              .map((e: string) => `"${e}"`)
              .join(" | ");
            lines.push(`    ${b.outputVar} = filter(extension == ${exts}) from ${inVar}`);
          } else if (b.capability === "yara.scan") {
            const inVar = b.inputVars[0] || "suspicious_files";
            const ruleset = b.parameters.ruleset || "default_triage.yar";
            lines.push(`    ${b.outputVar} = yara.scan ${inVar} with "${ruleset}"`);
          } else if (b.capability === "events.extract") {
            const inVar = b.inputVars[0] || "suspicious";
            lines.push(`    ${b.outputVar} = events.extract from ${inVar}`);
          } else if (b.capability === "timeline.build") {
            const inVar = b.inputVars[0] || "combined_metadata";
            lines.push(`    ${b.outputVar} = timeline.build from ${inVar}`);
          } else if (b.capability === "correlate") {
            const inVars = b.inputVars.join(", ") || "timeline, yara_results";
            lines.push(`    ${b.outputVar} = correlate(${inVars})`);
          } else if (b.capability === "export") {
            const inVar = b.inputVars[0] || "findings";
            const dest = b.parameters.destination || "./Outputs/findings.json";
            lines.push(`    export ${inVar} > "${dest}"`);
          }
        });
        lines.push("");
      }
    });

    return lines.join("\n").trimEnd();
  }, [blocks]);

  const currentDsl = generateDSL();

  // Sync with main editor whenever workflow changes
  useEffect(() => {
    if (onSyncToEditor) {
      onSyncToEditor(currentDsl);
    }
  }, [currentDsl, onSyncToEditor]);

  // Handle active wire dragging on window
  useEffect(() => {
    if (!wireDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scale = zoomLevel / 100;
      const currentX = (e.clientX - rect.left + canvasRef.current.scrollLeft) / scale;
      const currentY = (e.clientY - rect.top + canvasRef.current.scrollTop) / scale;

      setWireDrag((prev) => (prev ? { ...prev, currentX, currentY } : null));

      // Hit-test target block
      const target = blocks.find((b) => {
        if (b.id === wireDrag.fromBlockId) return false;
        const bH = getCardHeight(b);
        return (
          currentX >= b.x &&
          currentX <= b.x + CARD_WIDTH &&
          currentY >= b.y &&
          currentY <= b.y + bH
        );
      });

      setDropTargetBlockId(target ? target.id : null);
    };

    const handleMouseUp = () => {
      if (dropTargetBlockId && wireDrag) {
        const fromBlock = blocks.find((b) => b.id === wireDrag.fromBlockId);
        const toBlock = blocks.find((b) => b.id === dropTargetBlockId);

        if (fromBlock && toBlock && fromBlock.id !== toBlock.id) {
          // Check if connection already exists
          const exists = connections.some(
            (c) => c.fromId === fromBlock.id && c.toId === toBlock.id
          );

          if (!exists) {
            const newConn: WireConnection = {
              id: `conn-${Date.now().toString(36)}`,
              fromId: fromBlock.id,
              toId: toBlock.id,
              color: CATEGORY_COLORS[fromBlock.category] || "#38bdf8",
            };

            setConnections((prev) => [...prev, newConn]);

            // Automatically bind the output variable to the target block's input
            setBlocks((prev) =>
              prev.map((b) => {
                if (b.id !== toBlock.id) return b;
                const updatedInputs = b.inputVars.includes(fromBlock.outputVar)
                  ? b.inputVars
                  : [...b.inputVars, fromBlock.outputVar];
                return { ...b, inputVars: updatedInputs };
              })
            );
          }
        }
      }

      setWireDrag(null);
      setDropTargetBlockId(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [wireDrag, dropTargetBlockId, blocks, connections, zoomLevel]);

  // Start wire drag from a block's bottom port
  const startWireDrag = (block: CanvasBlock, e: React.MouseEvent) => {
    e.stopPropagation();
    const bHeight = getCardHeight(block);
    const startX = block.x + CARD_WIDTH / 2;
    const startY = block.y + bHeight;

    setWireDrag({
      fromBlockId: block.id,
      startX,
      startY,
      currentX: startX,
      currentY: startY + 20,
      color: CATEGORY_COLORS[block.category] || "#38bdf8",
    });
  };

  // Add a new block to the canvas
  const addBlock = (cat: BlockCategory) => {
    const id = `b-${Date.now().toString(36).slice(-4)}`;
    let capKey = "evidence.import";

    if (cat === "input") capKey = "evidence.import";
    else if (cat === "preparation") capKey = "copy";
    else if (cat === "examination") capKey = "metadata.extract";
    else if (cat === "analysis") capKey = "timeline.build";
    else if (cat === "correlation") capKey = "correlate";
    else if (cat === "output") capKey = "export";

    const def = CAPABILITY_DEFINITIONS[capKey];
    const suffix = id.slice(-2);
    const outputVar = `${def.outputType.toLowerCase()}_${suffix}`;

    const newBlock: CanvasBlock = {
      id,
      category: cat,
      title: def.title,
      capability: capKey,
      stage: def.stage,
      outputVar,
      outputType: def.outputType,
      inputVars: [],
      x: 180 + (blocks.length % 4) * 60,
      y: 120 + (blocks.length % 4) * 60,
      sources: cat === "input" ? ["C:\\Cases\\NewEvidence"] : undefined,
      parameters: { ...def.defaultParams },
    };

    setBlocks((prev) => [...prev, newBlock]);
    setSelectedBlockId(id);
  };

  // Delete block and its wires
  const deleteBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    setConnections((prev) =>
      prev.filter((c) => c.fromId !== blockId && c.toId !== blockId)
    );
    if (selectedBlockId === blockId) setSelectedBlockId(null);
  };

  // Add source to an import block
  const addSourceToImport = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const srcs = b.sources ? [...b.sources, `C:\\Cases\\Source_${b.sources.length + 1}`] : ["C:\\Cases\\Evidence"];
        return { ...b, sources: srcs };
      })
    );
  };

  // Update a source path
  const updateSourcePath = (blockId: string, idx: number, val: string) => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId || !b.sources) return b;
        const newSrcs = [...b.sources];
        newSrcs[idx] = val;
        return { ...b, sources: newSrcs };
      })
    );
  };

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  return (
    <div className="blocks-full-view">
      {/* Top Controls Toolbar */}
      <div className="blocks-top-toolbar">
        <div className="toolbar-left-group">
          <span className="toolbar-section-label">
            <strong>Blocks</strong> <small>Drag to canvas</small>
          </span>

          <div className="category-pills-row">
            <button
              className="category-pill"
              onClick={() => addBlock("input")}
              style={{ color: "#38bdf8", borderColor: "#38bdf8" }}
            >
              + Import
            </button>
            <button
              className="category-pill"
              onClick={() => addBlock("preparation")}
              style={{ color: "#c084fc", borderColor: "#c084fc" }}
            >
              + Preparation
            </button>
            <button
              className="category-pill"
              onClick={() => addBlock("examination")}
              style={{ color: "#10b981", borderColor: "#10b981" }}
            >
              + Examination
            </button>
            <button
              className="category-pill"
              onClick={() => addBlock("analysis")}
              style={{ color: "#fb923c", borderColor: "#fb923c" }}
            >
              + Analysis
            </button>
            <button
              className="category-pill"
              onClick={() => addBlock("correlation")}
              style={{ color: "#f43f5e", borderColor: "#f43f5e" }}
            >
              + Correlation
            </button>
            <button
              className="category-pill"
              onClick={() => addBlock("output")}
              style={{ color: "#0ea5e9", borderColor: "#0ea5e9" }}
            >
              + Output
            </button>
          </div>
        </div>

        <div className="blocks-action-btns">
          <button
            className="btn-action-secondary"
            onClick={() => {
              setBlocks([]);
              setConnections([]);
              setSelectedBlockId(null);
            }}
            title="Clear all blocks"
          >
            ✕ Clear
          </button>
          <button
            className="btn-action-secondary"
            onClick={() => setGlobalCompact(!globalCompact)}
            title={globalCompact ? "Expand All Blocks" : "Compact All Blocks"}
          >
            {globalCompact ? "⇲ Expand" : "⇱ Compact"}
          </button>
          <button
            className="btn-action-secondary"
            onClick={() => setShowDslPanel(!showDslPanel)}
            title="Toggle DSL Code Preview"
          >
            {showDslPanel ? "Hide DSL" : "Show DSL"}
          </button>
          <button
            className="btn-action-primary"
            onClick={() => onSyncToEditor?.(currentDsl)}
          >
            <Icon name="save" /> Save
          </button>
          <button
            className="btn-action-primary"
            onClick={() => onRunWorkflow?.(currentDsl)}
          >
            ▶ Run Workflow
          </button>
        </div>
      </div>

      {/* Main Workspace Split */}
      <div className="blocks-workspace-split">
        {/* Canvas Area */}
        <div className="blocks-canvas-area" ref={canvasRef}>
          <div
            className="blocks-canvas-grid"
            style={{
              zoom: `${zoomLevel}%`,
              minHeight: "1400px",
              minWidth: "1800px",
              position: "relative",
            }}
          >
            {/* SVG Wires Layer (Mathematically Exact Coordinates) */}
            <svg
              aria-hidden="true"
              style={{
                width: "100%",
                height: "100%",
                position: "absolute",
                top: 0,
                left: 0,
                pointerEvents: "none",
                zIndex: 2,
              }}
            >
              {/* Existing Wire Connections */}
              {connections.map((conn) => {
                const fromB = blocks.find((b) => b.id === conn.fromId);
                const toB = blocks.find((b) => b.id === conn.toId);
                if (!fromB || !toB) return null;

                const fromH = getCardHeight(fromB);
                const x1 = fromB.x + CARD_WIDTH / 2;
                const y1 = fromB.y + fromH;
                const x2 = toB.x + CARD_WIDTH / 2;
                const y2 = toB.y;

                const midY = y1 + Math.max(30, (y2 - y1) * 0.5);
                const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

                return (
                  <g key={conn.id} className="wire-group">
                    {/* Background glow stroke */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={conn.color}
                      strokeWidth="6"
                      strokeOpacity="0.2"
                    />
                    {/* Main wire line */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={conn.color}
                      strokeWidth="2.5"
                      className="bezier-wire-smooth"
                    />
                  </g>
                );
              })}

              {/* Active Wire being dragged */}
              {wireDrag && (
                <path
                  d={`M ${wireDrag.startX} ${wireDrag.startY} C ${wireDrag.startX} ${
                    wireDrag.startY + 50
                  }, ${wireDrag.currentX} ${wireDrag.currentY - 50}, ${
                    wireDrag.currentX
                  } ${wireDrag.currentY}`}
                  fill="none"
                  stroke={wireDrag.color}
                  strokeWidth="3"
                  strokeDasharray="6,4"
                  className="active-wire-drag"
                />
              )}
            </svg>

            {/* Block Cards Layer */}
            <div
              className="blocks-dag-container"
              style={{ position: "relative", zIndex: 3, width: "100%", height: "100%" }}
            >
              {blocks.length === 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "35%",
                    left: "40%",
                    transform: "translate(-50%, -50%)",
                    color: "#64748b",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "42px", color: "#38bdf8" }}>
                    <Icon name="blocks" />
                  </div>
                  <h3 style={{ marginTop: "12px", color: "#f8fafc", fontSize: "16px" }}>
                    Canvas is Empty
                  </h3>
                  <p style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Click any + category button above to add forensic nodes, or drag output ports to connect workflows.
                  </p>
                </div>
              )}

              {blocks.map((block) => {
                const isCompact = globalCompact || block.isCompact;
                const isSelected = selectedBlockId === block.id;
                const isDropTarget = dropTargetBlockId === block.id;
                const cardH = getCardHeight(block);
                const catColor = CATEGORY_COLORS[block.category] || "#38bdf8";

                return (
                  <div
                    key={block.id}
                    className={`canvas-block-card ${isCompact ? "compact" : ""} ${
                      isSelected ? "selected" : ""
                    } ${isDropTarget ? "drop-target" : ""}`}
                    style={{
                      position: "absolute",
                      left: block.x,
                      top: block.y,
                      width: `${CARD_WIDTH}px`,
                      height: `${cardH}px`,
                      cursor: "grab",
                      borderColor: isSelected ? "#38bdf8" : isDropTarget ? "#10b981" : "#1e293b",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlockId(block.id);
                    }}
                    onMouseDown={(e) => {
                      if (
                        (e.target as HTMLElement).tagName === "BUTTON" ||
                        (e.target as HTMLElement).tagName === "INPUT" ||
                        (e.target as HTMLElement).classList.contains("block-port")
                      ) {
                        return;
                      }

                      const startMouseX = e.clientX;
                      const startMouseY = e.clientY;
                      const startX = block.x;
                      const startY = block.y;
                      const scale = zoomLevel / 100;

                      const onMouseMove = (moveEvent: MouseEvent) => {
                        const dx = (moveEvent.clientX - startMouseX) / scale;
                        const dy = (moveEvent.clientY - startMouseY) / scale;
                        setBlocks((prev) =>
                          prev.map((b) =>
                            b.id === block.id ? { ...b, x: Math.max(10, startX + dx), y: Math.max(10, startY + dy) } : b
                          )
                        );
                      };

                      const onMouseUp = () => {
                        window.removeEventListener("mousemove", onMouseMove);
                        window.removeEventListener("mouseup", onMouseUp);
                      };

                      window.addEventListener("mousemove", onMouseMove);
                      window.addEventListener("mouseup", onMouseUp);
                    }}
                  >
                    {/* Top Input Port (All nodes except initial imports) */}
                    {block.capability !== "evidence.import" && (
                      <div
                        className="block-port port-top"
                        title="Input Port (Drop wire here to connect)"
                        style={{
                          backgroundColor: isDropTarget ? "#10b981" : "#38bdf8",
                          boxShadow: isDropTarget ? "0 0 8px #10b981" : "0 0 6px #38bdf8",
                        }}
                      />
                    )}

                    {/* Card Header */}
                    <div className="block-card-header">
                      <div
                        className="block-category-icon-badge"
                        style={{
                          backgroundColor: `${catColor}22`,
                          color: catColor,
                        }}
                      >
                        <Icon
                          name={
                            block.category === "input"
                              ? "folder"
                              : block.category === "examination"
                              ? "file"
                              : block.category === "analysis"
                              ? "graph"
                              : block.category === "output"
                              ? "save"
                              : "gear"
                          }
                        />
                      </div>

                      <div className="block-header-info">
                        <span className="block-card-title">{block.title}</span>
                        <span className="block-card-subtitle">{block.capability}</span>
                      </div>

                      <div className="block-header-actions">
                        <button
                          className="btn-card-menu"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBlock(block.id);
                          }}
                          title="Delete Node"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Card Body */}
                    {!isCompact && (
                      <div className="block-card-body">
                        {/* Import Node: Multi-Source Support */}
                        {block.capability === "evidence.import" && (
                          <div className="card-import-sources">
                            <span className="sources-label">
                              Sources ({block.sources?.length ?? 1}):
                            </span>
                            {(block.sources ?? ["C:\\Cases\\Evidence"]).map((src, idx) => (
                              <input
                                key={idx}
                                className="source-path-input"
                                value={src}
                                onChange={(e) => updateSourcePath(block.id, idx, e.target.value)}
                              />
                            ))}
                            <button
                              className="btn-add-source"
                              onClick={(e) => {
                                e.stopPropagation();
                                addSourceToImport(block.id);
                              }}
                            >
                              + Add Source
                            </button>
                          </div>
                        )}

                        {/* Standard Functional Nodes */}
                        {block.capability !== "evidence.import" && (
                          <div className="card-ports-summary">
                            <div className="port-summary-row">
                              <span className="summary-label">
                                {block.inputVars.length > 1 ? "Inputs:" : "Input:"}
                              </span>
                              <span className="summary-value input-pill">
                                {block.inputVars.length > 0
                                  ? block.inputVars.join(", ")
                                  : "(none connected)"}
                              </span>
                            </div>
                            <div className="port-summary-row">
                              <span className="summary-label">Output:</span>
                              <span className="summary-value output-pill">
                                {block.outputVar}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bottom Output Port (Drag wire from here) */}
                    <div
                      className="block-port port-bottom"
                      title="Output Port (Drag wire to connect next block)"
                      style={{
                        backgroundColor: catColor,
                        boxShadow: `0 0 8px ${catColor}`,
                      }}
                      onMouseDown={(e) => startWireDrag(block, e)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Minimap in Bottom-Left */}
          <div className="canvas-minimap-float">
            <div className="minimap-preview-box">
              {blocks.map((b) => (
                <div
                  key={b.id}
                  className="minimap-dot"
                  style={{
                    left: `${(b.x / 1800) * 100}%`,
                    top: `${(b.y / 1400) * 100}%`,
                    backgroundColor: CATEGORY_COLORS[b.category] || "#38bdf8",
                  }}
                />
              ))}
            </div>
            <span className="minimap-legend">Evidra DAG</span>
          </div>

          {/* Zoom Controls in Bottom-Right */}
          <div className="canvas-zoom-float">
            <button
              className="zoom-btn"
              onClick={() => setZoomLevel((z) => Math.max(z - 10, 40))}
            >
              -
            </button>
            <span className="zoom-text">{zoomLevel}%</span>
            <button
              className="zoom-btn"
              onClick={() => setZoomLevel((z) => Math.min(z + 10, 150))}
            >
              +
            </button>
            <button
              className="zoom-btn"
              onClick={() => setZoomLevel(100)}
              title="Reset Zoom"
            >
              [ ]
            </button>
          </div>
        </div>

        {/* Right-Hand "Block Details" Inspector Drawer (Matching Image 2) */}
        {selectedBlock ? (
          <div className="block-details-drawer">
            <div className="drawer-header">
              <div className="drawer-title-group">
                <div
                  className="drawer-icon-box"
                  style={{
                    backgroundColor: `${CATEGORY_COLORS[selectedBlock.category]}22`,
                    color: CATEGORY_COLORS[selectedBlock.category],
                  }}
                >
                  <Icon name="gear" />
                </div>
                <div>
                  <h3 className="drawer-title">{selectedBlock.title}</h3>
                  <span className="drawer-subtitle">{selectedBlock.capability}</span>
                </div>
              </div>

              <button
                className="btn-close-drawer"
                onClick={() => setSelectedBlockId(null)}
                title="Close Details"
              >
                ✕
              </button>
            </div>

            <p className="drawer-description">
              {CAPABILITY_DEFINITIONS[selectedBlock.capability]?.description ||
                "Configures parameters and execution behavior for this forensic capability."}
            </p>

            {/* Tabs: Parameters / General */}
            <div className="drawer-tabs">
              <button
                className={`drawer-tab-btn ${activeTab === "parameters" ? "active" : ""}`}
                onClick={() => setActiveTab("parameters")}
              >
                Parameters
              </button>
              <button
                className={`drawer-tab-btn ${activeTab === "general" ? "active" : ""}`}
                onClick={() => setActiveTab("general")}
              >
                General
              </button>
            </div>

            <div className="drawer-body-scroll">
              {activeTab === "parameters" && (
                <div className="drawer-section">
                  {/* Connected Input variables */}
                  <div className="form-group">
                    <label className="form-label">Connected Input</label>
                    <div className="input-tags-row">
                      {selectedBlock.inputVars.length > 0 ? (
                        selectedBlock.inputVars.map((v) => (
                          <span key={v} className="variable-tag">
                            ● {v}
                          </span>
                        ))
                      ) : (
                        <span className="no-input-note">
                          No upstream input connected. Drag a wire from an output port to link.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Capability-Specific Parameter Controls */}
                  {selectedBlock.capability === "metadata.extract" && (
                    <div className="form-group">
                      <label className="form-label">Extract Features</label>
                      <div className="checkbox-list">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.basicMetadata ?? true}
                            onChange={(e) =>
                              setBlocks((prev) =>
                                prev.map((b) =>
                                  b.id === selectedBlock.id
                                    ? {
                                        ...b,
                                        parameters: {
                                          ...b.parameters,
                                          basicMetadata: e.target.checked,
                                        },
                                      }
                                    : b
                                )
                              )
                            }
                          />
                          Basic Metadata
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.sha256 ?? true}
                            onChange={(e) =>
                              setBlocks((prev) =>
                                prev.map((b) =>
                                  b.id === selectedBlock.id
                                    ? {
                                        ...b,
                                        parameters: {
                                          ...b.parameters,
                                          sha256: e.target.checked,
                                        },
                                      }
                                    : b
                                )
                              )
                            }
                          />
                          Hash (SHA-256)
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.fileType ?? true}
                            onChange={(e) =>
                              setBlocks((prev) =>
                                prev.map((b) =>
                                  b.id === selectedBlock.id
                                    ? {
                                        ...b,
                                        parameters: {
                                          ...b.parameters,
                                          fileType: e.target.checked,
                                        },
                                      }
                                    : b
                                )
                              )
                            }
                          />
                          File Type
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.timestamps ?? true}
                            onChange={(e) =>
                              setBlocks((prev) =>
                                prev.map((b) =>
                                  b.id === selectedBlock.id
                                    ? {
                                        ...b,
                                        parameters: {
                                          ...b.parameters,
                                          timestamps: e.target.checked,
                                        },
                                      }
                                    : b
                                )
                              )
                            }
                          />
                          Timestamps
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.extendedAttributes ?? true}
                            onChange={(e) =>
                              setBlocks((prev) =>
                                prev.map((b) =>
                                  b.id === selectedBlock.id
                                    ? {
                                        ...b,
                                        parameters: {
                                          ...b.parameters,
                                          extendedAttributes: e.target.checked,
                                        },
                                      }
                                    : b
                                )
                              )
                            }
                          />
                          Extended Attributes
                        </label>
                      </div>
                    </div>
                  )}

                  {selectedBlock.capability === "filter" && (
                    <div className="form-group">
                      <label className="form-label">Extension Predicates</label>
                      <input
                        className="form-text-input"
                        value={(selectedBlock.parameters.extensions || []).join(" | ")}
                        onChange={(e) => {
                          const exts = e.target.value.split("|").map((s) => s.trim());
                          setBlocks((prev) =>
                            prev.map((b) =>
                              b.id === selectedBlock.id
                                ? { ...b, parameters: { ...b.parameters, extensions: exts } }
                                : b
                            )
                          );
                        }}
                      />
                    </div>
                  )}

                  {selectedBlock.capability === "export" && (
                    <div className="form-group">
                      <label className="form-label">Destination Path</label>
                      <input
                        className="form-text-input"
                        value={selectedBlock.parameters.destination || "./Outputs/findings.json"}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBlocks((prev) =>
                            prev.map((b) =>
                              b.id === selectedBlock.id
                                ? { ...b, parameters: { ...b.parameters, destination: val } }
                                : b
                            )
                          );
                        }}
                      />
                    </div>
                  )}

                  {/* Output Variable Configuration */}
                  <div className="form-group" style={{ marginTop: "16px" }}>
                    <label className="form-label">Output Variable</label>
                    <input
                      className="form-text-input"
                      value={selectedBlock.outputVar}
                      onChange={(e) => {
                        const newOut = e.target.value.trim();
                        setBlocks((prev) =>
                          prev.map((b) =>
                            b.id === selectedBlock.id ? { ...b, outputVar: newOut } : b
                          )
                        );
                      }}
                    />
                    <span className="output-type-badge">
                      Type: {selectedBlock.outputType}
                    </span>
                  </div>

                  {/* Run Block Action */}
                  <div style={{ marginTop: "24px" }}>
                    <button
                      className="btn-run-single-block"
                      onClick={() => onRunWorkflow?.(currentDsl)}
                    >
                      ▶ Run Block
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "general" && (
                <div className="drawer-section">
                  <div className="form-group">
                    <label className="form-label">Node Title</label>
                    <input
                      className="form-text-input"
                      value={selectedBlock.title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBlocks((prev) =>
                          prev.map((b) =>
                            b.id === selectedBlock.id ? { ...b, title: val } : b
                          )
                        );
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Stage Group</label>
                    <span className="stage-pill">{selectedBlock.stage}</span>
                  </div>

                  <div style={{ marginTop: "20px" }}>
                    <button
                      className="btn-delete-node"
                      onClick={() => deleteBlock(selectedBlock.id)}
                    >
                      ✕ Delete Block
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : showDslPanel ? (
          /* Right-Side JOCKY DSL Preview (Shown when no block is selected) */
          <div className="blocks-dsl-preview-panel">
            <div className="dsl-preview-header">
              <strong>{scriptName}</strong>
              <small>{blocks.length} blocks · {connections.length} wires</small>
            </div>
            <pre className="dsl-preview-content">{currentDsl}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
