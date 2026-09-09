# Evidra — Digital Forensic Workstation & JOCKY DSL

Evidra is a local-first, non-destructive digital forensic investigation environment designed for examining acquired evidence through a repeatable, analyst-oriented workflow. It combines a case workspace, evidence explorer, JOCKY procedure editor, exploratory Workbench, typed result viewers, interactive lineage graph, visual building blocks, timeline correlation, and export paths into a unified desktop workstation.

---

## 🌟 Key Features & Capabilities

### 1. Unified VS Code-Style Case Explorer
- Managed case workspace (`.evidra/manifest.json`).
- Hierarchical file tree with context menus (New File, New Folder, Rename, Delete).
- Support for `.jocky` scripts, `.block` visual building blocks, `.json`, `.csv`, `.log`, and text files.
- Drag-to-resize sidebar width with collapse toggle.

### 2. JOCKY Procedure Editor
- Multi-tab file editor with syntax highlighting, dirty indicator, and Ctrl+S saving.
- 1-click **Run Procedure** execution engine.

### 3. Exploratory Workbench
- Cell-based workspace for rapid hypothesis testing without modifying the primary procedure.
- Clickable preset templates: "Quick Triage", "Deep Metadata Extraction", "Timeline Reconstruction", and "Multi-Vector Correlation".
- Instant typed result rendering in the Results Explorer.

### 4. Interactive Investigation Lineage Graph
- **Dotted Grid Background**: Professional forensics visual canvas (`radial-gradient(#9cb3bf 1.25px, transparent 1.25px)`).
- **Dual View Modes**:
  - **⌘ Pipeline Lineage Graph**: Shows horizontal execution columns from Evidence Source → Capability Operations → Typed Results → Export.
  - **◇ Evidence & Artifact Tree**: Displays Evidence Root with an **expandable/collapsible** artifact tree (grouped by file extension), connected to downstream operations and findings.
- **Draggable Nodes**: Drag any node across the canvas; smooth SVG Bézier curves update dynamically in real time.
- **Lineage Path Highlighting**: Clicking any node or artifact file bolds its exact connected path while dimming unrelated paths.
- **Even Port Spacing**: Anchors connection ports evenly vertically along the Evidence container to prevent line clumping.
- **In-App Zoom Controls**: `＋ Zoom`, `－ Zoom`, and `↺ Reset` buttons for scaling the canvas without distorting workstation UI.

### 5. Visual Building Blocks Editor
- Modular block representation:
  - **Import Source Block** (Output-only evidence provider).
  - **Transform / Analysis Block** (Implicitly accepts connected inputs and emits derived collections).
  - **Export Sink Block** (Persists results to disk).
- Add/remove blocks and 1-click **⚡ Reset Demo Blocks** generator for presentation flows.

### 6. Specialized Results Explorer
Typed forensic renderer for intermediate results:
- `ArtifactCollection` — Interactive table with file names, relative paths, size calculations, modification UTC timestamps, and 1-click SHA-256 hash copy.
- `MetadataCollection` — Deep format inspector for Archives (`.zip` members & high-risk alerts), Binaries (PE/ELF format, platform, architecture), Images (dimensions, aspect ratio), Tabular (`.csv` column schema & row count), and Text (`.log` UTF-8 previews).
- `EventCollection / Timeline` — Chronological timeline stream with severity level badges (`INFO`, `WARN`, `ERROR`), event kinds, and timestamps.
- `FindingCollection` — Correlated forensic cards with high/medium severity indicators, confidence meters, and artifact/event references.
- `Export` — Verification of disk persistence, record count, and SHA-256 file digest.

---

## 📜 JOCKY DSL Syntax & Lifecycle

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
Typed Result & Preserved CaseStore (.evidra/manifest.json)
```

For a deep-dive technical reference on graph mathematics, IR translation, keyword definitions, and Python engine rationale, see [`tests/ARCHITECTURE_AND_THEORY.md`](tests/ARCHITECTURE_AND_THEORY.md).

---

## ⚙️ Quick Start & Execution

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

#### 🖥️ Option A: Native Desktop App (1-Command — Recommended)
For the desktop app, simply run:

```bash
npm run electron:dev
```
> **Note**: Electron automatically spawns both the Python runtime server (`runtime/server.py`) and Vite renderer in the background. **No separate terminal commands needed!**

---

#### 🌐 Option B: Web Browser Development Mode
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
