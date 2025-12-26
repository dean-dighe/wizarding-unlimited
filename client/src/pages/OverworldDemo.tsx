import { useState, useRef, useCallback } from "react";
import { OverworldCanvas, OverworldCanvasRef } from "@/components/game/OverworldCanvas";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Heart, Backpack, Wand2, X } from "lucide-react";

interface InteractiveObject {
  id: string;
  name: string;
  type: "npc" | "item" | "examine" | "trigger";
  x: number;
  y: number;
  dialogue?: string;
}

interface DialogueState {
  isOpen: boolean;
  speaker: string;
  text: string;
  choices: string[];
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

  const handleInteraction = useCallback((obj: InteractiveObject) => {
    canvasRef.current?.pauseMovement();

    if (obj.type === "item") {
      setDialogue({
        isOpen: true,
        speaker: "",
        text: obj.dialogue || `You found: ${obj.name}`,
        choices: [`Take the ${obj.name}`, "Leave it"],
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
    <div className="min-h-screen bg-[#0a0a12] flex flex-col items-center justify-center p-4">
      <div className="relative">
        <div className="absolute -top-12 left-0 right-0 flex items-center justify-between px-2">
          <h1 className="text-[#8b6cc0] font-serif text-lg">{currentLocation}</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-red-400">
              <Heart className="w-4 h-4 fill-current" />
              <span className="text-sm font-mono">{health}%</span>
            </div>
            <div className="flex items-center gap-1 text-purple-400">
              <Backpack className="w-4 h-4" />
              <span className="text-sm font-mono">{inventory.length}</span>
            </div>
            <div className="flex items-center gap-1 text-blue-400">
              <Wand2 className="w-4 h-4" />
              <span className="text-sm font-mono">9</span>
            </div>
          </div>
        </div>

        <OverworldCanvas
          ref={canvasRef}
          locationName="The Undercroft"
          playerName="Wizard"
          width={480}
          height={360}
          objects={UNDERCROFT_OBJECTS}
          onInteraction={handleInteraction}
          isPaused={dialogue.isOpen}
        />

        <AnimatePresence>
          {dialogue.isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-x-0 bottom-0 p-2"
            >
              <div className="bg-[#1a1a2e]/95 border border-[#4a4a6a] rounded-lg p-4 backdrop-blur-sm">
                {dialogue.speaker && (
                  <div className="text-[#8b6cc0] font-serif text-sm mb-2 border-b border-[#4a4a6a]/50 pb-1">
                    {dialogue.speaker}
                  </div>
                )}
                <p className="text-[#e0d0f0] text-sm leading-relaxed mb-3 font-serif">
                  {dialogue.text}
                </p>
                <div className="flex flex-wrap gap-2">
                  {dialogue.choices.map((choice, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="bg-[#2d2d44]/50 border-[#6b4c9a] text-[#c0a0e0] text-xs"
                      onClick={() => dialogue.onChoice?.(choice)}
                      data-testid={`button-choice-${i}`}
                    >
                      {choice}
                    </Button>
                  ))}
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

      <div className="mt-8 max-w-md text-center">
        <h2 className="text-[#6b4c9a] font-mono text-xs mb-2">PROOF OF CONCEPT</h2>
        <p className="text-[#4a4a6a] text-xs">
          Use WASD or Arrow keys to move. Press E or Space near objects to interact.
          The Professor awaits in the center. Explore the Undercroft.
        </p>
      </div>

      <div className="mt-4 p-3 bg-[#1a1a2e]/50 rounded border border-[#4a4a6a]/30 max-w-md">
        <h3 className="text-[#8b6cc0] text-xs font-mono mb-2">INVENTORY</h3>
        <div className="flex flex-wrap gap-2">
          {inventory.map((item, i) => (
            <span key={i} className="text-[10px] bg-[#2d2d44] text-[#c0a0e0] px-2 py-1 rounded">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
