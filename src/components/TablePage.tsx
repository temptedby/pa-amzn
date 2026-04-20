import clsx from "clsx";
import { Topbar } from "./Topbar";

export interface Column {
  key: string;
  label: string;
  align?: "left" | "right";
}

interface TablePageProps {
  title: string;
  subtitle?: string;
  columns: Column[];
  emptyMessage: string;
  children?: React.ReactNode;
}

export function TablePage({ title, subtitle, columns, emptyMessage, children }: TablePageProps) {
  return (
    <>
      <Topbar title={title} subtitle={subtitle} />
      <main className="flex-1 p-6 bg-surface">
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={clsx(
                      "px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide",
                      c.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {children ?? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-16 text-center text-sm text-muted"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
