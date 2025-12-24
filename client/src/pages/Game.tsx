import { useGameState } from "@/hooks/use-game";
import { useChatStream } from "@/hooks/use-chat-stream";
import { positionToCoordinates, useGameCanvasData } from "@/hooks/use-game-canvas";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Heart, 
  MapPin, 
  Backpack, 
  Sparkles,
  Clock,
  Volume2,
  VolumeX,
  BookOpen,
  Wand2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { GameCanvas } from "@/components/game/GameCanvas";
import { ParchmentCard } from "@/components/ui/parchment-card";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import gryffindorIcon from "@assets/generated_images/gryffindor_lion_crest_icon.png";
import slytherinIcon from "@assets/generated_images/slytherin_snake_crest_icon.png";
import ravenclawIcon from "@assets/generated_images/ravenclaw_eagle_crest_icon.png";
import hufflepuffIcon from "@assets/generated_images/hufflepuff_badger_crest_icon.png";

const houseIcons: Record<string, string> = {
  Gryffindor: gryffindorIcon,
  Slytherin: slytherinIcon,
  Ravenclaw: ravenclawIcon,
  Hufflepuff: hufflepuffIcon,
};

const houseNames = ["Gryffindor", "Slytherin", "Ravenclaw", "Hufflepuff"];

const houseColors: Record<string, string> = {
  Gryffindor: "text-red-400",
  Slytherin: "text-green-400",
  Ravenclaw: "text-blue-400",
  Hufflepuff: "text-yellow-400",
};

function TextWithHouseIcons({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    const regex = new RegExp(`(${houseNames.join('|')})`, 'gi');
    return text.split(regex);
  }, [text]);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        const houseName = houseNames.find(h => h.toLowerCase() === part.toLowerCase());
        if (houseName) {
          return (
            <span key={i} className="inline-flex items-center gap-0.5">
              <img src={houseIcons[houseName]} alt="" className="w-4 h-4 inline-block align-text-bottom" />
              <span>{part}</span>
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

interface ReadyMessage {
  role: "user" | "assistant";
  content: string;
  choices?: string[];
  gameTime?: string;
}

// MODULE-LEVEL GLOBALS for TTS
let globalNarratorActive = false;
let globalProcessedContent = new Map<number, Set<string>>();
let globalCurrentlyProcessing: string | null = null;
let globalActiveConversationId: number | null = null;
let globalTTSLock = false;

function getProcessedSet(conversationId: number): Set<string> {
  if (!globalProcessedContent.has(conversationId)) {
    globalProcessedContent.set(conversationId, new Set<string>());
  }
  return globalProcessedContent.get(conversationId)!;
}

function resetForNewConversation(conversationId: number) {
  if (globalActiveConversationId !== conversationId) {
    globalNarratorActive = false;
    globalCurrentlyProcessing = null;
    globalActiveConversationId = conversationId;
    globalTTSLock = false;
  }
}

function acquireTTSLock(): boolean {
  if (globalTTSLock) return false;
  globalTTSLock = true;
  return true;
}

function releaseTTSLock() {
  globalTTSLock = false;
}

// Collapsible paragraph for mobile
function CollapsibleParagraph({ text, testId }: { text: string; testId: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div 
      className="cursor-pointer sm:cursor-default"
      onClick={() => setIsExpanded(true)}
      data-testid={testId}
    >
      <p className={cn(
        "text-[#3d2914] text-sm sm:text-base leading-relaxed",
        !isExpanded && "line-clamp-1 sm:line-clamp-none"
      )}>
        <TextWithHouseIcons text={text} />
      </p>
      {!isExpanded && (
        <span className="text-xs text-[#3d2914]/50 mt-1 flex items-center gap-1 sm:hidden">
          <ChevronDown className="w-3 h-3" />
          Tap to read
        </span>
      )}
    </div>
  );
}

// Compact stat badge for header
function StatBadge({ icon: Icon, value, color, label }: { 
  icon: any; 
  value: string | number; 
  color: string;
  label?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", color)} title={label}>
      <Icon className="w-3.5 h-3.5" />
      <span className="text-xs font-medium truncate max-w-[60px]">{value}</span>
    </div>
  );
}

// Expandable details panel for mobile
function DetailPanel({ 
  isOpen, 
  onToggle, 
  state, 
  storyProgress, 
  currentGameTime 
}: { 
  isOpen: boolean; 
  onToggle: () => void; 
  state: any;
  storyProgress: any;
  currentGameTime: string;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden bg-[#0d0618] border-b border-purple-500/20"
        >
          <div className="p-3 space-y-3">
            {/* Character Info */}
            <div className="flex items-center gap-3 pb-2 border-b border-white/10">
              {state?.house && (
                <img 
                  src={houseIcons[state.house]} 
                  alt={state.house} 
                  className="w-8 h-8"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-serif text-yellow-100 truncate" data-testid="mobile-player-name">
                  {state?.playerName || "Wizard"}
                </h3>
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <Clock className="w-3 h-3" />
                  <span>{currentGameTime}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-red-400">
                <Heart className="w-4 h-4 fill-current" />
                <span className="font-medium">{state?.health ?? 100}%</span>
              </div>
            </div>

            {/* Inventory & Spells in grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Inventory */}
              <div>
                <div className="flex items-center gap-1.5 text-purple-400 mb-1.5">
                  <Backpack className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider">Inventory</span>
                </div>
                <div className="space-y-0.5 max-h-20 overflow-y-auto">
                  {state?.inventory?.length ? state.inventory.slice(0, 5).map((item: string, i: number) => (
                    <div key={i} className="text-[11px] text-purple-200/70 truncate">{item}</div>
                  )) : <span className="text-[11px] text-white/30">Empty</span>}
                  {state?.inventory?.length > 5 && (
                    <span className="text-[10px] text-white/40">+{state.inventory.length - 5} more</span>
                  )}
                </div>
              </div>

              {/* Spells */}
              <div>
                <div className="flex items-center gap-1.5 text-blue-400 mb-1.5">
                  <Wand2 className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider">Spells</span>
                </div>
                <div className="space-y-0.5 max-h-20 overflow-y-auto">
                  {state?.spells?.length ? state.spells.slice(0, 5).map((spell: string, i: number) => (
                    <div key={i} className="text-[11px] text-blue-200/70 truncate">{spell}</div>
                  )) : <span className="text-[11px] text-white/30">None</span>}
                  {state?.spells?.length > 5 && (
                    <span className="text-[10px] text-white/40">+{state.spells.length - 5} more</span>
                  )}
                </div>
              </div>
            </div>

            {/* Story Progress */}
            {storyProgress && (
              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center gap-1.5 text-yellow-400 mb-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider">Chapter {storyProgress.chapterIndex}/{storyProgress.totalChapters}</span>
                </div>
                <p className="text-[11px] text-purple-200/70 truncate">{storyProgress.chapter}</p>
                <div className="h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 transition-all"
                    style={{ width: `${(storyProgress.chapterIndex / storyProgress.totalChapters) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <button 
              onClick={onToggle}
              className="w-full flex items-center justify-center gap-1 text-[10px] text-white/30 pt-1"
            >
              <ChevronUp className="w-3 h-3" />
              <span>Close</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Choice Panel Component
function ChoicePanel({ 
  choices, 
  onSelect, 
  findSpellInChoice,
  isDisabled 
}: { 
  choices: string[]; 
  onSelect: (choice: string) => void;
  findSpellInChoice: (choice: string) => string | null;
  isDisabled: boolean;
}) {
  if (choices.length === 0 || isDisabled) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-t border-purple-500/30 bg-[#0d0618]/95 backdrop-blur-sm p-2 sm:p-3"
    >
      <div className="max-h-[35vh] overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-purple-500/30 scrollbar-track-transparent">
        <div className="flex flex-col gap-1.5 max-w-2xl mx-auto">
          {choices.map((choice, i) => {
            const spellMatch = findSpellInChoice(choice);
            const isSpellChoice = !!spellMatch;
            
            return (
              <Button
                key={i}
                variant="outline"
                onClick={() => onSelect(choice)}
                className={cn(
                  "w-full text-left justify-start h-auto min-h-[44px] py-2.5 px-3 font-serif text-sm leading-relaxed whitespace-normal",
                  isSpellChoice 
                    ? "border-blue-400/50 bg-gradient-to-r from-blue-900/40 to-purple-900/40 text-blue-100 shadow-[0_0_12px_rgba(59,130,246,0.25)]" 
                    : "border-purple-500/30 bg-purple-900/20 text-purple-100"
                )}
                data-testid={`button-choice-${i}`}
              >
                {isSpellChoice ? (
                  <Wand2 className="w-4 h-4 mr-2 flex-shrink-0 text-blue-300" />
                ) : (
                  <span className="text-yellow-500/80 mr-2 flex-shrink-0 text-xs">{i + 1}.</span>
                )}
                <span className="flex-1"><TextWithHouseIcons text={choice} /></span>
                {isSpellChoice && (
                  <Sparkles className="w-3 h-3 ml-2 flex-shrink-0 text-blue-300/60" />
                )}
              </Button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

export default function Game() {
  const [, params] = useRoute("/game/:id");
  const conversationId = params?.id ? parseInt(params.id) : null;
  
  const { data: state, isLoading: stateLoading } = useGameState(conversationId);
  const { messages, sendMessage, isStreaming, storyProgress, chapterAdvance, streamError, clearError, retryLastMessage } = useChatStream(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrlRef = useRef<string | null>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  
  // Ready messages
  const [readyMessages, setReadyMessages] = useState<ReadyMessage[]>([]);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [processingTrigger, setProcessingTrigger] = useState(0);
  const ttsAbortRef = useRef<AbortController | null>(null);
  
  // Mute state
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return localStorage.getItem("hogwarts-muted") === "true";
    } catch {
      return false;
    }
  });
  const isMutedRef = useRef(isMuted);

  // Detail panel state (for mobile)
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Sprite URLs from game state
  const playerSpriteUrl = state?.playerSpriteUrl || undefined;
  const npcSpriteUrls = state?.npcSpriteUrls || {};

  // Fetch map data for current location
  const { tilesetUrl, tilemapData, isMapGenerating, spawnPoints, environmentSprites } = useGameCanvasData(state?.playerName, state?.location);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const cleanupAudio = useCallback(() => {
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsNarrating(false);
    globalNarratorActive = false;
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newValue = !prev;
      try { localStorage.setItem("hogwarts-muted", String(newValue)); } catch {}
      isMutedRef.current = newValue;
      if (newValue) cleanupAudio();
      return newValue;
    });
  }, [cleanupAudio]);

  const stripMetadata = useCallback((content: string): string => {
    return content
      .replace(/\[IMAGE: [^\]]+\]\n?/g, '')
      .replace(/\[TIME: [^\]]+\]\n?/g, '')
      .replace(/\[SCENE: [^\]]+\]\n?/g, '')
      .replace(/\[Choice \d+: [^\]]+\]\n?/g, '')
      .replace(/\[HEALTH: [^\]]+\]\n?/g, '')
      .replace(/\[ITEM_ADD: [^\]]+\]\n?/g, '')
      .replace(/\[ITEM_REMOVE: [^\]]+\]\n?/g, '')
      .replace(/\[SPELL_LEARN: [^\]]+\]\n?/g, '')
      .replace(/\[LOCATION: [^\]]+\]\n?/g, '')
      .trim();
  }, []);

  const getMessageKey = useCallback((msg: { role: string; content: string }) => {
    return `${msg.role}:${msg.content.slice(0, 100)}`;
  }, []);

  // Reset on conversation change
  useEffect(() => {
    if (conversationId) {
      if (audioBlobUrlRef.current) {
        URL.revokeObjectURL(audioBlobUrlRef.current);
        audioBlobUrlRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort();
        ttsAbortRef.current = null;
      }
      setIsNarrating(false);
      setIsPreparingAudio(false);
      setReadyMessages([]);
      globalProcessedContent.delete(conversationId);
      resetForNewConversation(conversationId);
    }
  }, [conversationId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioBlobUrlRef.current) {
        URL.revokeObjectURL(audioBlobUrlRef.current);
        audioBlobUrlRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort();
        ttsAbortRef.current = null;
      }
      globalNarratorActive = false;
      globalCurrentlyProcessing = null;
      releaseTTSLock();
    };
  }, []);

  // Process messages with TTS
  useEffect(() => {
    if (!acquireTTSLock()) return;
    
    if (isStreaming || messages.length === 0 || !conversationId || globalCurrentlyProcessing !== null || globalNarratorActive) {
      releaseTTSLock();
      return;
    }
    
    const processedSet = getProcessedSet(conversationId);
    const immediateMessages: typeof messages = [];
    let ttsMessage: typeof messages[0] | null = null;
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const key = getMessageKey(msg);
      
      if (processedSet.has(key)) continue;
      
      if (msg.role === "user") {
        processedSet.add(key);
        immediateMessages.push(msg);
        continue;
      }
      
      const textToRead = stripMetadata(msg.content);
      const needsTTS = !isMutedRef.current && textToRead && textToRead.length > 20;
      
      if (!needsTTS) {
        processedSet.add(key);
        immediateMessages.push(msg);
        continue;
      }
      
      ttsMessage = msg;
      break;
    }
    
    if (immediateMessages.length > 0) {
      setReadyMessages(prev => [...prev, ...immediateMessages.map(m => ({ ...m }))]);
    }
    
    if (!ttsMessage) {
      releaseTTSLock();
      return;
    }
    
    const messageKey = getMessageKey(ttsMessage);
    globalCurrentlyProcessing = messageKey;
    processedSet.add(messageKey);
    
    const textToRead = stripMetadata(ttsMessage.content);
    const messageToAdd = { ...ttsMessage };
    const capturedConversationId = conversationId;
    
    const abortController = new AbortController();
    ttsAbortRef.current = abortController;
    globalNarratorActive = true;
    setIsPreparingAudio(true);
    
    fetch("/api/tts/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textToRead }),
      signal: abortController.signal,
    })
      .then(async res => {
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `TTS failed with status ${res.status}`);
        }
        return res.blob();
      })
      .then(blob => {
        globalCurrentlyProcessing = null;
        ttsAbortRef.current = null;
        setIsPreparingAudio(false);
        releaseTTSLock();
        
        if (globalActiveConversationId !== capturedConversationId) {
          globalNarratorActive = false;
          return;
        }
        
        setReadyMessages(prev => [...prev, messageToAdd]);
        
        if (!isMutedRef.current) {
          cleanupAudio();
          
          const audioUrl = URL.createObjectURL(blob);
          audioBlobUrlRef.current = audioUrl;
          
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          globalNarratorActive = true;
          setIsNarrating(true);
          
          audio.onended = () => {
            if (audioBlobUrlRef.current) {
              URL.revokeObjectURL(audioBlobUrlRef.current);
              audioBlobUrlRef.current = null;
            }
            setIsNarrating(false);
            audioRef.current = null;
            globalNarratorActive = false;
            setProcessingTrigger(prev => prev + 1);
          };
          
          audio.onerror = () => {
            if (audioBlobUrlRef.current) {
              URL.revokeObjectURL(audioBlobUrlRef.current);
              audioBlobUrlRef.current = null;
            }
            setIsNarrating(false);
            audioRef.current = null;
            globalNarratorActive = false;
            setProcessingTrigger(prev => prev + 1);
          };
          
          audio.play().catch(() => {
            if (audioBlobUrlRef.current) {
              URL.revokeObjectURL(audioBlobUrlRef.current);
              audioBlobUrlRef.current = null;
            }
            setIsNarrating(false);
            audioRef.current = null;
            globalNarratorActive = false;
            setProcessingTrigger(prev => prev + 1);
          });
        } else {
          globalNarratorActive = false;
          setProcessingTrigger(prev => prev + 1);
        }
      })
      .catch(err => {
        globalCurrentlyProcessing = null;
        ttsAbortRef.current = null;
        setIsPreparingAudio(false);
        globalNarratorActive = false;
        releaseTTSLock();
        
        if (err.name === 'AbortError') {
          if (globalActiveConversationId === capturedConversationId) {
            setReadyMessages(prev => [...prev, messageToAdd]);
            setProcessingTrigger(prev => prev + 1);
          }
          return;
        }
        
        if (globalActiveConversationId === capturedConversationId) {
          setReadyMessages(prev => [...prev, messageToAdd]);
          setProcessingTrigger(prev => prev + 1);
        }
      });
      
  }, [messages, isStreaming, stripMetadata, getMessageKey, cleanupAudio, conversationId, processingTrigger]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [readyMessages]);

  // Handle rollbacks
  const prevMessagesLengthRef = useRef(messages.length);
  useEffect(() => {
    const prevLength = prevMessagesLengthRef.current;
    const currentLength = messages.length;
    prevMessagesLengthRef.current = currentLength;
    
    if (currentLength < prevLength && readyMessages.length > currentLength) {
      setReadyMessages(prev => prev.slice(0, currentLength));
      if (conversationId) {
        const processedSet = getProcessedSet(conversationId);
        const messageKeys = messages.map(m => `${m.role}:${m.content.slice(0, 100)}`);
        processedSet.forEach(key => {
          if (!messageKeys.some(mk => mk === key)) {
            processedSet.delete(key);
          }
        });
      }
    }
  }, [messages, readyMessages.length, conversationId]);

  const handleChoiceClick = (choice: string) => {
    cleanupAudio();
    releaseTTSLock();
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    sendMessage(choice);
  };

  const lastAssistantMessage = readyMessages.filter(m => m.role === "assistant").pop();
  const currentChoices = lastAssistantMessage?.choices || [];
  const currentGameTime = lastAssistantMessage?.gameTime || state?.gameTime || "Unknown";

  const findSpellInChoice = useCallback((choice: string): string | null => {
    const knownSpells = state?.spells || [];
    for (const spell of knownSpells) {
      const regex = new RegExp(`\\b${spell}\\b`, 'i');
      if (regex.test(choice)) return spell;
    }
    return null;
  }, [state?.spells]);

  const hasPendingMessages = messages.length > readyMessages.length;
  const isInitialLoading = stateLoading || (messages.length > 0 && readyMessages.length === 0);
  const showChoices = currentChoices.length > 0 && !isStreaming && !isPreparingAudio && !hasPendingMessages;

  if (isInitialLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0d0618]">
        <div className="relative">
          <Sparkles className="w-12 h-12 text-yellow-500 animate-pulse" />
          <div className="absolute inset-0 w-12 h-12 bg-yellow-500/20 rounded-full blur-xl animate-pulse" />
        </div>
        <p className="font-serif text-lg animate-pulse text-purple-200 mt-4">
          {isPreparingAudio ? "Preparing narration..." : "Consulting the oracles..."}
        </p>
      </div>
    );
  }

  // Calculate canvas dimensions based on screen size
  const getCanvasDimensions = () => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    
    if (isDesktop) {
      // Desktop: Game Boy style resolution scaled 2x
      return { width: 320, height: 288, scale: 1.5 };
    } else if (isMobile) {
      // Mobile: Fit to width with proper aspect ratio
      const baseWidth = Math.min(window.innerWidth - 24, 320);
      return { width: baseWidth, height: Math.floor(baseWidth * 0.9), scale: 1 };
    } else {
      // Tablet: Slightly larger
      return { width: 320, height: 288, scale: 1.25 };
    }
  };

  const canvasDimensions = getCanvasDimensions();

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-[#0d0618] text-[#fdfbf7] overflow-hidden">
      
      {/* LEFT PANEL - Canvas & Stats (Desktop) / Top Section (Mobile) */}
      <div className="lg:w-[520px] lg:h-full lg:flex-shrink-0 lg:border-r lg:border-purple-500/20 flex flex-col">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#080410] border-b border-purple-500/20">
          {/* Left: Player info */}
          <div className="flex items-center gap-2 min-w-0">
            {state?.house && (
              <img 
                src={houseIcons[state.house]} 
                alt={state.house} 
                className="w-6 h-6 flex-shrink-0"
              />
            )}
            <span className={cn(
              "font-serif text-sm truncate max-w-[100px]",
              state?.house ? houseColors[state.house] : "text-yellow-100"
            )} data-testid="text-player-name">
              {state?.playerName || "Wizard"}
            </span>
          </div>

          {/* Center: Stats */}
          <div className="flex items-center gap-3">
            <StatBadge icon={Heart} value={`${state?.health ?? 100}%`} color="text-red-400" label="Health" />
            <StatBadge icon={MapPin} value={state?.location?.split(' ').slice(0, 2).join(' ') || "?"} color="text-emerald-400" label={state?.location} />
            <div className="hidden sm:flex items-center gap-1 text-yellow-400/70">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-xs">{currentGameTime.split(' - ')[1] || currentGameTime}</span>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleMute}
              className={cn(
                "h-8 w-8",
                isMuted ? "text-white/40" : "text-purple-400",
                isNarrating && !isMuted && "text-yellow-400 animate-pulse"
              )}
              data-testid="button-mute-toggle"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="lg:hidden h-8 w-8 text-yellow-400/70"
              data-testid="button-details-toggle"
            >
              {detailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Detail Panel (Mobile only) */}
        <div className="lg:hidden">
          <DetailPanel 
            isOpen={detailsOpen} 
            onToggle={() => setDetailsOpen(false)} 
            state={state}
            storyProgress={storyProgress}
            currentGameTime={currentGameTime}
          />
        </div>

        {/* Chapter Notification */}
        <AnimatePresence>
          {chapterAdvance && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-gradient-to-r from-yellow-500/20 to-purple-500/20 border-b border-yellow-500/30 px-3 py-2 text-center"
            >
              <p className="text-yellow-300 font-serif text-sm">New Chapter: {chapterAdvance}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Canvas */}
        {state?.location && (
          <div className="flex justify-center p-2 sm:p-3 bg-[#081820] lg:flex-1 lg:items-center">
            {(() => {
              const npcPositions = state.npcPositions || {};
              const npcsWithPositions = Object.entries(npcPositions).map(([name, posString]) => {
                const pixelPos = positionToCoordinates(posString, canvasDimensions.width, canvasDimensions.height);
                return {
                  name,
                  spriteUrl: npcSpriteUrls[name] || "",
                  position: { x: pixelPos.x, y: pixelPos.y, facing: "down" as const }
                };
              });
              
              const scale = (canvasDimensions as any).scale || 1;
              
              return (
                <div 
                  style={{ 
                    transform: `scale(${scale})`, 
                    transformOrigin: "center center",
                  }}
                >
                  <GameCanvas
                    locationName={state.location}
                    playerName={state.playerName || "Player"}
                    playerSpriteUrl={playerSpriteUrl}
                    tilesetUrl={tilesetUrl}
                    tilemapData={tilemapData}
                    npcs={npcsWithPositions}
                    width={canvasDimensions.width}
                    height={canvasDimensions.height}
                    isMapGenerating={isMapGenerating}
                    spawnPoints={spawnPoints}
                    environmentSprites={environmentSprites}
                    onPlayerMove={(target) => console.log("Player moving to:", target)}
                    onInteraction={(npcName) => console.log("Interacting with:", npcName)}
                  />
                </div>
              );
            })()}
          </div>
        )}

        {/* Desktop: Stats Panel below canvas */}
        <div className="hidden lg:block border-t border-purple-500/20 bg-[#080410] p-3 space-y-3">
          {/* Inventory & Spells */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-purple-400 mb-2">
                <Backpack className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-medium">Inventory</span>
              </div>
              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {state?.inventory?.length ? state.inventory.map((item, i) => (
                  <div key={i} className="text-xs text-purple-200/70 truncate">{item}</div>
                )) : <span className="text-xs text-white/30">Empty</span>}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-blue-400 mb-2">
                <Wand2 className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-medium">Spells</span>
              </div>
              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {state?.spells?.length ? state.spells.map((spell, i) => (
                  <div key={i} className="text-xs text-blue-200/70 truncate" data-testid={`spell-${i}`}>{spell}</div>
                )) : <span className="text-xs text-white/30">None</span>}
              </div>
            </div>
          </div>

          {/* Story Progress */}
          {storyProgress && (
            <div className="pt-2 border-t border-white/10">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-yellow-400">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-medium">Story Progress</span>
                </div>
                <span className="text-[10px] text-white/40">{storyProgress.chapterIndex}/{storyProgress.totalChapters}</span>
              </div>
              <p className="text-xs text-purple-200/70 truncate mb-1">{storyProgress.chapter}</p>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 transition-all"
                  style={{ width: `${(storyProgress.chapterIndex / storyProgress.totalChapters) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL - Story & Choices */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        
        {/* Story Scroll Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 space-y-4"
        >
          {readyMessages.map((message, i) => (
            <motion.div
              key={`${message.role}-${i}-${message.content.slice(0, 50)}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {message.role === "assistant" ? (
                <ParchmentCard className="relative max-w-3xl">
                  <div className="font-serif space-y-3">
                    {stripMetadata(message.content).split('\n\n').map((para, j) => (
                      <CollapsibleParagraph 
                        key={j} 
                        text={para} 
                        testId={`text-paragraph-${i}-${j}`}
                      />
                    ))}
                  </div>
                </ParchmentCard>
              ) : (
                <div className="flex justify-end max-w-3xl ml-auto">
                  <div className="bg-purple-900/40 border border-purple-500/20 rounded-lg px-3 py-2 max-w-[85%]">
                    <p className="text-purple-100 font-serif text-sm">{message.content}</p>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
          
          {/* Loading indicator */}
          {(isStreaming || isPreparingAudio || hasPendingMessages) && (
            <div className="flex items-center gap-2 text-purple-300 max-w-3xl">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span className="font-serif text-sm animate-pulse">
                {isPreparingAudio ? "Preparing narration..." :
                 isStreaming ? "The story unfolds..." :
                 "Processing..."}
              </span>
            </div>
          )}
          
          {/* Error State */}
          {streamError && !isStreaming && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-900/30 border border-red-500/30 rounded-lg p-4 max-w-3xl"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-red-200 font-serif text-sm mb-3">{streamError.message}</p>
                  {streamError.canRetry && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={retryLastMessage}
                        className="border-red-500/30 text-red-200"
                        data-testid="button-retry"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Try Again
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearError}
                        className="text-red-200/60"
                        data-testid="button-dismiss-error"
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Choice Panel - Fixed at bottom */}
        <ChoicePanel 
          choices={currentChoices}
          onSelect={handleChoiceClick}
          findSpellInChoice={findSpellInChoice}
          isDisabled={!showChoices}
        />
      </div>
    </div>
  );
}
