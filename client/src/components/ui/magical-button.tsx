import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MagicalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  isLoading?: boolean;
}

export const MagicalButton = forwardRef<HTMLButtonElement, MagicalButtonProps>(
  ({ className, variant = "primary", isLoading, children, ...props }, ref) => {
    
    const variants = {
      primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-secondary-foreground/10",
      ghost: "hover:bg-primary/10 text-primary-foreground",
    };

    return (
      <button
        ref={ref}
        disabled={isLoading || props.disabled}
        className={cn(
          "relative inline-flex items-center justify-center px-6 py-3",
          "font-serif font-bold tracking-wide text-sm md:text-base rounded-lg transition-all duration-300",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "active:scale-95",
          variants[variant],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
MagicalButton.displayName = "MagicalButton";
