import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { FolderOpen, FileText } from "lucide-react";

export const Route = createFileRoute("/employee/documents")({
  head: () => ({ meta: [{ title: "My documents — Paylo" }] }),
  component: Page,
});

interface Doc { id: string; title: string; category: string | null; created_at: string; }

function Page() {
  const { employee, loading } = useMyEmployee();
  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    if (!employee) return;
    (async () => {
      const { data } = await supabase
        .from("hr_documents")
        .select("id, title, category, created_at")
        .or(`employee_id.eq.${employee.id},employee_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(50);
      setDocs(((data ?? []) as unknown) as Doc[]);
    })();
  }, [employee?.id]);

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My documents</h1>
        <p className="text-sm text-muted-foreground">Handbook, policies, and forms shared with you.</p>
      </div>
      <div className="rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-3 text-sm font-medium">
          <FolderOpen className="h-4 w-4" /> {docs.length} document{docs.length === 1 ? "" : "s"}
        </div>
        {docs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No documents shared yet.</div>
        ) : (
          <ul className="divide-y">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.category ?? "Document"} · {new Date(d.created_at).toLocaleDateString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
