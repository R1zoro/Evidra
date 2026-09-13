export type FsNode = { name: string; path: string; kind: "file" | "directory"; children?: FsNode[] };
export type View = "JOCKY" | "WORKBENCH" | "GRAPH" | "BLOCKS" | "DOCS" | "HELP";
export type SideView = "EXPLORER" | "SOURCES" | "EVIDENCE" | "PROCEDURES" | "RUNS" | "EXPORTS";
export type Menu = "File" | "Edit" | "View" | "Run" | "Help" | "More" | null;
export type Status = "completed" | "failed" | "skipped" | "reused";
export type { CaseSnapshot } from "./api/runtimeClient";

export type BlockCategory = "import-source" | "transform" | "export";
export interface VisualBlock {
  id: string;
  category: BlockCategory;
  title: string;
  operation: string;
  detail: string;
}

export type DocumentType = "jocky" | "json" | "csv" | "text";
export type OpenDoc = {
  path: string;
  name: string;
  content: string;
  type: DocumentType;
  isDirty?: boolean;
};

export type Finding = {
  id: string;
  title: string;
  detail: string;
  source: string;
  operationId?: string;
  timestamp: string;
  type: string;
};

export type FileDialog =
  | { type: "new-file"; targetDir: string }
  | { type: "new-folder"; targetDir: string }
  | { type: "rename"; targetPath: string; currentName: string; isDir: boolean }
  | { type: "delete"; targetPath: string; isDir: boolean }
  | null;

export type ContextMenu = {
  x: number;
  y: number;
  node: FsNode;
} | null;

declare global {
  interface Window {
    evidraDesktop?: {
      chooseDirectory: () => Promise<string | null>;
      chooseSource: () => Promise<string | null>;
      tree: (root: string) => Promise<FsNode[]>;
      readFile: (root: string, relative: string) => Promise<string>;
      writeFile: (root: string, relative: string, content: string) => Promise<string>;
      createFolder: (root: string, relative: string) => Promise<string>;
      rename: (root: string, from: string, to: string) => Promise<string>;
      delete: (root: string, relative: string) => Promise<boolean>;
      windowControl: (action: "minimize" | "maximize" | "close") => void;
    };
  }
}
