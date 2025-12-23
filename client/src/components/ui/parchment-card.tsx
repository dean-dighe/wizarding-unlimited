import { cn } from "@/lib/utils";

interface ParchmentCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function ParchmentCard({ className, children, ...props }: ParchmentCardProps) {
  return (
    <div 
      className={cn(
        "relative p-6 rounded-lg bg-[#fdfbf7]",
        "border border-[#e6dcc3]",
        "shadow-sm shadow-[#d4c5a3]",
        "before:absolute before:inset-0 before:bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] before:opacity-50 before:pointer-events-none before:rounded-lg",
        className
      )}
      {...props}
    >
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
