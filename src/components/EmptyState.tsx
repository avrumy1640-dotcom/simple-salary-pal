import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-surface text-slate-600">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-4 rounded-full" size="sm">{actionLabel}</Button>
      )}
    </div>
  );
}
