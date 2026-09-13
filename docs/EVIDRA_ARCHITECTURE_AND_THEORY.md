# Evidra & JOCKY DSL â€” Comprehensive Architecture, Theory & Presentation Defense Manual

**Document Category**: Technical System Architecture, Domain Theory, Judge Defense & Future Roadmap
**Target Audience**: Judges, System Architects, Core Developers, AI Coding Assistants

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
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ ANALYST INTENT (JOCKY DSL)                                                â”‚
â”‚   files.list -> metadata.extract -> events.extract -> correlate          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                      â”‚ Lowering via Parser & IR Engine
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ INVESTIGATION INTERMEDIATE REPRESENTATION (IR)                            â”‚
â”‚   Typed AST / IR Step Graph with Dependency Resolution                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                      â”‚ In-Process Capability Execution
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ LOCAL IN-PROCESS PYTHON FORENSIC ENGINE                                   â”‚
â”‚   Pure Python APIs (pathlib, hashlib, zipfile, struct, os)                â”‚
â”‚   Zero Sub-Process Spawning -> Zero EDR / AV Event Log 4688 Triggers     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## 2. Core Architecture & System Components

### 2.1 Dual-Engine Architecture
Evidra is built on a decoupled dual-engine model:
1. **Desktop GUI Shell (Electron 34 + React 18 + Vite)**:
   - Provides a VS Code-style Case Explorer, JOCKY Editor, Cell Workbench, Lineage Graph, Visual Building Blocks, and Typed Results Explorer.
   - Operates in complete local isolation without cloud dependency or telemetry phone-home.
2. **Python Forensic Core Engine (Python 3.10+)**:
   - Runs out-of-process as a local loopback HTTP/JSON-RPC server (`127.0.0.1:8765`).
   - Handles JOCKY lexing, AST parsing, IR lowering, non-destructive evidence materialization, and in-process forensic capabilities (`files.list`, `filter`, `metadata.extract`, `events.extract`, `prefetch.extract`, `ioc.match`, `correlate`, `export`).

### 2.2 Core File Map & Responsibilities

| File Path | Technology | Functional Responsibility |
| --- | --- | --- |
| `src/App.tsx` | React / TypeScript | Top-level application shell coordinating Activity Rail, Sidebar Case Explorer, Editor Tabs, Workbench, and Results Explorer. |
| `src/components/Graph.tsx` | React / TypeScript | Dual-view forensic graph controller: Pipeline Execution View (horizontal script lanes & status port badges) and top switcher to Provenance View. |
| `src/components/ProvenanceView.tsx` | React / TypeScript | 3-column input-output lineage view: Evidence Root Tree, Active Script Cards, Export Cards, glowing B-spline SVG tracing, and Selected Item inspection drawer. |
| `src/components/Blocks.tsx` | React / TypeScript | Visual Building Blocks DAG Editor: Category pills toolbar, compactable block cards, green/purple connection ports, multi-branching tree flow, minimap, and live JOCKY DSL preview. |
| `src/styles.css` | CSS3 | Dark slate modern forensic styling (`#090d14` / `#0b1118` / `#0f172a` / `#1e293b`), glow effects, custom scrollbars, and modal dialogs. |
| `runtime/server.py` | Python 3 | HTTP JSON-RPC backend server listening on `127.0.0.1:8765`, exposing `/api/execute`, `/api/case/*`, `/api/tree`, and universal CORS headers. |
| `runtime/jocky/parser.py` | Python 3 | JOCKY lexer, grammar parser, and AST builder. Parses 4-stage lifecycle headers (`[prepare]`, `[examine]`, `[analysis]`, `[export]`). |
| `runtime/jocky/ir.py` | Python 3 | Lowers AST to platform-neutral Investigation Intermediate Representation (IR), resolves variable references, and validates step dependencies. |
| `runtime/evidra/service.py` | Python 3 | Runtime orchestration service managing cases, source evidence registration, working copy materialization, and run executions. |
| `runtime/evidra/executor.py` | Python 3 | Step execution engine evaluating IR steps against Python forensic providers, with SQLite fingerprint caching and universal artifact coercion. |
| `runtime/evidra/case_store.py` | Python 3 / SQLite | Persistent case store (`.evidra/manifest.json` + SQLite database) tracking registered sources, procedures, run history with human-readable script names, operations, and typed results across sessions. |
| `runtime/evidra/filesystem_provider.py` | Python 3 | Low-level forensic capability provider executing pure Python file system traversal, deep format inspection (ZIP/PE/ELF/JPEG/CSV), log event parsing, prefetch executable extraction, and threat IOC matching. |

---

## 3. Unique Selling Propositions (USPs) & Engineering Justifications

| USP | Description | Engineering Reason & Benefit |
| --- | --- | --- |
| **1. LotLB & EDR Immunity** | Zero invocation of OS shells (`cmd.exe`, `powershell.exe`). All operations run in-process via native Python binary/filesystem primitives. | Eliminates Event Log 4688 process creation alerts and API hook triggers. |
| **2. Non-Destructive Integrity** | Original evidence sources are registered as read-only (`evidence.import`). Operations work on cryptographically hashed working copies (`copy source as "dest"`). | Preserves chain of custody; original evidence remains untouched. |
| **3. Deterministic 4-Stage Lifecycle** | Enforces NIST SP 800-86 forensic workflow (`[prepare]`, `[examine]`, `[analysis]`, `[export]`). | Prevents procedural errors and ensures auditable investigation logic. |
| **4. Cell Workbench vs Durable Procedure** | Exploratory Workbench cells allow testing individual capabilities without mutating the master JOCKY procedure file. | Speeds up analyst triage while keeping repeatable scripts clean. |
| **5. Typed Results Explorer** | Renders specialized views for `ArtifactCollection`, `MetadataCollection`, `EventCollection`, `PrefetchCollection`, `IOCCollection`, and `FindingCollection`. | Replaces raw console text outputs with structured, actionable forensic tables and cards. |
| **6. Dual Pipeline & Provenance Graphs** | Offers both a horizontal Pipeline Execution View with merged operation nodes and a 3-Column Input-Output Provenance View with glowing lineage tracing to contributory evidence files. | Gives analysts and stakeholders immediate visibility into multi-script operational status and cryptographic evidence lineage. |
| **7. Multi-Branching Visual Blocks DAG** | Visual workflow editor with categorized capability pills, compactable cards, green/purple connection ports, and live JOCKY DSL preview. | Bridges visual workflow modeling with executable DSL code in real time. |
| **8. Resilient Fingerprint Caching** | SQLite-backed AST execution caching with universal artifact coercion and clean script name persistence. | Prevents repetitive filesystem scanning and eliminates runtime crashes on cached artifact retrieval. |

---

## 4. JOCKY Language Specification & Keyword Reference

JOCKY is structured into four sequential stages:

```jocky
# JOCKY Forensic Investigation Procedure

[prepare]
    source = evidence.import "C:\Users\XYLA\Downloads\Valora"
    working = copy source as "working_evidence"

[examine]
    artifacts = files.list working
    suspicious = filter(extension == ".zip" | ".elf" | ".exe" | ".png") from artifacts
    metadata = metadata.extract suspicious

[analysis]
    events = events.extract from artifacts
    prefetch = prefetch.extract artifacts
    iocs = ioc.match artifacts
    timeline = timeline.build from events
    findings = correlate(suspicious, metadata, events, prefetch, iocs)

[export]
    export findings > "./Outputs/findings.json"
```

### Keywords & Capability Operations

- **`evidence.import "path"`**: Registers external evidence source directory into the case store without copying files.
- **`copy source as "dest"`**: Materializes a read-only working copy inside `workspace/Evidence/<dest>` and calculates SHA-256 baseline.
- **`files.list collection`**: Traverses directory tree recursively; extracts sizes, paths, extensions, timestamps, and SHA-256 hashes.
- **`filter(condition) from collection`**: Criteria-based filtering over typed collections (`extension == ".zip" | ".exe"`).
- **`metadata.extract collection`**: Performs deep format inspection: archive members (`.zip`), executable architecture (`PE/ELF`), image dimensions (`.png`/`.jpeg`), tabular columns (`.csv`), and text previews.
- **`events.extract collection`**: Scans text and log files for ISO 8601 UTC timestamped log events and formats structured event streams.
- **`prefetch.extract collection`**: Parses Windows Prefetch artifacts (`.pf`) or executable metadata to extract run count, last execution timestamp, and executable file paths.
- **`ioc.match collection`**: Cross-references artifact names, paths, and SHA-256 hashes against threat indicator rules (e.g. `mimikatz`, `cobaltstrike`, `psexec`).
- **`timeline.build from events`**: Sequences event records chronologically into an interactive timeline view.
- **`correlate(...)`**: Cross-correlates artifacts, metadata, log events, prefetch execution records, and IOC matches to emit high/medium/info severity findings with confidence scores and indicator lists.
- **`export findings > "./path.json"`**: Persists findings or collections to disk.

---

## 5. Exhaustive Judge Questions & Answers (Q&A Matrix)

### Q1: How does JOCKY prevent EDR/AV security solutions from triggering alerts?
**Answer**: EDR and AV solutions monitor process creation events (Windows Event ID 4688) and command-line execution strings of standard OS shells (`cmd.exe /c ...`, `powershell.exe -enc ...`). JOCKY does not generate shell commands. Instead, the JOCKY parser lowers procedures into an Intermediate Representation (IR) that is executed in-process by Evidra's local Python engine using native library calls (`pathlib`, `hashlib`, `struct`, `zipfile`). Because no sub-processes are spawned, no process creation events are generated, and EDR rules are not triggered.

### Q2: Is the original evidence safe from accidental modification?
**Answer**: Yes. Evidra enforces non-destructive investigation rules. `evidence.import` registers evidence sources as read-only references. The `copy source as "dest"` statement materializes a separate working copy inside the case workspace (`workspace/Evidence/`). All subsequent capabilities (`files.list`, `metadata.extract`, `correlate`) operate exclusively on the materialized working copy or in-memory collections, leaving original evidence untouched.

### Q3: What is the purpose of the `correlate` function, and how does it work?
**Answer**: In digital forensics, correlation connects isolated clues into a meaningful threat narrative. `correlate` accepts multiple inputs (`suspicious`, `metadata`, `events`, `prefetch`, `iocs`) and cross-references them:
- If high-risk extensions (`.exe`, `.elf`, `.ps1`), archive threats, IOC signature matches, or warning log events are present, `correlate` generates `HIGH` or `MEDIUM` severity findings detailing risk summary, confidence rating (e.g. 95%), indicator strings, affected artifact IDs (`ART-001`), and event IDs (`EVT-001`).
- If no threat indicators exist, `correlate` emits a `baseline_correlation` item with `INFO` severity confirming that all artifacts match normal filesystem baselines.

### Q4: Why use a cell-based Workbench alongside JOCKY procedure files?
**Answer**: Digital forensic investigation requires both exploratory triage and repeatable automation. The JOCKY Procedure Editor holds permanent, repeatable investigation scripts. The Workbench allows an analyst to run ad-hoc cells (e.g. testing `artifacts = files.list working` or `metadata = metadata.extract suspicious`) to inspect intermediate results in real time without modifying or polluting the master procedure script.

### Q5: How is execution history preserved across restarts?
**Answer**: Evidra maintains a managed case store inside each case folder under `.evidra/` powered by a local SQLite database (`case_store.py`). Every script run records its metadata, procedure source, step statuses (`completed`, `failed`, `blocked`), and typed result snapshots into `.evidra/manifest.json` and SQLite tables. When a case folder is reopened, Evidra loads registered sources, file trees, run history, and findings.

### Q6: How do the Interactive Lineage Graph and Visual Building Blocks work?
**Answer**:
- **Lineage Graph**: Renders data flow (Source â†’ Capability â†’ Result â†’ Findings â†’ Export) on a dotted-grid SVG canvas. Nodes can be dragged across the canvas, and cubic BÃ©zier SVG connection curves update dynamically. Clicking any node highlights its connected lineage path while dimming unrelated nodes.
- **Building Blocks**: A visual flowchart editor dividing capabilities into `Import Source` (providers), `Transform` (capabilities), and `Export Sink` (persistence) blocks, allowing visual workflow design for non-technical stakeholders.

---

## 6. Future Aspects & Roadmap of JOCKY

Evidra's architecture is built to expand JOCKY into an enterprise-grade forensic automation framework.

```
                  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                  â”‚         JOCKY LANGUAGE ROADMAP           â”‚
                  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                       â”‚
     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
     â–¼                                 â–¼                                 â–¼
Phase 1: Windows Artifacts       Phase 2: Live Memory             Phase 3: Compiler Backends
â”œâ”€â”€ Full .evtx Event Log parser  â”œâ”€â”€ Remote Volatility 3 engine   â”œâ”€â”€ Bytecode compilation
â”œâ”€â”€ Windows Registry hive parser â”œâ”€â”€ Process memory dump triage    â”œâ”€â”€ C++ Native Executor
â”œâ”€â”€ TCP/UDP Socket Netstat       â”œâ”€â”€ YARA memory scanning         â”œâ”€â”€ STIX/TAXII Threat Feed
â””â”€â”€ MFT / USN Journal parser     â””â”€â”€ Kernel object inspection     â””â”€â”€ Enterprise SIEM Export
```

### Phase 1: Windows Artifact Parsers (Short-Term Roadmap)
1. **Windows Event Log Parser (`events.parse_evtx`)**: Native binary parsing of `.evtx` files to extract Security Event IDs 4624 (Logon), 4625 (Failed Logon), 4672 (Admin Privileges), and 4688 (Process Creation).
2. **Registry Hive Parser (`registry.extract`)**: In-process extraction of Windows Registry hives (`SYSTEM`, `SOFTWARE`, `NTUSER.DAT`) to inspect Run keys, UserAssist execution history, and USB storage artifacts.
3. **Active Network Socket Triage (`network.connections`)**: Extraction of active TCP/UDP connection tables, listening ports, and remote IP addresses.
4. **MFT & USN Journal Parser (`ntfs.mft_parse`)**: Deep parsing of NTFS Master File Table (`$MFT`) and Change Journal (`$UsnJrnl`) for timestomping detection and deleted file recovery.

### Phase 2: Volatile Memory & Remote Forensic Acquisition (Medium-Term Roadmap)
1. **Volatile Memory Analysis (`memory.inspect`)**: Integration with in-process memory dump inspection engines to analyze RAM captures, extract injected DLLs, and discover hidden processes.
2. **YARA Pattern Compiler (`yara.match`)**: In-process compilation of YARA rules for custom threat hunting over binary artifacts and memory dumps.
3. **Encrypted Network Acquisition Channel (`evidence.remote_import`)**: Secure, authenticated remote agent acquisition over TLS 1.3 for enterprise incident response.

### Phase 3: Enterprise Integration & Compiler Backends (Long-Term Roadmap)
1. **JOCKY Bytecode Compiler (`jockyc`)**: Standalone CLI compiler emitting optimized JOCKY Intermediate Representation (JIR) bytecode for headless server execution.
2. **C++ Native Execution Core**: Optional native C++ provider backend for ultra-high-speed multi-terabyte disk image analysis.
3. **Enterprise SIEM Integration**: Export adapters emitting standardized CEF, Syslog, and STIX/TAXII threat intelligence payloads directly into Splunk, Microsoft Sentinel, or Elastic SIEM.

---

## 7. Self-Contained Knowledge Base for Developers & AI Assistants

If you are a developer or an AI assistant starting a new session on Evidra:
1. **Project Directory**: `c:/Projects/Evidra`
2. **Frontend Entry Point**: `src/App.tsx` (Single-file React component architecture holding Workspace, Editor, Workbench, Graph, Blocks, Docs, and Results components).
3. **Backend Service Entry Point**: `runtime/server.py` & `runtime/evidra/service.py`.
4. **Execution Flow**: `run()` in `App.tsx` -> `client.execute()` -> `/api/execute` in `server.py` -> `RuntimeService.execute()` -> `parse_jocky()` -> `lower_to_ir()` -> `execute_ir()` -> `FileSystemProvider` -> JSON Response to UI.
5. **Key Types**: `ArtifactRecord`, `MetadataRecord`, `EventCollection`, `PrefetchCollection`, `IOCCollection`, `FindingRecord`.
6. **Build Command**: `npm run check` (Runs TypeScript `tsc` and Vite build).



## Phase 2 Architecture Updates

### Aggressive Caching & Fingerprinting
Evidra incorporates a deterministic execution cache. The JOCKY executor computes a SHA-256 fingerprint from the AST capability and resolved arguments for each operation. If a run matches an existing fingerprint, it skips execution and instantly loads the results from the SQLite execution_cache table, returning a REUSED state.

### Path Jailing
To ensure forensic integrity and prevent arbitrary file system modifications, copy and export block destinations are strictly jailed. Custom paths (e.g. export findings > "Outputs/data.json") are resolved relative to the active workspace, and any attempt to use directory traversal (../../) outside the bounded evidence tree is securely rejected.

