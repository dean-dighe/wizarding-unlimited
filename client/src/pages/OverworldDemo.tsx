import { useState, useRef, useCallback, useEffect } from "react";
import { OverworldCanvas, OverworldCanvasRef } from "@/components/game/OverworldCanvas";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Heart, Backpack, Wand2, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CircleDot, Menu, Book, Scroll } from "lucide-react";

interface InteractiveObject {
  id: string;
  name: string;
  type: "npc" | "item" | "examine" | "trigger";
  x: number;
  y: number;
  dialogue?: string;
  portraitUrl?: string;
}

interface DialogueState {
  isOpen: boolean;
  speaker: string;
  text: string;
  choices: string[];
  portraitUrl?: string;
  onChoice?: (choice: string) => void;
}

const UNDERCROFT_OBJECTS: InteractiveObject[] = [
  {
    id: "professor",
    name: "The Professor",
    type: "npc",
    x: 240,
    y: 120,
    dialogue: "You've come. I wondered if you would have the nerve...",
  },
  {
    id: "ancient_tome",
    name: "Ancient Tome",
    type: "examine",
    x: 128,
    y: 72,
    dialogue: "A leather-bound book, its pages yellowed with age. Strange symbols dance across the cover, seeming to shift when you look directly at them.",
  },
  {
    id: "ritual_focus",
    name: "Ritual Focus",
    type: "item",
    x: 240,
    y: 180,
    dialogue: "A crystalline orb pulses with faint purple light. It feels warm to the touch.",
  },
  {
    id: "ritual_circle",
    name: "Step into the circle",
    type: "trigger",
    x: 240,
    y: 200,
    dialogue: "The arcane symbols flare to life as you approach. Power crackles in the air around you.",
  },
];

interface TouchControlsProps {
  onMove: (direction: "up" | "down" | "left" | "right" | null) => void;
  onInteract: () => void;
  onRunToggle?: () => void;
  isRunning?: boolean;
  disabled?: boolean;
}

function TouchControls({ onMove, onInteract, onRunToggle, isRunning, disabled }: TouchControlsProps) {
  const handleTouchStart = (direction: "up" | "down" | "left" | "right") => {
    if (!disabled) onMove(direction);
  };

  const handleTouchEnd = () => {
    onMove(null);
  };

  return (
    <div className="flex items-center justify-between w-full px-4 py-2">
      <div className="relative w-28 h-28">
        <button
          className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#2d2d44]/80 rounded-lg border border-[#6b4c9a] flex items-center justify-center active:bg-[#6b4c9a]/50 touch-none"
          onTouchStart={() => handleTouchStart("up")}
          onTouchEnd={handleTouchEnd}
          onMouseDown={() => handleTouchStart("up")}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
          data-testid="touch-up"
        >
          <ChevronUp className="w-6 h-6 text-[#c0a0e0]" />
        </button>
        <button
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#2d2d44]/80 rounded-lg border border-[#6b4c9a] flex items-center justify-center active:bg-[#6b4c9a]/50 touch-none"
          onTouchStart={() => handleTouchStart("down")}
          onTouchEnd={handleTouchEnd}
          onMouseDown={() => handleTouchStart("down")}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
          data-testid="touch-down"
        >
          <ChevronDown className="w-6 h-6 text-[#c0a0e0]" />
        </button>
        <button
          className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#2d2d44]/80 rounded-lg border border-[#6b4c9a] flex items-center justify-center active:bg-[#6b4c9a]/50 touch-none"
          onTouchStart={() => handleTouchStart("left")}
          onTouchEnd={handleTouchEnd}
          onMouseDown={() => handleTouchStart("left")}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
          data-testid="touch-left"
        >
          <ChevronLeft className="w-6 h-6 text-[#c0a0e0]" />
        </button>
        <button
          className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#2d2d44]/80 rounded-lg border border-[#6b4c9a] flex items-center justify-center active:bg-[#6b4c9a]/50 touch-none"
          onTouchStart={() => handleTouchStart("right")}
          onTouchEnd={handleTouchEnd}
          onMouseDown={() => handleTouchStart("right")}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
          data-testid="touch-right"
        >
          <ChevronRight className="w-6 h-6 text-[#c0a0e0]" />
        </button>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-[#1a1a2e] rounded-full border border-[#4a4a6a]" />
      </div>

      <button
        className={`w-12 h-12 rounded-lg border flex items-center justify-center touch-none text-xs font-bold ${
          isRunning
            ? "bg-[#6b4c9a] border-[#8b6cc0] text-white"
            : "bg-[#2d2d44]/80 border-[#6b4c9a] text-[#c0a0e0]"
        }`}
        onClick={onRunToggle}
        data-testid="touch-run"
      >
        RUN
      </button>

      <button
        className="w-16 h-16 bg-[#6b4c9a]/80 rounded-full border-2 border-[#8b6cc0] flex items-center justify-center active:bg-[#8b6cc0] active:scale-95 transition-transform touch-none shadow-[0_0_15px_rgba(107,76,154,0.5)]"
        onTouchStart={onInteract}
        onMouseDown={onInteract}
        disabled={disabled}
        data-testid="touch-interact"
      >
        <CircleDot className="w-8 h-8 text-white" />
      </button>
    </div>
  );
}

export default function OverworldDemo() {
  const canvasRef = useRef<OverworldCanvasRef>(null);
  const [dialogue, setDialogue] = useState<DialogueState>({
    isOpen: false,
    speaker: "",
    text: "",
    choices: [],
  });
  const [inventory, setInventory] = useState<string[]>(["Wand", "Hogwarts Robes"]);
  const [health] = useState(100);
  const [currentLocation] = useState("The Undercroft");
  const [showMenu, setShowMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 480, height: 360 });
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      
      if (mobile) {
        const maxWidth = Math.min(window.innerWidth - 16, 480);
        const aspectRatio = 4 / 3;
        const height = Math.min(maxWidth / aspectRatio, window.innerHeight * 0.45);
        const width = height * aspectRatio;
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      } else {
        setCanvasSize({ width: 480, height: 360 });
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        setIsRunning(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        setIsRunning(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleTouchMove = useCallback((direction: "up" | "down" | "left" | "right" | null) => {
    if (!canvasRef.current) return;
    
    const canvas = document.querySelector('[data-testid="overworld-canvas"] canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const keyMap: Record<string, string> = {
      up: "KeyW",
      down: "KeyS",
      left: "KeyA",
      right: "KeyD",
    };

    if (direction) {
      const event = new KeyboardEvent("keydown", { code: keyMap[direction], bubbles: true });
      canvas.dispatchEvent(event);
    } else {
      ["KeyW", "KeyS", "KeyA", "KeyD"].forEach(code => {
        const event = new KeyboardEvent("keyup", { code, bubbles: true });
        canvas.dispatchEvent(event);
      });
    }
  }, []);

  const handleTouchInteract = useCallback(() => {
    const canvas = document.querySelector('[data-testid="overworld-canvas"] canvas') as HTMLCanvasElement;
    if (canvas) {
      const event = new KeyboardEvent("keydown", { code: "KeyE", bubbles: true });
      canvas.dispatchEvent(event);
    }
  }, []);

  const handleInteraction = useCallback((obj: InteractiveObject) => {
    canvasRef.current?.pauseMovement();

    if (obj.type === "item") {
      setDialogue({
        isOpen: true,
        speaker: "",
        text: obj.dialogue || `You found: ${obj.name}`,
        choices: [`Take the ${obj.name}`, "Leave it"],
        portraitUrl: obj.portraitUrl,
        onChoice: (choice) => {
          if (choice.startsWith("Take")) {
            setInventory(prev => [...prev, obj.name]);
          }
          closeDialogue();
        },
      });
    } else if (obj.type === "npc") {
      setDialogue({
        isOpen: true,
        speaker: obj.name,
        text: obj.dialogue || "...",
        choices: getDialogueChoices(obj.id),
        portraitUrl: obj.portraitUrl,
        onChoice: (choice) => {
          handleDialogueChoice(obj.id, choice);
        },
      });
    } else if (obj.type === "examine") {
      setDialogue({
        isOpen: true,
        speaker: "",
        text: obj.dialogue || `You examine the ${obj.name}.`,
        choices: ["Continue"],
        onChoice: () => closeDialogue(),
      });
    } else if (obj.type === "trigger") {
      setDialogue({
        isOpen: true,
        speaker: "",
        text: obj.dialogue || "Something happens...",
        choices: ["Step forward", "Step back"],
        onChoice: (choice) => {
          if (choice === "Step forward") {
            setDialogue({
              isOpen: true,
              speaker: "The Professor",
              text: "Brave. Or foolish. We shall see which.",
              choices: ["Continue"],
              onChoice: () => closeDialogue(),
            });
          } else {
            closeDialogue();
          }
        },
      });
    }
  }, []);

  const getDialogueChoices = (npcId: string): string[] => {
    if (npcId === "professor") {
      return [
        "I'm ready for the trial.",
        "What is this place?",
        "I... I'm not sure about this.",
      ];
    }
    return ["Continue"];
  };

  const handleDialogueChoice = (npcId: string, choice: string) => {
    if (npcId === "professor") {
      if (choice.includes("ready")) {
        setDialogue({
          isOpen: true,
          speaker: "The Professor",
          text: "Ready? No one is ever truly ready. But your willingness... that speaks to something. Something dark, perhaps. We shall cultivate it.",
          choices: ["Continue"],
          onChoice: () => closeDialogue(),
        });
      } else if (choice.includes("place")) {
        setDialogue({
          isOpen: true,
          speaker: "The Professor",
          text: "The Undercroft. A place that does not exist. A gathering that never happened. Remember that, should anyone ask.",
          choices: ["I understand.", "And if I don't keep silent?"],
          onChoice: (c) => {
            if (c.includes("don't")) {
              setDialogue({
                isOpen: true,
                speaker: "The Professor",
                text: "Then you will learn why silence is the first trial. And possibly the last lesson you ever receive.",
                choices: ["Continue"],
                onChoice: () => closeDialogue(),
              });
            } else {
              closeDialogue();
            }
          },
        });
      } else {
        setDialogue({
          isOpen: true,
          speaker: "The Professor",
          text: "Doubt. How... expected. Leave now, if you wish. The door remembers those who flee. It will not open for them again.",
          choices: ["I'll stay.", "I need time to think."],
          onChoice: () => closeDialogue(),
        });
      }
    }
  };

  const closeDialogue = () => {
    setDialogue({ isOpen: false, speaker: "", text: "", choices: [] });
    canvasRef.current?.resumeMovement();
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#0a0a12] flex flex-col lg:flex-row overflow-hidden">
      <div className="flex-1 flex flex-col lg:flex-row">
        <div className="flex-shrink-0 flex flex-col items-center justify-center p-2 lg:p-4">
          <div className="flex items-center justify-between w-full max-w-[480px] px-2 mb-2">
            <h1 className="text-[#8b6cc0] font-serif text-sm lg:text-lg truncate">{currentLocation}</h1>
            <div className="flex items-center gap-2 lg:gap-4">
              <div className="flex items-center gap-1 text-red-400">
                <Heart className="w-3 h-3 lg:w-4 lg:h-4 fill-current" />
                <span className="text-xs lg:text-sm font-mono">{health}%</span>
              </div>
              <div className="flex items-center gap-1 text-purple-400">
                <Backpack className="w-3 h-3 lg:w-4 lg:h-4" />
                <span className="text-xs lg:text-sm font-mono">{inventory.length}</span>
              </div>
              <div className="flex items-center gap-1 text-blue-400">
                <Wand2 className="w-3 h-3 lg:w-4 lg:h-4" />
                <span className="text-xs lg:text-sm font-mono">9</span>
              </div>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 text-[#6b4c9a] hover:text-[#8b6cc0]"
                data-testid="button-menu"
              >
                <Menu className="w-4 h-4 lg:w-5 lg:h-5" />
              </button>
            </div>
          </div>

          <div className="relative">
            <OverworldCanvas
              ref={canvasRef}
              locationName="The Undercroft"
              playerName="Wizard"
              width={canvasSize.width}
              height={canvasSize.height}
              objects={UNDERCROFT_OBJECTS}
              onInteraction={handleInteraction}
              isPaused={dialogue.isOpen}
              isRunning={isRunning}
            />

            <AnimatePresence>
              {dialogue.isOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute inset-x-0 bottom-0 p-2"
                >
                  <div className="bg-[#1a1a2e]/95 border border-[#4a4a6a] rounded-lg p-3 lg:p-4 backdrop-blur-sm flex gap-3">
                    {dialogue.portraitUrl && (
                      <div className="flex-shrink-0 w-16 h-16 lg:w-20 lg:h-20 rounded-lg border border-[#6b4c9a] overflow-hidden bg-[#2d2d44]">
                        <img src={dialogue.portraitUrl} alt={dialogue.speaker} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {dialogue.speaker && (
                        <div className="text-[#8b6cc0] font-serif text-xs lg:text-sm mb-1 border-b border-[#4a4a6a]/50 pb-1">
                          {dialogue.speaker}
                        </div>
                      )}
                      <p className="text-[#e0d0f0] text-xs lg:text-sm leading-relaxed mb-2 font-serif">
                        {dialogue.text}
                      </p>
                      <div className="flex flex-wrap gap-1 lg:gap-2">
                        {dialogue.choices.map((choice, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            className="bg-[#2d2d44]/50 border-[#6b4c9a] text-[#c0a0e0] text-[10px] lg:text-xs px-2 py-1 h-auto min-h-[28px]"
                            onClick={() => dialogue.onChoice?.(choice)}
                            data-testid={`button-choice-${i}`}
                          >
                            {choice}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={closeDialogue}
                      className="absolute top-2 right-2 text-[#6b4c9a] hover:text-[#8b6cc0]"
                      data-testid="button-close-dialogue"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {isMobile && (
            <TouchControls
              onMove={handleTouchMove}
              onInteract={handleTouchInteract}
              onRunToggle={() => setIsRunning(!isRunning)}
              isRunning={isRunning}
              disabled={dialogue.isOpen}
            />
          )}

          {!isMobile && (
            <div className="text-center mt-2">
              <p className="text-[#4a4a6a] text-xs">
                WASD to move | E to interact | SHIFT to run
              </p>
            </div>
          )}
        </div>

        <div className={`flex-1 flex flex-col p-2 lg:p-4 lg:max-w-xs border-t lg:border-t-0 lg:border-l border-[#4a4a6a]/30 ${showMenu ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-[#1a1a2e]/50 rounded-lg border border-[#4a4a6a]/30 p-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Backpack className="w-4 h-4 text-[#8b6cc0]" />
              <h3 className="text-[#8b6cc0] text-xs font-mono">INVENTORY</h3>
            </div>
            <div className="flex flex-wrap gap-1">
              {inventory.map((item, i) => (
                <span key={i} className="text-[10px] bg-[#2d2d44] text-[#c0a0e0] px-2 py-1 rounded">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-[#1a1a2e]/50 rounded-lg border border-[#4a4a6a]/30 p-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Wand2 className="w-4 h-4 text-[#8b6cc0]" />
              <h3 className="text-[#8b6cc0] text-xs font-mono">KNOWN SPELLS</h3>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {["Lumos", "Nox", "Wingardium Leviosa", "Alohomora", "Reparo", "Incendio", "Flipendo", "Expelliarmus", "Rictusempra"].map((spell) => (
                <div key={spell} className="bg-[#2d2d44] text-[#a0c0e0] px-2 py-1 rounded truncate">
                  {spell}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#1a1a2e]/50 rounded-lg border border-[#4a4a6a]/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Scroll className="w-4 h-4 text-[#8b6cc0]" />
              <h3 className="text-[#8b6cc0] text-xs font-mono">CURRENT TRIAL</h3>
            </div>
            <div className="text-[#c0a0e0] text-xs">
              <p className="font-serif mb-1">Trial I: Secrecy</p>
              <p className="text-[#6b4c9a] text-[10px]">Prove you can keep silent. Low stakes, high tension.</p>
            </div>
          </div>

          <div className="mt-auto pt-3">
            <div className="flex items-center gap-2 text-[#4a4a6a] text-[10px]">
              <Book className="w-3 h-3" />
              <span>Year 3 | The Undercroft | 1993</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
