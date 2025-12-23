import { useGameState } from "@/hooks/use-game";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useEffect, useRef, useState, useCallback } from "react";
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
} from "lucide-react";
import { ParchmentCard } from "@/components/ui/parchment-card";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ReadyMessage {
  role: "user" | "assistant";
  content: string;
  choices?: string[];
  gameTime?: string;
  imageUrl?: string;
}

export default function Game() {
  const [, params] = useRoute("/game/:id");
  const conversationId = params?.id ? parseInt(params.id) : null;
  
  const { data: state, isLoading: stateLoading } = useGameState(conversationId);
  const { messages, sendMessage, isStreaming, isGeneratingImage, storyProgress, chapterAdvance } = useChatStream(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  
  // Ready messages - only these are displayed
  const [readyMessages, setReadyMessages] = useState<ReadyMessage[]>([]);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  
  // Track processed messages by content hash to prevent any duplicates
  const processedContentRef = useRef<Set<string>>(new Set());
  const currentlyProcessingRef = useRef<string | null>(null);
  
  // Mute state with localStorage persistence
  const [isMuted, setIsMuted] = useState(() => {
    const stored = localStorage.getItem("hogwarts-muted");
    return stored === "true";
  });
  const isMutedRef = useRef(isMuted);
  
  // Keep ref in sync with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Cleanup audio resources
  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsNarrating(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newValue = !prev;
      localStorage.setItem("hogwarts-muted", String(newValue));
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

  // Process messages: prepare TTS and only show when ready
  useEffect(() => {
    // Don't process while streaming
    if (isStreaming) return;
    if (messages.length === 0) return;
    
    // Find the next unprocessed message by content
    let nextMessage: typeof messages[0] | null = null;
    let nextIndex = -1;
    
    for (let i = 0; i < messages.length; i++) {
      const key = getMessageKey(messages[i]);
      if (!processedContentRef.current.has(key) && currentlyProcessingRef.current !== key) {
        nextMessage = messages[i];
        nextIndex = i;
        break;
      }
    }
    
    if (!nextMessage || nextIndex === -1) return;
    
    const messageKey = getMessageKey(nextMessage);
    
    // Mark as currently processing IMMEDIATELY
    currentlyProcessingRef.current = messageKey;
    
    // User messages are ready immediately
    if (nextMessage.role === "user") {
      processedContentRef.current.add(messageKey);
      currentlyProcessingRef.current = null;
      setReadyMessages(prev => [...prev, { ...nextMessage! }]);
      return;
    }
    
    // Assistant messages need TTS preparation
    const textToRead = stripMetadata(nextMessage.content);
    
    // If muted or no text, show immediately without audio
    if (isMutedRef.current || !textToRead || textToRead.length <= 20) {
      processedContentRef.current.add(messageKey);
      currentlyProcessingRef.current = null;
      setReadyMessages(prev => [...prev, { ...nextMessage! }]);
      return;
    }
    
    // Capture message for async closure
    const messageToAdd = { ...nextMessage };
    
    // Fetch TTS audio, then show message and play
    setIsPreparingAudio(true);
    
    fetch("/api/tts/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textToRead }),
    })
      .then(res => {
        if (!res.ok) throw new Error("TTS failed");
        return res.blob();
      })
      .then(blob => {
        // Mark as processed BEFORE any state updates
        processedContentRef.current.add(messageKey);
        currentlyProcessingRef.current = null;
        setIsPreparingAudio(false);
        
        // Add message to ready queue
        setReadyMessages(prev => [...prev, messageToAdd]);
        
        // Play audio immediately (unless muted during fetch)
        if (!isMutedRef.current) {
          const audioUrl = URL.createObjectURL(blob);
          cleanupAudio();
          
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          setIsNarrating(true);
          
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            setIsNarrating(false);
            audioRef.current = null;
          };
          
          audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            setIsNarrating(false);
            audioRef.current = null;
          };
          
          audio.play().catch(() => {
            URL.revokeObjectURL(audioUrl);
            setIsNarrating(false);
            audioRef.current = null;
          });
        }
      })
      .catch(err => {
        console.error('TTS error:', err);
        // Show message anyway on error
        processedContentRef.current.add(messageKey);
        currentlyProcessingRef.current = null;
        setIsPreparingAudio(false);
        setReadyMessages(prev => [...prev, messageToAdd]);
      });
      
  }, [messages, isStreaming, stripMetadata, getMessageKey, cleanupAudio]);

  // Scroll to bottom when new ready messages appear
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [readyMessages]);

  const handleChoiceClick = (choice: string) => {
    sendMessage(choice);
  };

  // Get the last ready assistant message with choices and time
  const lastAssistantMessage = readyMessages.filter(m => m.role === "assistant").pop();
  const currentChoices = lastAssistantMessage?.choices || [];
  const currentGameTime = lastAssistantMessage?.gameTime || state?.gameTime || "Unknown";

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
          </div>
        </div>

        {/* Story Content - Scrollable area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6"
        >
          {readyMessages.map((message, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {message.role === "assistant" ? (
                <div className="space-y-3 sm:space-y-4">
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
                  <ParchmentCard className="relative">
                    <div className="font-serif space-y-3">
                      {stripMetadata(message.content).split('\n\n').map((para, j) => (
                        <p key={j} className="text-[#3d2914] text-sm sm:text-base leading-relaxed">
                          {para}
                        </p>
                      ))}
                    </div>
                  </ParchmentCard>
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
          {(isStreaming || isGeneratingImage || isPreparingAudio) && (
            <div className="flex items-center gap-2 text-purple-300">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span className="font-serif text-sm animate-pulse">
                {isGeneratingImage ? "Painting the scene..." : 
                 isPreparingAudio ? "Preparing narration..." :
                 "The story unfolds..."}
              </span>
            </div>
          )}
        </div>

        {/* Choice Buttons - Fixed at bottom */}
        {currentChoices.length > 0 && !isStreaming && !isPreparingAudio && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-t border-white/10 bg-[#1a0b2e]/95 backdrop-blur p-2 sm:p-4 flex-shrink-0"
          >
            <div className="flex flex-col gap-2 max-w-2xl mx-auto">
              {currentChoices.map((choice, i) => (
                <Button
                  key={i}
                  variant="outline"
                  onClick={() => handleChoiceClick(choice)}
                  className="w-full text-left justify-start h-auto min-h-[44px] py-2 px-3 border-purple-500/30 bg-purple-900/20 text-purple-100 font-serif text-sm leading-normal whitespace-normal"
                  data-testid={`button-choice-${i}`}
                >
                  <span className="text-yellow-500 mr-2 flex-shrink-0">{i + 1}.</span>
                  <span className="flex-1">{choice}</span>
                </Button>
              ))}
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
