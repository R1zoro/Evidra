# Evidra & JOCKY DSL — Comprehensive Architecture, Theory & Technical Manual

**Document Category**: Technical System Architecture, Domain Theory & Engineering Roadmap  
**Target Audience**: Judges, System Architects, Core Developers, AI Coding Assistants  
**Document Revision**: v2.1 (Phase 2 & Visual DAG Workflow Update)

---

## 1. Problem Statement & Executive Context

### 1.1 Problem Statement Introduction
**SIH Problem Statement 26148**: Creation of scripts/functions with a new domain-specific programming language to commence Computer & Network forensic analysis without triggering security solutions (EDR, AV, SIEM, Endpoint Monitoring).

### 1.2 Why Traditional Forensic Analysis Triggers Security Solutions
Modern security solutions monitor endpoint operating systems by hooking Windows API functions (`NTDLL.DLL`), monitoring process creation events (Windows Event ID 4688), logging command-line arguments, and inspecting binary behavior.

When a digital forensic analyst runs standard triage scripts or command-line commands (e.g., PowerShell `Get-WinEvent`, WMI queries `wmic process list`, `vssadmin`, `certutil`, `netstat`), security tools flag or block these commands because:
1. **Command-Line Telemetry Overlap**: Attackers and malware authors use the exact same living-off-the-land binaries (LotLBs) such as `powershell.exe`, `cmd.exe`, and `certutil.exe`.
2. **Sub-Process Spawning Signals**: Security tools alert on non-standard parent-child process chains (e.g. an analyst tool spawning `cmd.exe` or `powershell.exe`).
3. **Unfiltered Disk IO**: Volatile memory or raw disk scanning tools trigger file system filter drivers (`fltmgr.sys`).

### 1.3 The Evidra / JOCKY Architectural Solution
Evidra introduces **JOCKY**, a compiled Domain-Specific Language (DSL) that decouples **Investigative Intent** from low-level operating system shell execution:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ANALYST INTENT (JOCKY DSL)                                               │
│   files.list -> metadata.extract -> events.extract -> correlate          │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ Lowering via Parser & IR Engine
┌────────────────────────────────────▼─────────────────────────────────────┐
│ INVESTIGATION INTERMEDIATE REPRESENTATION (IR)                           │
│   Typed AST / IR Step Graph with Dependency Resolution                   │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ In-Process Capability Execution
┌────────────────────────────────────▼─────────────────────────────────────┐
│ LOCAL IN-PROCESS PYTHON FORENSIC ENGINE                                  │
│   Pure Python APIs (pathlib, hashlib, zipfile, struct, os)               │
│   Zero Sub-Process Spawning -> Zero EDR / AV Event Log 4688 Triggers    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architecture & System Components

### 2.1 Decoupled Dual-Engine Model
Evidra is built on a clean client-runtime architecture:
1. **Desktop GUI Shell (Electron + React 18 + Vite)**:
   - Modern dark slate suite (`#090d14` / `#0b1118` / `#0f172a` / `#1e293b`).
   - Houses the Case Explorer, JOCKY Procedure Editor, Exploratory Workbench, Visual Building Blocks DAG Canvas, Dual Forensic Graph, and Typed Results Explorer.
   - Operates in complete local isolation without cloud dependency or telemetry phone-home.
2. **Python Forensic Core Engine (Python 3.10+)**:
   - Runs out-of-process as a local loopback HTTP/JSON-RPC server (`127.0.0.1:8765`).
   - Handles JOCKY lexing, AST parsing, IR lowering, non-destructive evidence materialization, and in-process forensic capabilities.

### 2.2 Core Component Architecture & File Map

| File Path | Technology | Functional Responsibility |
| --- | --- | --- |
| `src/App.tsx` | React / TypeScript | Central application shell coordinating Activity Rail, Sidebar Case Explorer, Editor Tabs, Workbench, and Views. |
| `src/components/Blocks.tsx` | React / TypeScript | **Visual Building Blocks DAG Engine**: Infinite canvas with top/bottom ports, drag-to-connect wires, mathematical S-curves, multi-source imports, right-hand Block Details drawer, and live JOCKY DSL preview. |
| `src/components/Graph.tsx` | React / TypeScript | **Dual-Engine Graph Controller**: Pipeline Execution View with clickable step nodes, Step Details Drawer, and mode switcher to Input-Output View. |
| `src/components/ProvenanceView.tsx` | React / TypeScript | **3-Column Input-Output Lineage View**: Evidence Hierarchy Root, JOCKY Script Execution Cards, Export Sinks, SVG flow lines, and Selected Export inspection drawer. |
| `src/components/Editor.tsx` | React / TypeScript | Multi-tab code editor with syntax highlighting, dirty tracking, and Ctrl+S saving. |
| `src/components/Workbench.tsx` | React / TypeScript | Exploratory cell-based scratchpad for quick hypothesis testing without mutating master scripts. |
| `src/components/Results.tsx` | React / TypeScript | Typed forensic renderers for `ArtifactCollection`, `MetadataCollection`, `EventCollection`, `Timeline`, and `FindingCollection`. |
| `src/styles.css` | CSS3 | Global Dark Slate design tokens, glowing ports, card grids, minimaps, and modal drawers. |
| `runtime/server.py` | Python 3 | HTTP JSON-RPC backend server listening on `127.0.0.1:8765`, exposing `/api/execute`, `/api/cases/*`, and universal CORS headers. |
| `runtime/jocky/parser.py` | Python 3 | JOCKY lexer, grammar parser, and AST builder. Parses the 4-stage lifecycle (`[prepare]`, `[examine]`, `[analysis]`, `[export]`). |
| `runtime/jocky/ir.py` | Python 3 | Lowers AST to platform-neutral Investigation Intermediate Representation (IR), resolves variable dependencies, and constructs step graphs. |
| `runtime/evidra/executor.py` | Python 3 | Step execution engine evaluating IR steps against Python forensic providers, with SQLite fingerprint caching and artifact coercion. |
| `runtime/evidra/case_store.py` | Python 3 / SQLite | Persistent case store (`runtime-case.db`) tracking registered sources, procedures, run history, human-readable script names, and typed results across sessions. |
| `runtime/evidra/filesystem_provider.py` | Python 3 | Forensic capability provider executing pure Python filesystem traversal, deep format inspection (ZIP/PE/ELF/JPEG/CSV), and threat IOC matching. |

---

## 3. Visual Building Blocks Engine Architecture

The **Visual Building Blocks** engine allows investigators to assemble complex forensic pipelines graphically while ensuring 1:1 mathematical alignment with the JOCKY DSL.

```
   ┌─────────────────────────────────────────────────────────┐
   │            Building Blocks Visual DAG Canvas            │
   └───────────────────────────┬─────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────┐             ┌───────────────────────┐
│     Node Geometry     │             │  Interactive Wires    │
│ • Width: 230px        │             │ • Port Drag & Drop    │
│ • Top Port: Input     │             │ • S-Curve Bezier      │
│ • Bottom Port: Output │             │ • Pure (x,y) Math     │
└───────────┬───────────┘             └───────────┬───────────┘
            │                                     │
            └──────────────────┬──────────────────┘
                               │ Real-Time DSL Generation
                               ▼
┌─────────────────────────────────────────────────────────┐
│ JOCKY DSL Syntax (Auto-Synchronized to Procedure Editor)│
│   [prepare] -> [examine] -> [analysis] -> [export]      │
└─────────────────────────────────────────────────────────┘
```

### 3.1 Mathematical Zero-Lag Geometry
Previous canvas implementations suffered from line detachment and drift during node dragging due to asynchronous DOM `getBoundingClientRect()` queries distorted by container zoom and scroll offsets.

Evidra solves this by computing all connection curves **synchronously from state coordinates**:
- **Source Output Port**: `x1 = source.x + CARD_WIDTH / 2`, `y1 = source.y + cardHeight`
- **Target Input Port**: `x2 = target.x + CARD_WIDTH / 2`, `y2 = target.y`
- **Vertical S-Curve**: `d = "M ${x1} ${y1} C ${x1} ${y1 + 45}, ${x2} ${y2 - 45}, ${x2} ${y2}"`

Because coordinates update on the exact mouse-move event frame, wires move with **zero lag and 100% precision**.

### 3.2 Interactive Drag-to-Connect Ports
- Users can click and drag directly from any bottom glowing port.
- An animated dashed wire tracks the cursor across the canvas.
- Releasing over a target node automatically creates the connection, appends the source output variable to the target's inputs, and updates the generated JOCKY procedure.

### 3.3 Right-Hand "Block Details" Inspector Drawer
Clicking any node selects it and slides open a comprehensive configuration drawer:
- **Parameters Tab**: Feature checkboxes (Basic Metadata, SHA-256 Hashes, File Types, Timestamps, Extended Attributes), extension filter predicates, destination paths, output variable names, and output type badges (`EvidenceSource`, `MetadataSet`, `TimelineEvents`, `ExportReport`).
- **General Tab**: Custom node titles, stage group badges, and deletion controls.
- **Run Block Action**: `▶ Run Block` button executing the selected pipeline segment.

---

## 4. Dual-Engine Forensic Graph Navigation

Evidra provides two complementary perspectives on case data flow:

### 4.1 Pipeline Execution View
- **Multi-Script Lanes**: Displays horizontal execution lanes for each script in the case workspace.
- **Clickable Step Nodes**: Clicking any operation node highlights it and opens the **Step Details Drawer** displaying execution status (`COMPLETED`, `FAILED`, `RUNNING`, `SKIPPED`), category, duration, procedure script origin, and an **"Open in Editor ↗"** shortcut button.

### 4.2 Input-Output (Provenance) View
Organized in a strict **3-Column Architecture**:
1. **Column 1: Evidence Hierarchy (Input)**: Displays root case folders, expandable directory trees (Documents, Finance, Downloads), and contributory checkmark badges (`✔`).
2. **Column 2: JOCKY Scripts (Processing)**: Flow cards showing script names, block counts, and active connections.
3. **Column 3: Export Artifacts (Output)**: Output report and dataset cards with format types and file sizes.
4. **Lineage Flow Overlay**: S-curve flow lines connecting raw evidence files through JOCKY procedures to resulting exports.
5. **Selected Export Drawer**: Right drawer inspecting selected outputs across `Details`, `Lineage`, and `Preview` tabs.

---

## 5. JOCKY Language Lifecycle & Capability Catalog

JOCKY organizes forensic procedures into four deterministic stages aligned with standard forensic frameworks (NIST SP 800-86 & ISO/IEC 27037):

```jocky
# JOCKY Forensic Investigation Procedure

[prepare]
    source_laptop = evidence.import "C:\Cases\Laptop_1"
    source_memory = evidence.import "D:\Forensics\Memory"
    working = copy source_laptop as "working_evidence"
    hash_report = hash working

[examine]
    artifacts = files.list working
    suspicious = filter(extension == ".zip" | ".exe" | ".bat" | ".ps1") from artifacts
    metadata = metadata.extract suspicious
    yara_hits = yara.scan suspicious with "threat_triage.yar"

[analysis]
    events = events.extract from suspicious
    timeline = timeline.build from events
    findings = correlate(suspicious, metadata, timeline, yara_hits)

[export]
    export findings > "./Outputs/investigation_report.json"
```

### Comprehensive Capability Table

| Capability | Stage | Input Type | Output Type | Description |
| --- | --- | --- | --- | --- |
| `evidence.import` | `[prepare]` | String Path | `EvidenceReference` | Registers external evidence sources (read-only). |
| `copy` | `[prepare]` | `EvidenceReference` | `EvidenceReference` | Materializes a forensically isolated working derivative. |
| `hash` | `[prepare]` | `EvidenceReference` | `ArtifactCollection` | `IntegrityRecord` | Cryptographic hash calculation for chain of custody. |
| `files.list` | `[examine]` | `EvidenceReference` | `ArtifactCollection` | Recursively enumerates files and folders. |
| `filter` | `[examine]` | `ArtifactCollection` | `ArtifactCollection` | Predicate filtering (extensions, size, conditions). |
| `files.search` | `[examine]` | `ArtifactCollection` | `ArtifactCollection` | Pattern and wildcard search across artifacts. |
| `metadata.extract` | `[examine]` | `ArtifactCollection` | `MetadataCollection` | Deep inspection of ZIP, PE/ELF, image, CSV, and text (TSK specification). |
| `prefetch.extract` | `[examine]` | `ArtifactCollection` | `PrefetchCollection` | Windows binary SCCA prefetch header parsing across NT versions (XP to 11), MAM decompression, and FILETIME execution history (Eric Zimmerman PECmd). |
| `pcap.analyze` | `[examine]` | `ArtifactCollection` | `NetworkCollection` | Extracts Libpcap flows, DNS queries, and flags suspicious C2 beacon ports (Wireshark / Zeek). |
| `registry.parse` | `[examine]` | `ArtifactCollection` | `RegistryCollection` | Parses registry hives/.reg exports for ASEP Auto-Start persistence, UserAssist execution, and USB devices (RECmd / RegRipper). |
| `memory.analyze` | `[examine]` | `ArtifactCollection` | `MemoryCollection` | Scans volatile RAM dumps for active processes, unlinked DKOM stealth processes, and RWX shellcode stagers (Volatility 3). |
| `evtx.parse` | `[examine]` | `ArtifactCollection` | `EventCollection` | Parses Windows Event Logs for logon (4624), process create (4688), service install (7045), and log clearing (1102) (Eric Zimmerman EvtxECmd). |
| `hash.verify` | `[prepare]` / `[examine]` | `EvidenceReference` / `ArtifactCollection` | `VerificationReport` | Audits cryptographic hashes against chain-of-custody baselines to certify evidence integrity (NIST SP 800-86). |
| `yara.scan` | `[examine]` | `ArtifactCollection` | `YaraResults` | Scans artifacts with YARA rulesets for threat signatures (VirusTotal YARA). |
| `events.extract` | `[analysis]` | `ArtifactCollection` | `EventCollection` | Parses timestamps and structured system/log events (Plaso methodology). |
| `events.merge` | `[analysis]` | Multiple Collections | `MergedDataset` | Combines multiple upstream collections into one dataset (Plaso methodology). |
| `timeline.build` | `[analysis]` | `EventCollection` | `Timeline` | Synthesizes timestamps into a chronological supertimeline (Plaso methodology). |
| `correlate` | `[analysis]` | Multiple Collections | `FindingCollection` | Cross-references artifacts, events, C2 beacons, persistence, and IOCs into actionable findings (Sigma / SPL). |
| `export` | `[export]` | Any Collection | `ExportReport` | Materializes verified findings and reports to disk. |

### 5.2 Forensic Tool Lineage & Industry Standards Attribution
Evidra capabilities implement and formalize proven methodologies from premier forensic tools:
- **Volatility 3 Specification** (`memory.analyze` / `memory.processes`): Scans raw volatile RAM dumps (`.raw`, `.dmp`, `.vmem`), carves EPROCESS structures, identifies DKOM unlinked processes (ActiveProcessLinks evasion), detects RWX code injections & shellcode stagers (Cobalt Strike / Metasploit), and flags anomalous parent-child execution lineages.
- **Eric Zimmerman EvtxECmd** (`evtx.parse`): Windows Event Log parser extracting critical security events: Process Creation (4688), Successful/Failed Logons (4624/4625), Service Installation (7045), and Anti-Forensic Audit Log Cleared (1102).
- **NIST SP 800-86 Specification** (`hash.verify`): Automated cryptographic integrity audit comparing acquired artifact hashes against chain-of-custody baselines to certify evidence integrity.
- **VirusTotal YARA** (`yara.scan`): Signature matching engine for threat indicators, custom `.yar` rules, and built-in incident response triage rulesets (Mimikatz, PowerShell obfuscation, WebShells, Ransomware notes).
- **Wireshark / Zeek Network Analysis Specification** (`pcap.analyze`): Binary Libpcap parser supporting little-endian and big-endian PCAP streams, Ethernet, IPv4, TCP/UDP headers, conversation flows, DNS request extraction, and automated detection/flagging of C2 beacon ports (4444, 1337, 8888, 7070, 50050, 9999).
- **Eric Zimmerman RECmd / Harlan Carvey RegRipper** (`registry.parse`): Windows registry hive and `.reg` export parser extracting Auto-Start Extensibility Points (ASEPs: Run, RunOnce), UserAssist execution history with ROT13 deciphering, and USBSTOR connected storage hardware tracking.
- **Eric Zimmerman PECmd** (`prefetch.extract` / `artifacts.parse_prefetch`): Binary Windows SCCA prefetch header parsing across NT versions (XP, Vista/7, 8.1, 10/11), MAM XPRESS Huffman decompression, and 64-bit FILETIME execution histories.
- **Plaso / log2timeline** (`events.extract`, `events.merge`, `timeline.build`): Multi-source artifact event extraction, chronological synthesis, deduplication, and supertimeline building.
- **The Sleuth Kit (TSK)** (`files.list`, `metadata.extract`, `hash`): Deterministic filesystem discovery, archive inspection, image/binary namespace extraction, and cryptographic integrity verification.
- **Sigma Rules / Splunk SPL** (`correlate`): Multi-branch correlation matrix synthesizing execution events, suspicious archives, C2 beacons, persistence, and YARA hits into actionable findings.

---

## 6. Execution Semantics, Security & Path Jailing

### 6.1 Deterministic Execution Cache
Evidra incorporates a deterministic execution cache. The JOCKY executor computes a SHA-256 fingerprint from the AST capability and resolved arguments for each operation. If a run matches an existing fingerprint, it skips redundant filesystem scanning, loads the cached results from the SQLite `execution_cache` table, and marks the step as `reused`.

### 6.2 Path Jailing & Forensic Integrity
To prevent accidental evidence contamination or directory traversal exploits:
- Destination paths (e.g. `export findings > "./Outputs/data.json"`) are strictly jailed within the active case directory.
- Any attempt to escape the workspace boundary using parent traversal (`../`) is blocked by path canonicalization and verification.
- Original evidence sources are always opened in read-only mode (`O_RDONLY` / `rb`).

---

## 7. Developer & Team Quick Start

### 7.1 Setup Commands
```bash
# Install frontend dependencies
npm install

# Install Python runtime dependencies
python -m pip install -r requirements.txt
```

### 7.2 Launching the Application
```bash
# Terminal 1: Start the Evidra Python runtime server
python runtime/server.py

# Terminal 2: Launch the Electron desktop workstation
npm run electron:dev
```

### 7.3 Verification
```bash
# Run TypeScript compilation and Vite build check
npm run check
```
