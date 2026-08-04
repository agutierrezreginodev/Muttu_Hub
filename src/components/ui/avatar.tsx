import { cn } from "@/lib/utils";

interface AvatarProps {
  label: string;
  className?: string;
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

/**
 * Initials avatar chip per the brand manual's `.avatar` pattern: a 26px
 * rose-100/rose-700 circle carrying up to two initials derived from a
 * display name.
 */
export function Avatar({ label, className }: AvatarProps) {
  return (
    <span
      title={label}
      aria-hidden="true"
      className={cn(
        "grid size-[26px] shrink-0 place-items-center rounded-full bg-rose-100 text-[10.5px] font-bold text-rose-700",
        className,
      )}
    >
      {initials(label)}
    </span>
  );
}
