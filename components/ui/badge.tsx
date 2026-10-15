import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider", {
  variants: {
    tone: {
      neutral: "border-ink-700 bg-ink-850 text-ink-300",
      signal: "border-signal/40 bg-signal/10 text-signal",
      probe: "border-probe/40 bg-probe/10 text-probe",
      think: "border-think/40 bg-think/10 text-think",
      speak: "border-speak/40 bg-speak/10 text-speak",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
