# Evidra — Digital Forensic Workstation & JOCKY DSL

Evidra is a local-first, non-destructive digital forensic investigation environment designed for examining acquired evidence through a repeatable, analyst-oriented workflow. It combines a case workspace, evidence explorer, JOCKY procedure editor, exploratory Workbench, typed result viewers, interactive lineage and provenance graphs, visual building blocks, timeline correlation, and export paths into a unified desktop workstation.

---

## 🌟 Key Features & Capabilities

### 1. Modern Dark Slate Forensic Suite Aesthetics
- **Deep Obsidian / Dark Slate Palette**: Modern UI tokens (`#090d14` / `#0b1118` / `#0f172a` / `#1e293b`), emerald `#10b981` output accents, cyan `#38bdf8` evidence accents, and purple `#a855f7` preparation accents across all views.
- **Unified Desktop Shell**: Clean top menubar, status indicators, activity rail, case explorer, multi-tab editor, exploratory workbench, and typed results pane.
- **Clean Run Tracking**: Execution history tracks human-readable script names (`investigation.jocky`, `script_02_threat_hunter.jocky`) and durable SQLite case records without polluting case directories with arbitrary hash folders.

### 2. Visual Building Blocks DAG Workflow Builder
- **Top-to-Bottom Port Orientation**:
  - **Top Input Ports**: Centered at the top of cards for incoming data flow and dependencies.
  - **Bottom Output Ports**: Centered at the bottom of cards with category-coded glowing dots.
- **Interactive Drag-and-Drop Wires**:
  - Click and drag directly from any bottom output port. An animated dashed wire tracks the mouse in real time.
  - Releasing over a target node automatically creates the connection, binds the output variable to the target's input, and regenerates the JOCKY DSL.
- **Synchronous Coordinate Geometry (Zero-Lag Curves)**:
  - Vertical S-curves (`M x1 y1 C x1 y1+45, x2 y2-45, x2 y2`) calculated mathematically from node positions `(block.x, block.y)` with zero delay, detachment, or zoom drift.
- **Multi-Source & Functional Nodes**:
  - `Import Evidence`: Supports single or multiple source paths inside one node with an inline `+ Add Source` button.
  - `Extract Metadata`: Checkbox toggles for Basic Metadata, SHA-256 Hashes, File Types, Timestamps, and Extended Attributes.
  - `Filter Artifacts`: File extension predicates (`.zip`, `.exe`, `.bat`, `.ps1`) and size conditions.
  - `Combine Metadata` (`events.merge`): Merges multiple upstream branches into a unified dataset.
  - `Build Timeline`: Synthesizes timestamps into a chronological master investigation timeline.
  - `YARA Scan`: Scans artifacts with detection rulesets for indicators of compromise.
  - `Correlate Findings`: Multi-branch correlation synthesizing timeline events, metadata, and scan results.
  - `Export Results`: Dedicated export destination path and format specification (`.json`, `.csv`, `.html`).
- **Right-Hand "Block Details" Inspector Drawer**:
  - Clicking any node opens the right-side inspector.
  - Features `[Parameters]` and `[General]` tabs, connected upstream input tags, capability-specific checkboxes, output variable naming with type badges (`MetadataSet`, `TimelineEvents`, `ExportReport`), and a `▶ Run Block` action button.
- **Minimap, Zoom & DSL Sync**:
  - Floating minimap on bottom-left and zoom controls on bottom-right.
  - Real-time bidirectional synchronization with the JOCKY code editor.

### 3. Dual-Engine Forensic Graph Navigation
- **Pipeline Execution View**:
  - Multi-script horizontal lanes showcasing sequential operation flows.
  - Capability nodes with execution status badges (`COMPLETED`, `FAILED`, `RUNNING`, `SKIPPED`).
  - **Clickable Pipeline Nodes**: Clicking any step node highlights it and opens a right-hand **Step Details Drawer** showing execution status, category, duration, procedure origin with an "Open in Editor ↗" button, and execution output verification.
  - Cleaned-up header focused on execution progress and status toggling.
- **Input-Output / Provenance View**:
  - **3-Column Architecture**:
    - **Column 1: Hierarchical Evidence Root & Artifact Tree**: Folders and files with badge counts (e.g. `3/5 files`, `1/2 folders`) and contributory checkmarks (`✔`).
    - **Column 2: Script Execution Cards**: Active procedures with block counts and purple highlight borders.
    - **Column 3: Export & Output Sinks**: Generated report and dataset cards with types and sizes.
  - **Interactive Lineage Tracing**: Visual flow lines connecting input evidence through script operations to resulting exports.
  - **Selected Export Inspection Drawer**: Slide-out right panel with `Details`, `Lineage`, and `Preview` tabs revealing hashes, metadata, upstream evidence files, and downstream usage.

### 4. JOCKY Procedure Editor & Exploratory Workbench
- **Multi-tab code editor** with syntax highlighting, dirty indicator, and Ctrl+S saving.
- **Exploratory Workbench**: Cell-based workspace for rapid hypothesis testing without modifying the primary procedure.
- **Preset templates**: "Quick Triage", "Deep Metadata Extraction", "Timeline Reconstruction", and "Multi-Vector Correlation".

### 5. Specialized Results Explorer
Typed forensic renderers for intermediate and final results:
- **`ArtifactCollection`**: Interactive table with file names, relative paths, size calculations, modification timestamps, and 1-click SHA-256 hash copying.
- **`MetadataCollection`**: Deep format inspector for Archives (`.zip` members & high-risk alerts), Binaries (PE/ELF architecture), Images (dimensions), Tabular (`.csv` schema), and Text (`.log` UTF-8 previews).
- **`YaraResults`**: Signature match tables detailing matched rules, tags, target paths, offsets, and hex/byte strings.
- **`NetworkCollection`**: Network flow analysis rendering IP conversation endpoints, protocols (TCP/UDP), packet counts, DNS query resolution tables, and flagged C2 beacon ports.
- **`RegistryCollection`**: Categorized registry findings highlighting Auto-Start Extensibility Points (ASEPs: Run, RunOnce), decoded ROT13 UserAssist execution histories, and USBSTOR device histories.
- **`MemoryCollection`**: Volatile memory inspection rendering active process tables (PID, PPID, virtual offset, threads, start time), DKOM hidden unlinked process alerts, and RWX code injection / shellcode stager tables.
- **`VerificationReport`**: Formal NIST SP 800-86 cryptographic integrity audit report (`VERIFIED` vs `CONTAMINATED`) with artifact SHA-256 match tallies.
- **`EventCollection / Timeline`**: Chronological timeline stream with severity level badges (`INFO`, `WARN`, `ERROR`), event kinds, and timestamps.
- **`FindingCollection`**: Correlated forensic cards with severity indicators, confidence meters, and artifact/event references.
- **`Export`**: Verification of disk persistence, record count, and SHA-256 file digest.

### 6. Forensic Tool Lineage & Industry Standards Attribution
Evidra implements and formalizes methodologies from premier open-source and industry-standard forensic tools:
- **Volatility 3 Specification** (`memory.analyze` / `memory.processes`): Scans raw memory images (`.raw`, `.dmp`, `.vmem`, `.mem`), carves EPROCESS structures, identifies DKOM unlinked processes (ActiveProcessLinks evasion), detects RWX code injections & shellcode stagers (Cobalt Strike / Metasploit), and flags anomalous parent-child execution lineages.
- **Eric Zimmerman EvtxECmd** (`evtx.parse`): Windows Event Log parser extracting critical security events: Process Creation (4688), Successful/Failed Logons (4624/4625), Service Installation (7045), and Anti-Forensic Audit Log Cleared (1102).
- **NIST SP 800-86 Specification** (`hash.verify`): Automated cryptographic integrity audit comparing acquired artifact hashes against chain-of-custody baselines to certify evidence integrity.
- **VirusTotal YARA** (`yara.scan`): Signature matching engine for threat indicators, custom `.yar` rules, and built-in incident response triage rulesets (Mimikatz, PowerShell obfuscation, WebShells, Ransomware notes).
- **Wireshark / Zeek Network Analysis Specification** (`pcap.analyze`): Binary Libpcap parser supporting little-endian and big-endian PCAP captures, Ethernet frames, IPv4, TCP/UDP headers, conversation flows, DNS request extraction, and automated detection/flagging of C2 beacon ports (4444, 1337, 8888, 7070, 50050, 9999).
- **Eric Zimmerman RECmd / Harlan Carvey RegRipper** (`registry.parse`): Windows registry hive and `.reg` export parser extracting Auto-Start Extensibility Points (ASEPs: Run, RunOnce), UserAssist execution history with ROT13 deciphering, and USBSTOR connected storage hardware tracking.
- **Eric Zimmerman PECmd** (`prefetch.extract` / `artifacts.parse_prefetch`): Binary Windows SCCA prefetch header parsing across NT versions (XP, Vista/7, 8.1, 10/11), MAM XPRESS Huffman decompression, and 64-bit FILETIME execution histories.
- **Plaso / log2timeline** (`events.extract`, `events.merge`, `timeline.build`): Multi-source artifact event extraction, chronological synthesis, deduplication, and supertimeline building.
- **The Sleuth Kit (TSK)** (`files.list`, `metadata.extract`, `hash`): Deterministic filesystem discovery, archive inspection, image/binary namespace extraction, and cryptographic integrity verification.
- **Sigma Rules / Splunk SPL** (`correlate`): Multi-branch correlation matrix synthesizing execution events, suspicious archives, network C2 beacons, registry persistence, and YARA hits into actionable findings.

---

## 📜 JOCKY DSL Syntax & Lifecycle

JOCKY structures digital forensic procedures into four deterministic stages aligned with standard forensic frameworks (NIST SP 800-86 & ISO/IEC 27037):

```jocky
# JOCKY Forensic Investigation Procedure

[prepare]
    source = evidence.import "C:\\Cases\\Evidence"
    working = copy source as "working_evidence"
    hash_report = hash working

[examine]
    artifacts = files.list working
    suspicious = filter(extension == ".zip" | ".exe" | ".bat" | ".ps1") from artifacts
    metadata = metadata.extract suspicious

[analysis]
    events = events.extract from suspicious
    timeline = timeline.build from events
    findings = correlate(suspicious, metadata, timeline)

[export]
    export findings > "./Outputs/findings.json"
```

---

## 🛠 Architectural Overview

```
JOCKY Source Text
    │
    ▼
Lexer & Parser (runtime/jocky/parser.py)
    │
    ▼
Investigation IR Lowering (runtime/jocky/ir.py)
    │
    ▼
Core Executor (runtime/evidra/executor.py)
    │
    ▼
FileSystem Forensic Provider (runtime/evidra/providers/filesystem.py)
    │
    ▼
Execution Fingerprinting & SQLite Cache (execution_cache)
    │
    ▼
Typed Result & Preserved CaseStore (.evidra/manifest.json & runtime-case.db)
```

For a deep-dive technical reference on graph mathematics, IR translation, keyword definitions, and Python engine rationale, see [`docs/EVIDRA_ARCHITECTURE_AND_THEORY.md`](docs/EVIDRA_ARCHITECTURE_AND_THEORY.md).

---

## ⚙️ Quick Start & Execution

### Prerequisites
- **Node.js**: 18.0 or higher
- **Python**: 3.10 or higher

### 1. Installation & Environment Setup
Run these commands in the project root:

```bash
# 1. Install frontend dependencies
npm install

# 2. Verify Python runtime environment
python -m pip install -r requirements.txt
```

---

### 2. Running Evidra

#### 🖥️ Desktop Application Mode (Recommended)
Launch the desktop application via Electron:

```bash
# 1. In terminal 1: Start the Evidra Python runtime server
python runtime/server.py

# 2. In terminal 2: Launch Electron desktop app
npm run electron:dev
```

#### 🌐 Web Browser Development Mode
If you prefer running in a web browser:

1. **Terminal 1 (Backend Server)**:
   ```bash
   python runtime/server.py
   ```
2. **Terminal 2 (Frontend Dev Server)**:
   ```bash
   npm run dev
   # Opens browser at http://localhost:5173
   ```

---

### 3. Verification & Build Check
```bash
# Run TypeScript compilation and Vite build check
npm run check
```
