import { type StatusEffect } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { 
  Flame, 
  Snowflake, 
  Zap, 
  Skull, 
  CircleHelp, 
  Shield, 
  VolumeX, 
  Swords, 
  Eye, 
  Sparkles 
} from "lucide-react";

interface StatusBadgeProps {
  effect: StatusEffect;
  turnsRemaining: number;
  size?: "sm" | "default";
}

const STATUS_CONFIG: Record<StatusEffect, { 
  icon: typeof Flame; 
  color: string; 
  bgColor: string;
  label: string;
}> = {
  burning: { 
    icon: Flame, 
    color: "text-orange-200", 
    bgColor: "bg-orange-600 dark:bg-orange-700",
    label: "Burn" 
  },
  frozen: { 
    icon: Snowflake, 
    color: "text-cyan-200", 
    bgColor: "bg-cyan-600 dark:bg-cyan-700",
    label: "Freeze" 
  },
  stunned: { 
    icon: Zap, 
    color: "text-yellow-200", 
    bgColor: "bg-yellow-600 dark:bg-yellow-700",
    label: "Stun" 
  },
  poisoned: { 
    icon: Skull, 
    color: "text-purple-200", 
    bgColor: "bg-purple-600 dark:bg-purple-700",
    label: "Poison" 
  },
  confused: { 
    icon: CircleHelp, 
    color: "text-pink-200", 
    bgColor: "bg-pink-600 dark:bg-pink-700",
    label: "Confuse" 
  },
  shielded: { 
    icon: Shield, 
    color: "text-blue-200", 
    bgColor: "bg-blue-600 dark:bg-blue-700",
    label: "Shield" 
  },
  silenced: { 
    icon: VolumeX, 
    color: "text-gray-200", 
    bgColor: "bg-gray-600 dark:bg-gray-700",
    label: "Silence" 
  },
  enraged: { 
    icon: Swords, 
    color: "text-red-200", 
    bgColor: "bg-red-600 dark:bg-red-700",
    label: "Rage" 
  },
  invisible: { 
    icon: Eye, 
    color: "text-slate-200", 
    bgColor: "bg-slate-600 dark:bg-slate-700",
    label: "Invis" 
  },
  blessed: { 
    icon: Sparkles, 
    color: "text-amber-200", 
    bgColor: "bg-amber-500 dark:bg-amber-600",
    label: "Bless" 
  },
};

export function StatusBadge({ effect, turnsRemaining, size = "default" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[effect];
  if (!config) return null;
  
  const Icon = config.icon;
  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  
  return (
    <Badge 
      className={`${config.bgColor} ${config.color} gap-1 border-0`}
      data-testid={`status-badge-${effect}`}
    >
      <Icon className={iconSize} />
      {size === "default" && (
        <span className="text-xs">{config.label}</span>
      )}
      <span className="text-xs opacity-75">{turnsRemaining}</span>
    </Badge>
  );
}

export function StatusEffectList({ 
  effects,
  size = "default" 
}: { 
  effects: { effect: StatusEffect; turnsRemaining: number }[];
  size?: "sm" | "default";
}) {
  if (!effects.length) return null;
  
  return (
    <div className="flex flex-wrap gap-1" data-testid="status-effects-list">
      {effects.map((status, index) => (
        <StatusBadge 
          key={`${status.effect}-${index}`} 
          effect={status.effect} 
          turnsRemaining={status.turnsRemaining}
          size={size}
        />
      ))}
    </div>
  );
}
