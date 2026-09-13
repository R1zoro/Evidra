import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Icon } from "./Icon";
import type { RuntimeExecutionResponse } from "../api/runtimeClient";
import type { FsNode, OpenDoc } from "../types";

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

export const CAPABILITY_DEFINITIONS: Record<
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
  "pcap.analyze": {
    title: "PCAP Network Analysis",
    category: "examination",
    stage: "examine",
    outputType: "NetworkCollection",
    description: "Extracts network flows, DNS queries, and flags suspicious C2 beacon ports from PCAP files.",
    defaultParams: {
      extractDns: true,
      detectC2Beacons: true,
    },
  },
  "registry.parse": {
    title: "Windows Registry Parser",
    category: "examination",
    stage: "examine",
    outputType: "RegistryCollection",
    description: "Parses Windows registry hives and .reg exports for persistence, UserAssist, and USB history.",
    defaultParams: {
      detectAutoStart: true,
      decodeUserAssist: true,
      detectUsbDevices: true,
    },
  },
  "memory.analyze": {
    title: "Volatile Memory Analysis",
    category: "examination",
    stage: "examine",
    outputType: "MemoryCollection",
    description: "Analyzes raw RAM dumps for active processes, DKOM hidden processes, and RWX code injections (Volatility 3).",
    defaultParams: {
      detectDkomHidden: true,
      scanRwxInjections: true,
      checkProcessLineage: true,
    },
  },
  "evtx.parse": {
    title: "Windows Event Logs (EVTX)",
    category: "examination",
    stage: "examine",
    outputType: "EventCollection",
    description: "Parses Windows security event logs (4688 process creation, 4624 logons, 7045 services, 1102 log cleared).",
    defaultParams: {
      parseProcessCreations: true,
      parseLogonEvents: true,
    },
  },
  "hash.verify": {
    title: "NIST Hash Verification",
    category: "preparation",
    stage: "prepare",
    outputType: "VerificationReport",
    description: "Cryptographically audits evidence against baseline digests for NIST SP 800-86 chain of custody.",
    defaultParams: {
      algorithm: "SHA-256",
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

export const CATEGORY_COLORS: Record<BlockCategory, string> = {
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
  if (block.isCompact) return 38;
  if (block.capability === "evidence.import") {
    const srcCount = block.sources?.length ?? 1;
    return 96 + srcCount * 22;
  }
  if (block.inputVars.length > 1) {
    return 120;
  }
  return 108;
}

/**
 * Parses JOCKY DSL code into interactive block nodes and wire connections.
 */
export function parseDslToBlocks(dsl: string): { blocks: CanvasBlock[]; connections: WireConnection[] } {
  if (!dsl || !dsl.trim()) {
    return { blocks: [], connections: [] };
  }

  const lines = dsl.split("\n");
  let currentStage: BlockStage = "prepare";
  const parsedBlocks: CanvasBlock[] = [];
  const stageCounts: Record<string, number> = { prepare: 0, examine: 0, analysis: 0, export: 0 };

  const stageX: Record<BlockStage, number> = {
    prepare: 60,
    examine: 360,
    analysis: 660,
    export: 960,
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const s = trimmed.slice(1, -1).toLowerCase();
      if (s === "prepare" || s === "examine" || s === "analysis" || s === "export") {
        currentStage = s as BlockStage;
      }
      return;
    }
    if (!trimmed || trimmed.startsWith("#")) return;

    let outputVar = `var_${idx}`;
    let rhs = trimmed;
    if (trimmed.includes("=")) {
      const parts = trimmed.split("=");
      outputVar = parts[0].trim();
      rhs = parts.slice(1).join("=").trim();
    }

    let cap = "files.list";
    let cat: BlockCategory = "examination";
    let stage: BlockStage = currentStage;
    let inputVars: string[] = [];
    let sources: string[] | undefined = undefined;
    const parameters: Record<string, any> = {};

    if (rhs.includes("evidence.import") || trimmed.includes("evidence.import")) {
      cap = "evidence.import";
      cat = "input";
      stage = "prepare";
      const matches = trimmed.match(/"([^"]+)"/g);
      if (matches && matches.length > 0) {
        sources = matches.map((m) => m.replace(/"/g, ""));
      } else {
        sources = ["C:\\Cases\\Evidence"];
      }
    } else if (rhs.startsWith("copy ") || trimmed.startsWith("copy ")) {
      cap = "copy";
      cat = "preparation";
      stage = "prepare";
      const copyMatch = rhs.match(/copy\s+([^\s]+)\s+as\s+(?:"([^"]+)"|([^\s"]+))(?:\s+(?:to|>)?\s*"([^"]+)")?/);
      if (copyMatch) {
        inputVars = [copyMatch[1]];
        parameters.targetName = copyMatch[2] || copyMatch[3];
        if (copyMatch[4]) parameters.targetPath = copyMatch[4];
      }
    } else if (rhs.startsWith("hash ") || trimmed.startsWith("hash ")) {
      cap = "hash";
      cat = "preparation";
      stage = "prepare";
      const hashMatch = rhs.match(/hash\s+([^\s]+)/);
      if (hashMatch) inputVars = [hashMatch[1]];
    } else if (rhs.startsWith("files.list") || trimmed.startsWith("files.list")) {
      cap = "files.list";
      cat = "examination";
      stage = "examine";
      const match = rhs.match(/files\.list\s+([^\s]+)/);
      if (match) inputVars = [match[1]];
    } else if (rhs.startsWith("filter") || trimmed.startsWith("filter")) {
      cap = "filter";
      cat = "examination";
      stage = "examine";
      const fromMatch = rhs.match(/from\s+([^\s]+)/);
      if (fromMatch) inputVars = [fromMatch[1]];
      const extMatches = rhs.match(/"([^"]+)"/g);
      if (extMatches) {
        parameters.extensions = extMatches.map((m) => m.replace(/"/g, ""));
      }
    } else if (rhs.startsWith("metadata.extract") || trimmed.startsWith("metadata.extract")) {
      cap = "metadata.extract";
      cat = "examination";
      stage = "examine";
      const match = rhs.match(/metadata\.extract\s+([^\s]+)/);
      if (match) inputVars = [match[1]];
    } else if (rhs.startsWith("yara.scan") || trimmed.startsWith("yara.scan")) {
      cap = "yara.scan";
      cat = "examination";
      stage = "examine";
      const match = rhs.match(/yara\.scan\s+([^\s]+)(?:\s+with\s+"([^"]+)")?/);
      if (match) {
        inputVars = [match[1]];
        if (match[2]) parameters.ruleset = match[2];
      }
    } else if (rhs.startsWith("pcap.analyze") || trimmed.startsWith("pcap.analyze")) {
      cap = "pcap.analyze";
      cat = "examination";
      stage = "examine";
      const match = rhs.match(/pcap\.analyze\s+([^\s]+)/);
      if (match) inputVars = [match[1]];
    } else if (rhs.startsWith("registry.parse") || trimmed.startsWith("registry.parse")) {
      cap = "registry.parse";
      cat = "examination";
      stage = "examine";
      const match = rhs.match(/registry\.parse\s+([^\s]+)/);
      if (match) inputVars = [match[1]];
    } else if (rhs.startsWith("memory.analyze") || trimmed.startsWith("memory.analyze")) {
      cap = "memory.analyze";
      cat = "examination";
      stage = "examine";
      const match = rhs.match(/memory\.analyze\s+([^\s]+)/);
      if (match) inputVars = [match[1]];
    } else if (rhs.startsWith("evtx.parse") || trimmed.startsWith("evtx.parse")) {
      cap = "evtx.parse";
      cat = "examination";
      stage = "examine";
      const match = rhs.match(/evtx\.parse\s+([^\s]+)/);
      if (match) inputVars = [match[1]];
    } else if (rhs.startsWith("hash.verify") || trimmed.startsWith("hash.verify")) {
      cap = "hash.verify";
      cat = "preparation";
      stage = "prepare";
      const match = rhs.match(/hash\.verify\s+([^\s]+)/);
      if (match) inputVars = [match[1]];
    } else if (rhs.startsWith("events.extract") || trimmed.startsWith("events.extract")) {
      cap = "events.extract";
      cat = "analysis";
      stage = "analysis";
      const match = rhs.match(/from\s+([^\s]+)/);
      if (match) inputVars = [match[1]];
    } else if (rhs.startsWith("events.merge") || trimmed.startsWith("events.merge")) {
      cap = "events.merge";
      cat = "preparation";
      stage = "examine";
      const args = rhs.replace("events.merge", "").trim();
      inputVars = args.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (rhs.startsWith("timeline.build") || trimmed.startsWith("timeline.build")) {
      cap = "timeline.build";
      cat = "analysis";
      stage = "analysis";
      const match = rhs.match(/from\s+([^\s]+)/);
      if (match) inputVars = [match[1]];
    } else if (rhs.startsWith("correlate") || trimmed.startsWith("correlate")) {
      cap = "correlate";
      cat = "correlation";
      stage = "analysis";
      const inner = rhs.match(/correlate\s*\(([^)]+)\)/);
      if (inner) {
        inputVars = inner[1].split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        const afterCorrelate = rhs.replace(/^correlate\s+/, "").trim();
        if (afterCorrelate) {
          inputVars = afterCorrelate.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
        }
      }
    } else if (trimmed.startsWith("export ") || rhs.startsWith("export ")) {
      cap = "export";
      cat = "output";
      stage = "export";
      outputVar = `export_${idx}`;
      const expMatch = trimmed.match(/export\s+([^\s>]+)\s*>\s*"([^"]+)"/);
      if (expMatch) {
        inputVars = [expMatch[1]];
        parameters.destination = expMatch[2];
      }
    } else {
      // General fallback
      const tokens = rhs.split(/\s+/);
      tokens.forEach((tok) => {
        const clean = tok.replace(/[^a-zA-Z0-9_]/g, "");
        if (clean && parsedBlocks.some((b) => b.outputVar === clean)) {
          inputVars.push(clean);
        }
      });
    }

    const def = CAPABILITY_DEFINITIONS[cap] || CAPABILITY_DEFINITIONS["files.list"];
    const id = `b-${idx}-${cap.replace(".", "_")}`;

    const colX = stageX[stage] ?? 60;
    const countInStage = stageCounts[stage] ?? 0;
    stageCounts[stage] = countInStage + 1;
    const rowY = 50 + countInStage * 155;

    parsedBlocks.push({
      id,
      category: cat,
      title: def.title,
      capability: cap,
      stage,
      outputVar,
      outputType: def.outputType,
      inputVars,
      sources,
      x: colX,
      y: rowY,
      parameters: { ...def.defaultParams, ...parameters },
    });
  });

  // Construct wire connections from inputVars!
  const connections: WireConnection[] = [];
  parsedBlocks.forEach((toBlock) => {
    toBlock.inputVars.forEach((inVar) => {
      const fromBlock = parsedBlocks.find((b) => b.outputVar === inVar);
      if (fromBlock && fromBlock.id !== toBlock.id) {
        connections.push({
          id: `conn-${fromBlock.id}-${toBlock.id}`,
          fromId: fromBlock.id,
          toId: toBlock.id,
          color: CATEGORY_COLORS[fromBlock.category] || "#38bdf8",
        });
      }
    });
  });

  return { blocks: parsedBlocks, connections };
}

export interface BlocksProps {
  activeDocPath: string | null;
  sourceCode: string;
  response: RuntimeExecutionResponse | null;
  tree?: FsNode[];
  openDocs?: OpenDoc[];
  onLoadScriptContent?: (path: string) => Promise<string | undefined>;
  onSyncToEditor?: (updatedCode: string) => void;
  onRunWorkflow?: (code: string) => void;
}

export function Blocks({
  activeDocPath,
  sourceCode,
  response: _response,
  tree = [],
  openDocs = [],
  onLoadScriptContent,
  onSyncToEditor,
  onRunWorkflow,
}: BlocksProps) {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [globalCompact, setGlobalCompact] = useState(false);
  const [showDslPanel, setShowDslPanel] = useState(true);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"parameters" | "general">("parameters");
  const [userHasEdited, setUserHasEdited] = useState(false);
  const [notice, setNotice] = useState<string>("");

  // Discover all .jocky scripts in workspace
  const allAvailableScripts = useMemo(() => {
    const list: { name: string; path: string }[] = [];
    openDocs.forEach((d) => {
      if (d.name.endsWith(".jocky") || d.type === "jocky") {
        list.push({ name: d.name, path: d.path });
      }
    });
    const walk = (nodes: FsNode[]) => {
      nodes.forEach((n) => {
        if (n.kind === "file" && n.name.endsWith(".jocky")) {
          if (!list.some((existing) => existing.path === n.path || existing.name === n.name)) {
            list.push({ name: n.name, path: n.path });
          }
        } else if (n.kind === "directory" && n.children) {
          walk(n.children);
        }
      });
    };
    walk(tree);
    return list;
  }, [tree, openDocs]);

  const loadScriptIntoCanvas = async (path: string) => {
    try {
      let content: string | undefined;
      if (onLoadScriptContent) {
        content = await onLoadScriptContent(path);
      } else {
        const doc = openDocs.find((d) => d.path === path || d.name === path);
        content = doc?.content;
      }
      if (content !== undefined && content !== null) {
        const parsed = parseDslToBlocks(content);
        setBlocks(parsed.blocks);
        setConnections(parsed.connections);
        setUserHasEdited(true);
        setSelectedBlockId(null);
        const scriptBase = path.split(/[\\/]/).pop() || path;
        setNotice(`Loaded "${scriptBase}" into Blocks (${parsed.blocks.length} blocks, ${parsed.connections.length} wires).`);
        setTimeout(() => setNotice(""), 3000);
      }
    } catch (err) {
      setNotice(`Failed to load script: ${err instanceof Error ? err.message : "read error"}`);
      setTimeout(() => setNotice(""), 3000);
    }
  };

  // Multi-canvas state
  const [canvasNames, setCanvasNames] = useState<string[]>(["Primary Workflow"]);
  const [activeCanvas, setActiveCanvas] = useState<string>("Primary Workflow");

  const canvasRef = useRef<HTMLDivElement>(null);

  // Initialize blocks based on sourceCode or empty
  const [blocks, setBlocks] = useState<CanvasBlock[]>(() => {
    const parsed = parseDslToBlocks(sourceCode);
    return parsed.blocks;
  });

  const [connections, setConnections] = useState<WireConnection[]>(() => {
    const parsed = parseDslToBlocks(sourceCode);
    return parsed.connections;
  });

  // Interactive wire dragging state
  const [wireDrag, setWireDrag] = useState<{
    fromBlockId: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    color: string;
  } | null>(null);

  const [dropTargetBlockId, setDropTargetBlockId] = useState<string | null>(null);

  const currentCaseId = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("evidra.caseId") || "default" : "default";

  // Load canvas from localStorage when activeCanvas, caseId, or activeDocPath changes
  useEffect(() => {
    try {
      const key = `evidra.canvas.${currentCaseId}.${activeDocPath || "root"}.${activeCanvas}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.blocks && parsed.connections) {
          setBlocks(parsed.blocks);
          setConnections(parsed.connections);
          setUserHasEdited(false);
          return;
        }
      }
    } catch {}

    // Fall back to parsing the active document's sourceCode for this case
    const parsed = parseDslToBlocks(sourceCode);
    setBlocks(parsed.blocks);
    setConnections(parsed.connections);
    setUserHasEdited(false);
  }, [activeCanvas, currentCaseId, activeDocPath]);

  // Save canvas to localStorage when changed
  useEffect(() => {
    if (userHasEdited && blocks.length > 0) {
      try {
        const key = `evidra.canvas.${currentCaseId}.${activeDocPath || "root"}.${activeCanvas}`;
        localStorage.setItem(key, JSON.stringify({ blocks, connections }));
      } catch {}
    }
  }, [blocks, connections, userHasEdited, activeCanvas, currentCaseId, activeDocPath]);

  // Generate JOCKY DSL from current blocks and connections
  const generateDSL = useCallback((): string => {
    if (blocks.length === 0) return "";

    const lines: string[] = [
      "# Generated via Evidra Building Blocks",
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
            if (b.parameters.targetPath) {
              lines.push(`    ${b.outputVar} = copy ${inVar} as ${tgtName} "${b.parameters.targetPath}"`);
            } else {
              lines.push(`    ${b.outputVar} = copy ${inVar} as "${tgtName}"`);
            }
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
          } else if (b.capability === "pcap.analyze") {
            const inVar = b.inputVars[0] || "pcap_files";
            lines.push(`    ${b.outputVar} = pcap.analyze ${inVar}`);
          } else if (b.capability === "registry.parse") {
            const inVar = b.inputVars[0] || "reg_files";
            lines.push(`    ${b.outputVar} = registry.parse ${inVar}`);
          } else if (b.capability === "memory.analyze") {
            const inVar = b.inputVars[0] || "artifacts";
            lines.push(`    ${b.outputVar} = memory.analyze ${inVar}`);
          } else if (b.capability === "evtx.parse") {
            const inVar = b.inputVars[0] || "artifacts";
            lines.push(`    ${b.outputVar} = evtx.parse ${inVar}`);
          } else if (b.capability === "hash.verify") {
            const inVar = b.inputVars[0] || "working";
            lines.push(`    ${b.outputVar} = hash.verify ${inVar}`);
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

  // Sync from Editor action
  const syncFromEditor = () => {
    const parsed = parseDslToBlocks(sourceCode);
    setBlocks(parsed.blocks);
    setConnections(parsed.connections);
    setUserHasEdited(false);
    setSelectedBlockId(null);
    setNotice(`Synced ${parsed.blocks.length} blocks & ${parsed.connections.length} wires from editor.`);
    setTimeout(() => setNotice(""), 2500);
  };

  // Auto-layout / tidy canvas
  const tidyLayout = () => {
    const stageCounts: Record<string, number> = { prepare: 0, examine: 0, analysis: 0, export: 0 };
    const stageX: Record<BlockStage, number> = {
      prepare: 60,
      examine: 360,
      analysis: 660,
      export: 960,
    };

    setBlocks((prev) =>
      prev.map((b) => {
        const count = stageCounts[b.stage] ?? 0;
        stageCounts[b.stage] = count + 1;
        return {
          ...b,
          x: stageX[b.stage] ?? 60,
          y: 50 + count * 155,
        };
      })
    );
    setNotice("Auto-layout applied cleanly across investigation stages.");
    setTimeout(() => setNotice(""), 2000);
  };

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
        const bH = (globalCompact || b.isCompact) ? 38 : getCardHeight(b);
        return (
          currentX >= b.x &&
          currentX <= b.x + CARD_WIDTH &&
          currentY >= b.y - 10 &&
          currentY <= b.y + bH + 10
        );
      });

      setDropTargetBlockId(target ? target.id : null);
    };

    const handleMouseUp = () => {
      if (dropTargetBlockId && wireDrag) {
        const fromBlock = blocks.find((b) => b.id === wireDrag.fromBlockId);
        const toBlock = blocks.find((b) => b.id === dropTargetBlockId);

        if (fromBlock && toBlock && fromBlock.id !== toBlock.id) {
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
            setUserHasEdited(true);

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
  }, [wireDrag, dropTargetBlockId, blocks, connections, zoomLevel, globalCompact]);

  // Start wire drag from a block's bottom port
  const startWireDrag = (block: CanvasBlock, e: React.MouseEvent) => {
    e.stopPropagation();
    const isCompact = globalCompact || block.isCompact;
    const bHeight = isCompact ? 38 : getCardHeight(block);
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

  // Delete a wire connection
  const deleteConnection = (connId: string) => {
    const conn = connections.find((c) => c.id === connId);
    if (conn) {
      const fromBlock = blocks.find((b) => b.id === conn.fromId);
      if (fromBlock) {
        setBlocks((prev) =>
          prev.map((b) => {
            if (b.id !== conn.toId) return b;
            return {
              ...b,
              inputVars: b.inputVars.filter((v) => v !== fromBlock.outputVar),
            };
          })
        );
      }
    }
    setConnections((prev) => prev.filter((c) => c.id !== connId));
    setUserHasEdited(true);
  };

  // Add block by explicit capability
  const addBlockByCapability = (capKey: string) => {
    const def = CAPABILITY_DEFINITIONS[capKey];
    if (!def) return;
    const id = `b-${Date.now().toString(36).slice(-4)}`;
    const suffix = id.slice(-2);
    const outputVar = `${def.outputType.toLowerCase()}_${suffix}`;

    const newBlock: CanvasBlock = {
      id,
      category: def.category,
      title: def.title,
      capability: capKey,
      stage: def.stage,
      outputVar,
      outputType: def.outputType,
      inputVars: [],
      x: 180 + (blocks.length % 4) * 60,
      y: 120 + (blocks.length % 4) * 60,
      sources: def.category === "input" ? ["C:\\Cases\\NewEvidence"] : undefined,
      parameters: { ...def.defaultParams },
    };

    setBlocks((prev) => [...prev, newBlock]);
    setSelectedBlockId(id);
    setUserHasEdited(true);
  };

  // Add a new block to the canvas
  const addBlock = (cat: BlockCategory) => {
    const id = `b-${Date.now().toString(36).slice(-4)}`;
    let capKey = "evidence.import";

    if (cat === "input") capKey = "evidence.import";
    else if (cat === "preparation") capKey = "copy";
    else if (cat === "examination") capKey = "files.list";
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
    setUserHasEdited(true);
  };

  // Delete block and its wires
  const deleteBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    setConnections((prev) =>
      prev.filter((c) => c.fromId !== blockId && c.toId !== blockId)
    );
    if (selectedBlockId === blockId) setSelectedBlockId(null);
    setUserHasEdited(true);
  };

  // Toggle individual compact
  const toggleCompact = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, isCompact: !b.isCompact } : b))
    );
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
    setUserHasEdited(true);
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
    setUserHasEdited(true);
  };

  // Add new canvas
  const handleNewCanvas = () => {
    const name = window.prompt("Enter new canvas name:", `Workflow ${canvasNames.length + 1}`);
    if (name && !canvasNames.includes(name)) {
      setCanvasNames((prev) => [...prev, name]);
      setActiveCanvas(name);
      setBlocks([]);
      setConnections([]);
      setSelectedBlockId(null);
    }
  };

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  return (
    <div className="blocks-full-view">
      {/* Top Controls Toolbar */}
      <div className="blocks-top-toolbar">
        <div className="toolbar-left-group">
          {/* Canvas Switcher */}
          <div className="canvas-switcher-wrap">
            <span className="toolbar-section-label">CANVAS:</span>
            <select
              className="canvas-select-dropdown"
              value={activeCanvas}
              onChange={(e) => setActiveCanvas(e.target.value)}
            >
              {canvasNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button className="btn-new-canvas" onClick={handleNewCanvas} title="Create new canvas">
              +
            </button>
          </div>

          {/* Script Loader Dropdown */}
          <div className="canvas-switcher-wrap" style={{ borderLeft: "1px solid #1e293b", paddingLeft: "8px" }}>
            <span className="toolbar-section-label" title="Load any .jocky script from workspace into canvas">LOAD:</span>
            <select
              className="canvas-select-dropdown"
              style={{ maxWidth: "150px" }}
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  loadScriptIntoCanvas(e.target.value);
                }
              }}
            >
              <option value="" disabled>
                {allAvailableScripts.length > 0 ? "Select script..." : "No scripts found"}
              </option>
              {allAvailableScripts.map((s) => (
                <option key={s.path} value={s.path}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              className="btn-new-canvas"
              onClick={() => {
                setBlocks([]);
                setConnections([]);
                setSelectedBlockId(null);
                setUserHasEdited(true);
                setNotice("Canvas cleared to blank.");
                setTimeout(() => setNotice(""), 2500);
              }}
              title="Blank canvas"
              style={{ width: "auto", padding: "0 6px", fontSize: "10px", fontWeight: "bold" }}
            >
              BLANK
            </button>
          </div>

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
            <select
              className="category-pill"
              style={{
                background: "#0f172a",
                color: "#38bdf8",
                borderColor: "#38bdf8",
                padding: "2px 8px",
                fontSize: "11px",
                cursor: "pointer",
                outline: "none",
              }}
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  addBlockByCapability(e.target.value);
                }
              }}
              title="Add Forensic Capability Block"
            >
              <option value="" disabled>+ Forensic Tool ▾</option>
              <option value="memory.analyze">Volatility 3 (memory.analyze)</option>
              <option value="evtx.parse">EvtxECmd Logs (evtx.parse)</option>
              <option value="hash.verify">NIST SP 800-86 (hash.verify)</option>
              <option value="yara.scan">VirusTotal YARA (yara.scan)</option>
              <option value="pcap.analyze">Wireshark/Zeek (pcap.analyze)</option>
              <option value="registry.parse">RECmd/RegRipper (registry.parse)</option>
              <option value="prefetch.extract">PECmd Prefetch (prefetch.extract)</option>
              <option value="metadata.extract">TSK Metadata (metadata.extract)</option>
              <option value="events.extract">Plaso Events (events.extract)</option>
              <option value="timeline.build">Supertimeline (timeline.build)</option>
              <option value="correlate">Correlation Matrix (correlate)</option>
            </select>
          </div>
        </div>

        <div className="blocks-action-btns">
          {notice && <span className="canvas-notice-badge">{notice}</span>}

          <button
            className="btn-action-secondary"
            onClick={syncFromEditor}
            title="Load active editor script into blocks"
          >
            📥 Sync from Script
          </button>
          <button
            className="btn-action-secondary"
            onClick={tidyLayout}
            title="Automatically arrange blocks into clean stage columns"
          >
            ☵ Auto-Layout
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
            className="btn-action-secondary"
            onClick={() => {
              setBlocks([]);
              setConnections([]);
              setSelectedBlockId(null);
            }}
            title="Reset canvas workspace"
          >
            ✕ Clear
          </button>
          <button
            className="btn-action-primary"
            onClick={() => {
              if (currentDsl && onSyncToEditor) {
                onSyncToEditor(currentDsl);
                setNotice("Applied blocks to editor script.");
                setTimeout(() => setNotice(""), 2000);
              }
            }}
          >
            <Icon name="save" /> Save to Script
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
            {/* SVG Wires Layer (With Interactive Delete Badges) */}
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

                const isCompactFrom = globalCompact || fromB.isCompact;
                const fromH = isCompactFrom ? 38 : getCardHeight(fromB);
                const x1 = fromB.x + CARD_WIDTH / 2;
                const y1 = fromB.y + fromH;
                const x2 = toB.x + CARD_WIDTH / 2;
                const y2 = toB.y;

                const midX = (x1 + x2) / 2;
                const midY = y1 + Math.max(30, (y2 - y1) * 0.5);
                const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

                // Mathematically exact midpoint along the cubic Bézier curve at t = 0.5
                const curveMidX = midX;
                const curveMidY = 0.125 * (y1 + y2) + 0.75 * midY;

                return (
                  <g key={conn.id} className="wire-group">
                    {/* Invisible wider hit area for easy clicking */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="18"
                      className="wire-hit-area"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConnection(conn.id);
                      }}
                    />
                    {/* Background glow stroke */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={conn.color}
                      strokeWidth="6"
                      strokeOpacity="0.22"
                    />
                    {/* Main wire line */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={conn.color}
                      strokeWidth="2.5"
                      className="bezier-wire-smooth"
                    />
                    {/* Delete button pinned exactly to curve center without floating */}
                    <g
                      className="wire-delete-btn"
                      transform={`translate(${curveMidX}, ${curveMidY})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConnection(conn.id);
                      }}
                    >
                      <title>Click to disconnect wire</title>
                      <circle r="9" fill="#0f172a" stroke={conn.color} strokeWidth="1.5" />
                      <text textAnchor="middle" dy="3.5" fill="#f8fafc" fontSize="10" fontWeight="bold">✕</text>
                    </g>
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
                  <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>
                    Click <strong>📥 Sync from Script</strong> to load your current editor procedure, or click category buttons above to add nodes.
                  </p>
                </div>
              )}

              {blocks.map((block) => {
                const isCompact = globalCompact || block.isCompact;
                const isSelected = selectedBlockId === block.id;
                const isDropTarget = dropTargetBlockId === block.id;
                const cardH = isCompact ? 38 : getCardHeight(block);
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
                        setUserHasEdited(true);
                      };

                      const onMouseUp = () => {
                        window.removeEventListener("mousemove", onMouseMove);
                        window.removeEventListener("mouseup", onMouseUp);
                      };

                      window.addEventListener("mousemove", onMouseMove);
                      window.addEventListener("mouseup", onMouseUp);
                    }}
                  >
                    {/* Top Input Port */}
                    {block.capability !== "evidence.import" && (
                      <div
                        className="block-port port-top"
                        title="Input Port (Drop upstream wire here)"
                        style={{
                          backgroundColor: isDropTarget ? "#10b981" : "#38bdf8",
                          boxShadow: isDropTarget ? "0 0 10px #10b981" : "0 0 6px #38bdf8",
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
                        {!isCompact && (
                          <span className="block-card-subtitle">{block.capability}</span>
                        )}
                      </div>

                      <div className="block-header-actions">
                        <button
                          className="btn-card-menu"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCompact(block.id);
                          }}
                          title={isCompact ? "Expand Card" : "Compact Card"}
                        >
                          {isCompact ? "▾" : "▴"}
                        </button>
                        <button
                          className="btn-card-menu delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBlock(block.id);
                          }}
                          title="Delete Block"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Card Body */}
                    {!isCompact && (
                      <div className="block-card-body">
                        {/* Input Node Special UI */}
                        {block.capability === "evidence.import" && (
                          <div className="sources-list-container">
                            {(block.sources || ["C:\\Cases\\Evidence"]).map((src, idx) => (
                              <input
                                key={idx}
                                type="text"
                                className="source-path-field"
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

        {/* Right-Hand "Block Details" Inspector Drawer */}
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
                            onChange={(e) => {
                              setUserHasEdited(true);
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
                              );
                            }}
                          />
                          Basic Metadata
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.sha256 ?? true}
                            onChange={(e) => {
                              setUserHasEdited(true);
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
                              );
                            }}
                          />
                          Hash (SHA-256)
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.fileType ?? true}
                            onChange={(e) => {
                              setUserHasEdited(true);
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
                              );
                            }}
                          />
                          File Type
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.timestamps ?? true}
                            onChange={(e) => {
                              setUserHasEdited(true);
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
                              );
                            }}
                          />
                          Timestamps
                        </label>
                      </div>
                    </div>
                  )}

                  {selectedBlock.capability === "filter" && (
                    <div className="form-group">
                      <label className="form-label">File Extensions</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder=".zip, .exe, .bat"
                        value={(selectedBlock.parameters.extensions || []).join(", ")}
                        onChange={(e) => {
                          const exts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          setUserHasEdited(true);
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

                  {selectedBlock.capability === "yara.scan" && (
                    <div className="form-group">
                      <label className="form-label">Ruleset File</label>
                      <input
                        type="text"
                        className="form-input"
                        value={selectedBlock.parameters.ruleset || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserHasEdited(true);
                          setBlocks((prev) =>
                            prev.map((b) =>
                              b.id === selectedBlock.id
                                ? { ...b, parameters: { ...b.parameters, ruleset: val } }
                                : b
                            )
                          );
                        }}
                      />
                    </div>
                  )}

                  {selectedBlock.capability === "pcap.analyze" && (
                    <div className="form-group">
                      <label className="form-label">Network Analysis Settings</label>
                      <div className="checkbox-group">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.extractDns ?? true}
                            onChange={(e) => {
                              setUserHasEdited(true);
                              setBlocks((prev) =>
                                prev.map((b) =>
                                  b.id === selectedBlock.id
                                    ? { ...b, parameters: { ...b.parameters, extractDns: e.target.checked } }
                                    : b
                                )
                              );
                            }}
                          />
                          Extract DNS Queries
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.detectC2Beacons ?? true}
                            onChange={(e) => {
                              setUserHasEdited(true);
                              setBlocks((prev) =>
                                prev.map((b) =>
                                  b.id === selectedBlock.id
                                    ? { ...b, parameters: { ...b.parameters, detectC2Beacons: e.target.checked } }
                                    : b
                                )
                              );
                            }}
                          />
                          Flag C2 Beacon Ports
                        </label>
                      </div>
                    </div>
                  )}

                  {selectedBlock.capability === "registry.parse" && (
                    <div className="form-group">
                      <label className="form-label">Registry Forensics Settings</label>
                      <div className="checkbox-group">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.detectAutoStart ?? true}
                            onChange={(e) => {
                              setUserHasEdited(true);
                              setBlocks((prev) =>
                                prev.map((b) =>
                                  b.id === selectedBlock.id
                                    ? { ...b, parameters: { ...b.parameters, detectAutoStart: e.target.checked } }
                                    : b
                                )
                              );
                            }}
                          />
                          Detect Auto-Start Persistence (ASEP)
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.decodeUserAssist ?? true}
                            onChange={(e) => {
                              setUserHasEdited(true);
                              setBlocks((prev) =>
                                prev.map((b) =>
                                  b.id === selectedBlock.id
                                    ? { ...b, parameters: { ...b.parameters, decodeUserAssist: e.target.checked } }
                                    : b
                                )
                              );
                            }}
                          />
                          Decode UserAssist (ROT13)
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedBlock.parameters.detectUsbDevices ?? true}
                            onChange={(e) => {
                              setUserHasEdited(true);
                              setBlocks((prev) =>
                                prev.map((b) =>
                                  b.id === selectedBlock.id
                                    ? { ...b, parameters: { ...b.parameters, detectUsbDevices: e.target.checked } }
                                    : b
                                )
                              );
                            }}
                          />
                          Extract USBSTOR Hardware
                        </label>
                      </div>
                    </div>
                  )}

                  {selectedBlock.capability === "export" && (
                    <div className="form-group">
                      <label className="form-label">Destination Path</label>
                      <input
                        type="text"
                        className="form-input"
                        value={selectedBlock.parameters.destination || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserHasEdited(true);
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
                </div>
              )}

              {activeTab === "general" && (
                <div className="drawer-section">
                  <div className="form-group">
                    <label className="form-label">Block Capability</label>
                    <select
                      className="form-select"
                      value={selectedBlock.capability}
                      onChange={(e) => {
                        const newCap = e.target.value;
                        const def = CAPABILITY_DEFINITIONS[newCap];
                        if (def) {
                          setUserHasEdited(true);
                          setBlocks((prev) =>
                            prev.map((b) =>
                              b.id === selectedBlock.id
                                ? {
                                    ...b,
                                    capability: newCap,
                                    title: def.title,
                                    category: def.category,
                                    stage: def.stage,
                                    outputType: def.outputType,
                                    parameters: { ...def.defaultParams },
                                  }
                                : b
                            )
                          );
                        }
                      }}
                    >
                      <optgroup label="Prepare">
                        <option value="evidence.import">Import Evidence (evidence.import)</option>
                        <option value="copy">Materialize Copy (copy)</option>
                        <option value="hash">Hash Integrity (hash)</option>
                        <option value="hash.verify">NIST Hash Verification (hash.verify)</option>
                      </optgroup>
                      <optgroup label="Examine">
                        <option value="files.list">Enumerate Files (files.list)</option>
                        <option value="filter">Filter Artifacts (filter)</option>
                        <option value="metadata.extract">Extract Metadata (metadata.extract)</option>
                        <option value="memory.analyze">Volatile Memory (memory.analyze)</option>
                        <option value="evtx.parse">Windows Event Logs (evtx.parse)</option>
                        <option value="yara.scan">YARA Signature Scan (yara.scan)</option>
                        <option value="pcap.analyze">PCAP Network Analysis (pcap.analyze)</option>
                        <option value="registry.parse">Registry Parser (registry.parse)</option>
                        <option value="prefetch.extract">Prefetch Parser (prefetch.extract)</option>
                      </optgroup>
                      <optgroup label="Analysis">
                        <option value="events.extract">Extract Events (events.extract)</option>
                        <option value="events.merge">Merge Events (events.merge)</option>
                        <option value="timeline.build">Build Timeline (timeline.build)</option>
                        <option value="correlate">Correlate Findings (correlate)</option>
                      </optgroup>
                      <optgroup label="Export">
                        <option value="export">Export Results (export)</option>
                      </optgroup>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Output Variable Name</label>
                    <input
                      type="text"
                      className="form-input mono"
                      value={selectedBlock.outputVar}
                      onChange={(e) => {
                        const newVar = e.target.value.trim();
                        setUserHasEdited(true);
                        setBlocks((prev) =>
                          prev.map((b) =>
                            b.id === selectedBlock.id ? { ...b, outputVar: newVar } : b
                          )
                        );
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Stage Assignment</label>
                    <select
                      className="form-select"
                      value={selectedBlock.stage}
                      onChange={(e) => {
                        const st = e.target.value as BlockStage;
                        setUserHasEdited(true);
                        setBlocks((prev) =>
                          prev.map((b) =>
                            b.id === selectedBlock.id ? { ...b, stage: st } : b
                          )
                        );
                      }}
                    >
                      <option value="prepare">prepare</option>
                      <option value="examine">examine</option>
                      <option value="analysis">analysis</option>
                      <option value="export">export</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Rightmost Live DSL Preview Panel */}
        {showDslPanel && (
          <div className="blocks-dsl-preview-panel">
            <div className="dsl-panel-header">
              <div className="dsl-title-info">
                <span className="dsl-label">DSL PREVIEW</span>
                <span className="dsl-filename">{activeDocPath ? activeDocPath.split(/[\\/]/).pop() : "blocks.jocky"}</span>
              </div>
              <button
                className="btn-close-dsl"
                onClick={() => setShowDslPanel(false)}
                title="Hide preview"
              >
                ✕
              </button>
            </div>
            <pre className="dsl-code-block">{currentDsl || "# Canvas is empty"}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
