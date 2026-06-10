import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Megaphone, Plus } from "lucide-react";

export const Route = createFileRoute("/app/announcements")({
  head: () => ({ meta: [{ title: "Announcements — Paylo" }] }),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Broadcast updates to the whole company or specific departments."
        actions={<Button size="sm" className="gradient-brand text-primary-foreground"><Plus className="mr-1 h-4 w-4" />New announcement</Button>}
      />
      <EmptyState
        icon={Megaphone}
        title="No announcements yet"
        description="Send your first company-wide update — payroll changes, holiday hours, new benefits — and reach every employee in seconds."
        action={<Button size="sm" className="gradient-brand text-primary-foreground">Create announcement</Button>}
      />
    </div>
  );
}
