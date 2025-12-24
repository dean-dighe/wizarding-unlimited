import { useGameState } from "@/hooks/use-game";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ScrollText, 
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
  Star,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
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

// Render text with house icons inline
function TextWithHouseIcons({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    // Split text by house names, keeping the house names
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
              <img 
                src={houseIcons[houseName]} 
                alt="" 
                className="w-4 h-4 inline-block align-text-bottom" 
              />
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
  imageUrl?: string;
}

// MODULE-LEVEL GLOBALS - persist across hot reloads and component remounts
// This prevents duplicate TTS calls that happen when React re-renders
// Keyed by conversationId to prevent cross-conversation issues
let globalNarratorActive = false;
let globalProcessedContent = new Map<number, Set<string>>();
let globalCurrentlyProcessing: string | null = null;
let globalActiveConversationId: number | null = null;
let globalTTSLock = false; // Atomic lock for TTS requests

// Helper to get processed set for a conversation
function getProcessedSet(conversationId: number): Set<string> {
  if (!globalProcessedContent.has(conversationId)) {
    globalProcessedContent.set(conversationId, new Set<string>());
  }
  return globalProcessedContent.get(conversationId)!;
}

// Reset state when switching conversations
function resetForNewConversation(conversationId: number) {
  if (globalActiveConversationId !== conversationId) {
    globalNarratorActive = false;
    globalCurrentlyProcessing = null;
    globalActiveConversationId = conversationId;
    globalTTSLock = false;
  }
}

// Atomic lock acquisition - returns true if lock acquired, false if already locked
function acquireTTSLock(): boolean {
  if (globalTTSLock) return false;
  globalTTSLock = true;
  return true;
}

function releaseTTSLock() {
  globalTTSLock = false;
}

// Collapsible paragraph for mobile - shows 1 line with tap to expand
// On desktop (sm+), always shows full text via CSS. On mobile, tap to expand.
function CollapsibleParagraph({ text, testId }: { text: string; testId: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div 
      className="cursor-pointer sm:cursor-default"
      onClick={() => setIsExpanded(true)}
      data-testid={testId}
    >
      <p 
        className={cn(
          "text-[#3d2914] text-sm sm:text-base leading-relaxed",
          !isExpanded && "line-clamp-1 sm:line-clamp-none"
        )}
      >
        <TextWithHouseIcons text={text} />
      </p>
      {/* Mobile-only hint - sm:hidden ensures it's invisible on desktop */}
      {!isExpanded && (
        <span 
          className="text-xs text-[#3d2914]/50 mt-1 flex items-center gap-1 sm:hidden"
          data-testid={`${testId}-hint`}
        >
          <ChevronDown className="w-3 h-3" />
          Tap to read
        </span>
      )}
    </div>
  );
}

export default function Game() {
  const [, params] = useRoute("/game/:id");
  const conversationId = params?.id ? parseInt(params.id) : null;
  
  const { data: state, isLoading: stateLoading } = useGameState(conversationId);
  const { messages, sendMessage, isStreaming, isGeneratingImage, storyProgress, chapterAdvance, streamError, clearError, retryLastMessage } = useChatStream(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrlRef = useRef<string | null>(null); // Track blob URL for cleanup
  const [isNarrating, setIsNarrating] = useState(false);
  
  // Ready messages - only these are displayed
  const [readyMessages, setReadyMessages] = useState<ReadyMessage[]>([]);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  
  // Counter to trigger re-processing after each TTS message completes
  const [processingTrigger, setProcessingTrigger] = useState(0);
  
  // TTS abort controller (component-level since it needs cleanup)
  const ttsAbortRef = useRef<AbortController | null>(null);
  
  // Mute state with localStorage persistence
  const [isMuted, setIsMuted] = useState(() => {
    try {
      const stored = localStorage.getItem("hogwarts-muted");
      return stored === "true";
    } catch {
      // localStorage may be unavailable in private browsing
      return false;
    }
  });
  // Use ref to access current mute state in async callbacks without adding
  // isMuted to effect dependencies (which would cause re-processing of messages)
  const isMutedRef = useRef(isMuted);

  // Mobile drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Keep ref in sync with state for async access
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Cleanup audio resources - also clears global narrator state
  const cleanupAudio = useCallback(() => {
    // Revoke blob URL to prevent memory leak
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
    // Clear global narrator state so message processing can continue
    globalNarratorActive = false;
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem("hogwarts-muted", String(newValue));
      } catch {
        // localStorage may be unavailable in private browsing
      }
      isMutedRef.current = newValue;
      if (newValue) {
        cleanupAudio();
      }
      return newValue;
    });
  }, [cleanupAudio]);

  // Strip metadata tags from content
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

  // Generate a simple hash of message content for dedup
  const getMessageKey = useCallback((msg: { role: string; content: string }) => {
    return `${msg.role}:${msg.content.slice(0, 100)}`;
  }, []);

  // Reset global state and cleanup when conversation changes
  useEffect(() => {
    if (conversationId) {
      // Stop any audio from previous conversation
      if (audioBlobUrlRef.current) {
        URL.revokeObjectURL(audioBlobUrlRef.current);
        audioBlobUrlRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      // Abort any pending TTS request from previous conversation
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort();
        ttsAbortRef.current = null;
      }
      setIsNarrating(false);
      setIsPreparingAudio(false);
      // Reset ready messages for new conversation
      setReadyMessages([]);
      // Clear the processed set for this conversation so messages can be re-shown
      // This handles returning to a previously viewed conversation
      globalProcessedContent.delete(conversationId);
      // Reset global state
      resetForNewConversation(conversationId);
    }
  }, [conversationId]);

  // Cleanup on unmount - stop audio and clear all state
  useEffect(() => {
    return () => {
      // Stop any playing audio and revoke blob URL
      if (audioBlobUrlRef.current) {
        URL.revokeObjectURL(audioBlobUrlRef.current);
        audioBlobUrlRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      // Abort any pending TTS request
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort();
        ttsAbortRef.current = null;
      }
      // Clear all global state
      globalNarratorActive = false;
      globalCurrentlyProcessing = null;
      releaseTTSLock();
    };
  }, []);

  // Process messages: prepare TTS and only show when ready
  useEffect(() => {
    // ATOMIC LOCK CHECK - must be FIRST before any other logic
    // This prevents React StrictMode double-mount from triggering duplicate TTS
    if (!acquireTTSLock()) return;
    
    // Don't process while streaming or without conversationId
    if (isStreaming) {
      releaseTTSLock();
      return;
    }
    if (messages.length === 0) {
      releaseTTSLock();
      return;
    }
    if (!conversationId) {
      releaseTTSLock();
      return;
    }
    // Already processing something - wait (using module-level global)
    if (globalCurrentlyProcessing !== null) {
      releaseTTSLock();
      return;
    }
    // Don't start new TTS if narrator is already active (speaking or preparing)
    if (globalNarratorActive) {
      releaseTTSLock();
      return;
    }
    
    // Get the processed set for this conversation
    const processedSet = getProcessedSet(conversationId);
    
    // PHASE 1: Process all user messages and muted/short assistant messages immediately
    // This allows full history to appear when returning to a conversation
    const immediateMessages: typeof messages = [];
    let ttsMessage: typeof messages[0] | null = null;
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const key = getMessageKey(msg);
      
      // Skip already processed
      if (processedSet.has(key)) continue;
      
      // User messages - add to immediate queue
      if (msg.role === "user") {
        processedSet.add(key);
        immediateMessages.push(msg);
        continue;
      }
      
      // Assistant messages - check if needs TTS
      const textToRead = stripMetadata(msg.content);
      const needsTTS = !isMutedRef.current && textToRead && textToRead.length > 20;
      
      if (!needsTTS) {
        // No TTS needed - add to immediate queue
        processedSet.add(key);
        immediateMessages.push(msg);
        continue;
      }
      
      // This message needs TTS - stop here and process it
      ttsMessage = msg;
      break;
    }
    
    // Add all immediate messages to ready queue
    if (immediateMessages.length > 0) {
      setReadyMessages(prev => [...prev, ...immediateMessages.map(m => ({ ...m }))]);
    }
    
    // If no TTS message to process, we're done
    if (!ttsMessage) {
      releaseTTSLock();
      return;
    }
    
    const messageKey = getMessageKey(ttsMessage);
    
    // Mark as processing
    globalCurrentlyProcessing = messageKey;
    processedSet.add(messageKey);
    
    // Get text for TTS
    const textToRead = stripMetadata(ttsMessage.content);
    
    // Capture message and conversationId for async closure
    const messageToAdd = { ...ttsMessage };
    const capturedConversationId = conversationId;
    
    // Create abort controller for this request
    const abortController = new AbortController();
    ttsAbortRef.current = abortController;
    
    // Mark narrator as active BEFORE starting TTS (module-level global)
    globalNarratorActive = true;
    
    // Fetch TTS audio, then show message and play
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
          console.error('TTS API error:', res.status, errorData);
          throw new Error(errorData.error || `TTS failed with status ${res.status}`);
        }
        return res.blob();
      })
      .then(blob => {
        globalCurrentlyProcessing = null;
        ttsAbortRef.current = null;
        setIsPreparingAudio(false);
        releaseTTSLock(); // Release lock after fetch completes
        
        // Verify conversation hasn't changed - discard if stale
        if (globalActiveConversationId !== capturedConversationId) {
          globalNarratorActive = false;
          return;
        }
        
        // Add message to ready queue
        setReadyMessages(prev => [...prev, messageToAdd]);
        
        // Play audio immediately (unless muted during fetch)
        if (!isMutedRef.current) {
          // Clean up any previous audio first
          cleanupAudio();
          
          const audioUrl = URL.createObjectURL(blob);
          audioBlobUrlRef.current = audioUrl; // Track for cleanup
          
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          globalNarratorActive = true; // Re-set since cleanupAudio cleared it
          setIsNarrating(true);
          
          audio.onended = () => {
            // Use cleanupAudio for consistent cleanup
            if (audioBlobUrlRef.current) {
              URL.revokeObjectURL(audioBlobUrlRef.current);
              audioBlobUrlRef.current = null;
            }
            setIsNarrating(false);
            audioRef.current = null;
            globalNarratorActive = false;
            // Trigger re-processing for next message
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
            // Trigger re-processing for next message
            setProcessingTrigger(prev => prev + 1);
          };
          
          audio.play().catch((playError) => {
            console.error('Audio play failed (mobile autoplay restriction?):', playError);
            if (audioBlobUrlRef.current) {
              URL.revokeObjectURL(audioBlobUrlRef.current);
              audioBlobUrlRef.current = null;
            }
            setIsNarrating(false);
            audioRef.current = null;
            globalNarratorActive = false;
            // Trigger re-processing for next message
            setProcessingTrigger(prev => prev + 1);
          });
        } else {
          // Muted during fetch - narrator state already inactive from earlier check
          globalNarratorActive = false;
          // Trigger re-processing for next message
          setProcessingTrigger(prev => prev + 1);
        }
      })
      .catch(err => {
        globalCurrentlyProcessing = null;
        ttsAbortRef.current = null;
        setIsPreparingAudio(false);
        globalNarratorActive = false;
        releaseTTSLock();
        
        // Abort errors - only show message if still same conversation
        if (err.name === 'AbortError') {
          // Only add message if conversation hasn't changed
          if (globalActiveConversationId === capturedConversationId) {
            setReadyMessages(prev => [...prev, messageToAdd]);
            // Trigger re-processing for next message
            setProcessingTrigger(prev => prev + 1);
          }
          return;
        }
        
        console.error('TTS error:', err);
        // Show message anyway on error, but only if still same conversation
        if (globalActiveConversationId === capturedConversationId) {
          setReadyMessages(prev => [...prev, messageToAdd]);
          // Trigger re-processing for next message
          setProcessingTrigger(prev => prev + 1);
        }
      });
      
  }, [messages, isStreaming, stripMetadata, getMessageKey, cleanupAudio, conversationId, processingTrigger]);

  // Scroll to bottom when new ready messages appear
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [readyMessages]);

  // Track previous messages length to detect rollbacks
  const prevMessagesLengthRef = useRef(messages.length);
  
  // Sync readyMessages when messages array shrinks (rollback scenario)
  // This handles the case where user message is rolled back on AI failure
  useEffect(() => {
    const prevLength = prevMessagesLengthRef.current;
    const currentLength = messages.length;
    
    // Update ref for next comparison
    prevMessagesLengthRef.current = currentLength;
    
    // If messages got shorter, we need to sync readyMessages
    if (currentLength < prevLength && readyMessages.length > currentLength) {
      // Trim readyMessages to match messages length
      setReadyMessages(prev => prev.slice(0, currentLength));
      
      // Also clear the processed set for the removed message
      if (conversationId) {
        const processedSet = getProcessedSet(conversationId);
        // Remove any keys from processed set that no longer have corresponding messages
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
    // Stop any current narration when user makes a selection
    // cleanupAudio() also clears globalNarratorActive
    cleanupAudio();
    // Release TTS lock in case we're in the middle of processing
    releaseTTSLock();
    // Abort any pending TTS request
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    sendMessage(choice);
  };

  // Get the last ready assistant message with choices and time
  const lastAssistantMessage = readyMessages.filter(m => m.role === "assistant").pop();
  const currentChoices = lastAssistantMessage?.choices || [];
  const currentGameTime = lastAssistantMessage?.gameTime || state?.gameTime || "Unknown";

  // Check if a choice contains a known spell
  const findSpellInChoice = useCallback((choice: string): string | null => {
    const knownSpells = state?.spells || [];
    // Check if any known spell appears in the choice text (case-insensitive)
    for (const spell of knownSpells) {
      // Use word boundary matching to avoid partial matches
      const regex = new RegExp(`\\b${spell}\\b`, 'i');
      if (regex.test(choice)) {
        return spell;
      }
    }
    return null;
  }, [state?.spells]);

  // Check if all messages have been processed - don't show choices if there are pending messages
  const hasPendingMessages = messages.length > readyMessages.length;

  // Determine if we're in initial loading state (no ready messages yet)
  const isInitialLoading = stateLoading || (messages.length > 0 && readyMessages.length === 0);

  if (isInitialLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#1a0b2e]">
        <Sparkles className="w-12 h-12 animate-spin mb-4 text-yellow-500" />
        <p className="font-serif text-xl animate-pulse text-purple-200">
          {isPreparingAudio ? "Preparing narration..." : "Consulting the oracles..."}
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-[#1a0b2e] text-[#fdfbf7] overflow-hidden">
      
      {/* Desktop Sidebar - Narrower */}
      <motion.div 
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="hidden lg:flex w-64 h-full bg-[#120521] border-r border-white/5 flex-col p-4 z-20 shadow-2xl overflow-y-auto flex-shrink-0"
      >
        {/* Chapter Advance Notification */}
        <AnimatePresence>
          {chapterAdvance && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded text-center"
            >
              <p className="text-yellow-300 font-serif text-sm">New Chapter!</p>
              <p className="text-yellow-100 text-xs mt-1">{chapterAdvance}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Character Header */}
        <div className="text-center border-b border-white/10 pb-4 mb-4">
          <h2 className="font-serif text-lg text-yellow-100 truncate" data-testid="text-player-name">
            {state?.playerName || "Wizard"}
          </h2>
          {state?.house && (
            <span className={cn(
              "text-xs font-medium uppercase tracking-wider",
              state.house === "Gryffindor" && "text-red-400",
              state.house === "Slytherin" && "text-green-400",
              state.house === "Ravenclaw" && "text-blue-400",
              state.house === "Hufflepuff" && "text-yellow-400",
            )} data-testid="text-house">
              {state.house}
            </span>
          )}
          <div className="flex items-center justify-center gap-1.5 text-yellow-300/80">
            <Clock className="w-3 h-3" />
            <span className="text-xs font-serif">{currentGameTime}</span>
          </div>
        </div>

        <div className="space-y-4 flex-1">
          <StatItem 
            icon={Heart} 
            label="Health" 
            value={`${state?.health ?? 100}%`} 
            color="text-red-400" 
          />
          <StatItem 
            icon={MapPin} 
            label="Location" 
            value={state?.location || "Unknown"} 
            color="text-emerald-400" 
          />
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-purple-300">
              <Backpack className="w-4 h-4" />
              <span className="font-serif uppercase tracking-wider text-xs">Inventory</span>
            </div>
            <div className="space-y-1">
              {state?.inventory?.length ? state.inventory.map((item, i) => (
                <div 
                  key={i}
                  className="bg-white/5 border border-white/5 rounded px-2 py-1.5 text-xs text-purple-100/80 truncate"
                  title={item}
                >
                  {item}
                </div>
              )) : <span className="text-xs text-white/30 italic">Empty...</span>}
            </div>
          </div>

          {/* Known Spells */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-blue-400">
              <Wand2 className="w-4 h-4" />
              <span className="font-serif uppercase tracking-wider text-xs">Known Spells</span>
            </div>
            <div className="space-y-1">
              {state?.spells?.length ? state.spells.map((spell, i) => (
                <div 
                  key={i}
                  className="bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1.5 text-xs text-blue-200/80 truncate"
                  title={spell}
                  data-testid={`spell-${i}`}
                >
                  {spell}
                </div>
              )) : <span className="text-xs text-white/30 italic">None learned yet...</span>}
            </div>
          </div>

          {/* Story Progress */}
          {storyProgress && (
            <div className="space-y-2 mt-4 pt-4 border-t border-white/10">
              <div className="flex items-center gap-2 text-yellow-400">
                <BookOpen className="w-4 h-4" />
                <span className="font-serif uppercase tracking-wider text-xs">Story Arc</span>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-purple-200 font-serif">{storyProgress.chapter}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 transition-all duration-500"
                      style={{ width: `${(storyProgress.chapterIndex / storyProgress.totalChapters) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/50">
                    {storyProgress.chapterIndex}/{storyProgress.totalChapters}
                  </span>
                </div>
                <p className="text-[10px] text-white/40 mt-1">
                  Decisions: {storyProgress.decisionCount}
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden min-w-0">
        {/* Unified Header Bar - Sticky at top */}
        <div className="sticky top-0 bg-[#120521] border-b border-white/5 px-2 sm:px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0 z-50">
          <div className="flex items-center gap-2 flex-shrink-0">
            <ScrollText className="w-4 h-4 text-yellow-500" />
            <span className="font-serif text-sm text-yellow-100/80 hidden sm:inline">Wizarding Sagas</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-xs flex-shrink min-w-0">
            <div className="hidden sm:flex items-center gap-1 text-yellow-400">
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span className="font-serif truncate">{currentGameTime.split(' - ')[1] || currentGameTime}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-red-400">
              <Heart className="w-3 h-3 flex-shrink-0" />
              <span>{state?.health ?? 100}%</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-400 min-w-0">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[80px] sm:max-w-[100px]">{state?.location || "Unknown"}</span>
            </div>
            <div className="sm:hidden flex items-center gap-1 text-red-400 flex-shrink-0">
              <Heart className="w-3 h-3 fill-current" />
              <span>{state?.health ?? 100}</span>
            </div>
            {/* Mute Toggle */}
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleMute}
              className={cn(
                "h-7 w-7 flex-shrink-0 transition-colors",
                isMuted ? "text-white/40" : "text-purple-400",
                isNarrating && !isMuted && "text-yellow-400 animate-pulse"
              )}
              data-testid="button-mute-toggle"
              title={isMuted ? "Unmute narration" : "Mute narration"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
            {/* Mobile Stats Drawer Toggle */}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
              className="lg:hidden h-7 w-7 flex-shrink-0 text-yellow-400"
              data-testid="button-stats-drawer"
              title="View character stats"
            >
              {mobileDrawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Mobile Stats Drawer - Magical Pull-down Panel */}
        <AnimatePresence>
          {mobileDrawerOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="lg:hidden overflow-hidden bg-gradient-to-b from-[#1a0b2e] to-[#120521] border-b border-purple-500/20"
            >
              <div className="p-4 space-y-4">
                {/* Character Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                      <Star className="w-5 h-5 text-yellow-300" />
                    </div>
                    <div>
                      <h3 className="font-serif text-yellow-100 font-medium" data-testid="mobile-player-name">
                        {state?.playerName || "Wizard"}
                      </h3>
                      {state?.house && (
                        <span className={cn(
                          "text-xs font-medium uppercase tracking-wider",
                          state.house === "Gryffindor" && "text-red-400",
                          state.house === "Slytherin" && "text-green-400",
                          state.house === "Ravenclaw" && "text-blue-400",
                          state.house === "Hufflepuff" && "text-yellow-400",
                        )} data-testid="mobile-house">
                          {state.house}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-yellow-300/80">
                    <Clock className="w-3 h-3" />
                    <span className="text-xs font-serif">{currentGameTime}</span>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Health */}
                  <div className="bg-white/5 border border-white/5 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-red-400 mb-1">
                      <Heart className="w-4 h-4 fill-current" />
                      <span className="text-xs uppercase tracking-wider">Health</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-500"
                        style={{ width: `${state?.health ?? 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-red-300 mt-1">{state?.health ?? 100}%</span>
                  </div>

                  {/* Location */}
                  <div className="bg-white/5 border border-white/5 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-emerald-400 mb-1">
                      <MapPin className="w-4 h-4" />
                      <span className="text-xs uppercase tracking-wider">Location</span>
                    </div>
                    <p className="text-sm text-emerald-200 truncate" title={state?.location || "Unknown"}>
                      {state?.location || "Unknown"}
                    </p>
                  </div>
                </div>

                {/* Inventory & Spells */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Inventory */}
                  <div className="bg-white/5 border border-white/5 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-purple-400 mb-2">
                      <Backpack className="w-4 h-4" />
                      <span className="text-xs uppercase tracking-wider">Inventory</span>
                    </div>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {state?.inventory?.length ? state.inventory.map((item, i) => (
                        <div 
                          key={i}
                          className="bg-purple-500/10 border border-purple-500/20 rounded px-2 py-1 text-xs text-purple-200 truncate"
                          title={item}
                        >
                          {item}
                        </div>
                      )) : <span className="text-xs text-white/30 italic">Empty...</span>}
                    </div>
                  </div>

                  {/* Known Spells */}
                  <div className="bg-white/5 border border-white/5 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-blue-400 mb-2">
                      <Wand2 className="w-4 h-4" />
                      <span className="text-xs uppercase tracking-wider">Spells</span>
                    </div>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {state?.spells?.length ? state.spells.map((spell, i) => (
                        <div 
                          key={i}
                          className="bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1 text-xs text-blue-200 truncate"
                          title={spell}
                        >
                          {spell}
                        </div>
                      )) : <span className="text-xs text-white/30 italic">None yet...</span>}
                    </div>
                  </div>
                </div>

                {/* Story Progress */}
                {storyProgress && (
                  <div className="bg-white/5 border border-white/5 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-yellow-400 mb-2">
                      <BookOpen className="w-4 h-4" />
                      <span className="text-xs uppercase tracking-wider">Story Progress</span>
                    </div>
                    <p className="text-sm text-purple-200 font-serif mb-2">{storyProgress.chapter}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 transition-all duration-500"
                          style={{ width: `${(storyProgress.chapterIndex / storyProgress.totalChapters) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-white/50">
                        {storyProgress.chapterIndex}/{storyProgress.totalChapters}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 mt-1">
                      {storyProgress.decisionCount} decisions made
                    </p>
                  </div>
                )}

                {/* Close hint */}
                <div className="text-center">
                  <button 
                    onClick={() => setMobileDrawerOpen(false)}
                    className="text-xs text-white/30 flex items-center gap-1 mx-auto"
                    data-testid="button-close-stats-drawer"
                  >
                    <ChevronUp className="w-3 h-3" />
                    <span>Tap to close</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Story Content - Scrollable area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6"
        >
          {readyMessages.map((message, i) => (
            <motion.div
              // Use stable key based on role + content prefix to prevent remounting
              key={`${message.role}-${i}-${message.content.slice(0, 50)}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {message.role === "assistant" ? (
                <div className="space-y-3 sm:space-y-4">
                  <ParchmentCard className="relative">
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
                  {message.imageUrl && (
                    <div className="relative w-full max-w-md mx-auto aspect-[4/3] rounded-lg overflow-hidden border border-white/10">
                      <img 
                        src={message.imageUrl} 
                        alt="Scene illustration" 
                        className="w-full h-full object-cover"
                        data-testid={`img-scene-${i}`}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-end">
                  <div className="bg-purple-900/40 border border-purple-500/20 rounded-lg px-3 py-2 max-w-[85%]">
                    <p className="text-purple-100 font-serif text-sm">{message.content}</p>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
          
          {/* Streaming/Loading indicator */}
          {(isStreaming || isGeneratingImage || isPreparingAudio || hasPendingMessages) && (
            <div className="flex items-center gap-2 text-purple-300">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span className="font-serif text-sm animate-pulse">
                {isGeneratingImage ? "Painting the scene..." : 
                 isPreparingAudio ? "Preparing narration..." :
                 isStreaming ? "The story unfolds..." :
                 "Processing..."}
              </span>
            </div>
          )}
          
          {/* Error State with Retry */}
          {streamError && !isStreaming && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-900/30 border border-red-500/30 rounded-lg p-4"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-red-200 font-serif text-sm mb-3">
                    {streamError.message}
                  </p>
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

        {/* Choice Buttons - Fixed at bottom - Only show when all messages are processed */}
        {currentChoices.length > 0 && !isStreaming && !isPreparingAudio && !hasPendingMessages && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-t border-white/10 bg-[#1a0b2e]/95 backdrop-blur p-2 sm:p-4 flex-shrink-0"
          >
            <div className="flex flex-col gap-2 max-w-2xl mx-auto">
              {currentChoices.map((choice, i) => {
                const spellMatch = findSpellInChoice(choice);
                const isSpellChoice = !!spellMatch;
                
                return (
                  <Button
                    key={i}
                    variant="outline"
                    onClick={() => handleChoiceClick(choice)}
                    className={cn(
                      "w-full text-left justify-start h-auto min-h-[44px] py-2 px-3 font-serif text-sm leading-normal whitespace-normal",
                      isSpellChoice 
                        ? "border-blue-400/50 bg-gradient-to-r from-blue-900/40 to-purple-900/40 text-blue-100 shadow-[0_0_15px_rgba(59,130,246,0.3)]" 
                        : "border-purple-500/30 bg-purple-900/20 text-purple-100"
                    )}
                    data-testid={`button-choice-${i}`}
                  >
                    {isSpellChoice ? (
                      <Wand2 className="w-4 h-4 mr-2 flex-shrink-0 text-blue-300" />
                    ) : (
                      <span className="text-yellow-500 mr-2 flex-shrink-0">{i + 1}.</span>
                    )}
                    <span className="flex-1"><TextWithHouseIcons text={choice} /></span>
                    {isSpellChoice && (
                      <Sparkles className="w-3 h-3 ml-2 flex-shrink-0 text-blue-300/60" />
                    )}
                  </Button>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function StatItem({ icon: Icon, label, value, color }: { 
  icon: any; 
  label: string; 
  value: string; 
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className={cn("w-4 h-4 flex-shrink-0", color)} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-white/40 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-white/90 truncate font-serif" title={value}>{value}</p>
      </div>
    </div>
  );
}
