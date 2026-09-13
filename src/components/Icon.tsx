import { getFileType } from "../utils";

export function Icon({ name }: { name: string }) {
  const glyphs: Record<string, string> = {
    explorer: "▣",
    source: "⌁",
    evidence: "◇",
    procedure: "</>",
    runs: "◷",
    findings: "✦",
    graph: "⌘",
    blocks: "▦",
    settings: "⚙",
    folder: "📁",
    folderOpen: "📂",
    file: "📄",
    jockyFile: "⚡",
    jsonFile: "{}",
    csvFile: "≡",
    textFile: "¶",
    play: "▶",
    plus: "+",
    newFile: "📄+",
    newFolder: "📁+",
    refresh: "↻",
    collapse: "⇱",
    close: "×",
    edit: "✎",
    trash: "🗑",
    check: "✓",
    save: "💾",
    bookmark: "✦",
    arrowDown: "↓",
  };
  return <span className={`icon icon-${name}`} aria-hidden="true">{glyphs[name] ?? "•"}</span>;
}

export function getFileIcon(name: string, kind: "file" | "directory", expanded?: boolean) {
  if (kind === "directory") return expanded ? "folderOpen" : "folder";
  const type = getFileType(name);
  if (type === "jocky") return "jockyFile";
  if (type === "json") return "jsonFile";
  if (type === "csv") return "csvFile";
  return "textFile";
}
