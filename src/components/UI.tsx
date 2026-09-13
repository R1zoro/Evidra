import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function LogicalList({ items, empty }: { items: ReactNode[]; empty: string }) {
  return items.length ? <div className="logical-list">{items}</div> : <Empty text={empty} />;
}

export function Empty({ text }: { text: string }) {
  return <div className="sidebar-empty">{text}</div>;
}

export function ResultEmpty() {
  return (
    <div className="result-empty">
      <Icon name="evidence" />
      <strong>Results Explorer</strong>
      <span>Run a JOCKY procedure or cell to inspect typed results here.</span>
    </div>
  );
}
