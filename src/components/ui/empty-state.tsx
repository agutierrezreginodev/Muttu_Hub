import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Empty-state primitive per the brand manual's `.empty` pattern: a rounded
 * "blob" icon badge, a display heading, a muted lede, and an optional
 * primary action.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("px-6 py-11 text-center", className)}>
      {icon ? (
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[20px_20px_20px_7px] border border-rose-200 bg-rose-50 text-rose-600">
          {icon}
        </div>
      ) : null}
      <h4 className="font-display mb-1.5 text-[19px] font-bold text-foreground">
        {title}
      </h4>
      {description ? (
        <p className="mx-auto mb-[18px] max-w-[38ch] text-[13.5px] text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
