# Evidra — Digital Forensic Workstation & JOCKY DSL

Evidra is a local-first, non-destructive digital forensic investigation environment designed for examining acquired evidence through a repeatable, analyst-oriented workflow. It combines a case workspace, evidence explorer, JOCKY procedure editor, exploratory Workbench, typed result viewers, interactive lineage and provenance graphs, visual building blocks, timeline correlation, and export paths into a unified desktop workstation.

---

## 🌟 Key Features & Capabilities

### 1. Modern Dark Slate Forensic Suite Aesthetics
- **Deep Obsidian / Dark Slate Palette**: Modern UI tokens (`#090d14` / `#0b1118` / `#0f172a` / `#1e293b`), emerald `#10b981` output accents, and purple `#a855f7` input/lineage accents across all views.
- **Unified Desktop Shell**: Clean top menubar, status indicators, activity rail, case explorer, multi-tab editor, exploratory workbench, and typed results pane.
- **Clean Run Tracking**: Execution history tracks human-readable script names (`investigation.jocky`, `script_02_threat_hunter.jocky`) and clean case IDs without polluting case directories with random hash folders.

### 2. Dual-Engine Forensic Graph Navigation
- **Pipeline Execution View**:
  - Multi-script horizontal lanes showcasing sequential operation flows.
  - Single merged capability nodes displaying execution status badges (`✔ Completed`, `✖ Failed`, `! Warning`, pulse) without redundant companion cards.
  - Interactive canvas zoom controls (`＋ Zoom`, `－ Zoom`, `↺ Reset`) and bottom translucent minimap navigator.
- **Input-Output / Provenance View**:
  - **3-Column Architecture**:
    - **Column 1: Hierarchical Evidence Root & Artifact Tree**: Shows folders and files with badge counts (e.g. `3/5 files`, `1/2 folders`).
    - **Column 2: Script Execution Cards**: Displays active procedures with capability tags and purple highlight borders.
    - **Column 3: Export & Output Sinks**: Displays output artifacts (`findings.json`, `timeline.csv`).
  - **Interactive End-to-End Lineage Tracing**: Clicking any export or script activates glowing purple B-spline curves tracing back to the exact contributory evidence files, tagging them with purple checkmark badges (`✔`).
  - **Selected Item Inspection Drawer**: Slide-out right panel with **Details**, **Lineage**, and **Preview** tabs revealing full cryptographic hashes, metadata, upstream evidence files, and downstream usage.

### 3. Visual Building Blocks DAG Editor
- **Category Toolbar**: Quick filtering by forensic capability category:
  - `Input / Source` (evidence import, copy)
  - `Preparation` (unzip, mount, deduplicate)
  - `Examination` (file search, metadata extraction, strings)
  - `Analysis` (timeline reconstruction, prefetch parsing, IOC matching)
  - `Correlation` (multi-vector alert correlation)
  - `Output` (JSON, CSV, PDF report export)
  - `Tools` (hash verification, entropy calculation)
- **Compactable Block Cards**: Toggle between detailed and compact views for clean canvas organization.
- **Port Coding**:
  - **Green Output Ports** (`#10b981`): Emits filtered artifact collections or derived models.
  - **Purple Input Ports** (`#a855f7`): Receives upstream collections.
- **Multi-Branching DAG Flow**: Supports tree and multi-parent DAG topologies where a single evidence source feeds multiple analysis and extraction pipelines.
- **Canvas Minimap & Live JOCKY DSL Preview**: Real-time bidirectional synchronization showing generated JOCKY DSL syntax alongside visual blocks.

### 4. JOCKY Procedure Editor & Exploratory Workbench
- **Multi-tab code editor** with syntax highlighting, dirty indicator, and Ctrl+S saving.
- **Exploratory Workbench**: Cell-based workspace for rapid hypothesis testing without modifying the primary procedure.
- **Clickable preset templates**: "Quick Triage", "Deep Metadata Extraction", "Timeline Reconstruction", and "Multi-Vector Correlation".

### 5. Specialized Results Explorer
Typed forensic renderers for intermediate and final results:
- **`ArtifactCollection`**: Interactive table with file names, relative paths, size calculations, modification timestamps, and 1-click SHA-256 hash copying.
- **`MetadataCollection`**: Deep format inspector for Archives (`.zip` members & high-risk alerts), Binaries (PE/ELF architecture), Images (dimensions), Tabular (`.csv` schema), and Text (`.log` UTF-8 previews).
- **`EventCollection / Timeline`**: Chronological timeline stream with severity level badges (`INFO`, `WARN`, `ERROR`), event kinds, and timestamps.
- **`FindingCollection`**: Correlated forensic cards with severity indicators, confidence meters, and artifact/event references.
- **`Export`**: Verification of disk persistence, record count, and SHA-256 file digest.

---

## ðŸ“œ JOCKY DSL Syntax & Lifecycle

JOCKY structures digital forensic procedures into four deterministic stages aligned with standard forensic frameworks (NIST SP 800-86 & ISO/IEC 27037):

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
    timeline = timeline.build from events
    findings = correlate(suspicious, metadata, events)

[export]
    export findings > "./Outputs/findings.json"
```

---

## ðŸ›  Architectural Overview

```
JOCKY Source Text
    â”‚
    â–¼
Lexer & Parser (runtime/jocky/parser.py)
    â”‚
    â–¼
Investigation IR Lowering (runtime/jocky/ir.py)
    â”‚
    â–¼
Core Executor (runtime/evidra/executor.py)
    â”‚
    â–¼
FileSystem Forensic Provider (runtime/evidra/providers/filesystem.py)
    â”‚
    â–¼
Execution Fingerprinting & SQLite Cache (execution_cache)
    |
    V
Typed Result & Preserved CaseStore (.evidra/manifest.json)
```

For a deep-dive technical reference on graph mathematics, IR translation, keyword definitions, and Python engine rationale, see [`tests/ARCHITECTURE_AND_THEORY.md`](tests/ARCHITECTURE_AND_THEORY.md).

---

## âš™ï¸ Quick Start & Execution

### Prerequisites
- **Node.js**: 18.0 or higher
- **Python**: 3.10 or higher

### 1. Installation & Environment Setup
Run these one-time commands to prepare Node and Python dependencies:

```bash
# 1. Install frontend dependencies
npm install

# 2. Verify Python runtime environment (0 external dependencies required currently)
pip install -r requirements.txt
```

---

### 2. Running Evidra

#### ðŸ–¥ï¸ Option A: Native Desktop App (1-Command â€” Recommended)
For the desktop app, simply run:

```bash
npm run electron:dev
```
> **Note**: Electron automatically spawns both the Python runtime server (`runtime/server.py`) and Vite renderer in the background. **No separate terminal commands needed!**

---

#### ðŸŒ Option B: Web Browser Development Mode
If you prefer running in a web browser, open two terminals:

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

