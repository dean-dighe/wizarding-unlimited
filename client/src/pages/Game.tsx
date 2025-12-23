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
} from "lucide-react";
import { useGameState } from "@/hooks/use-game";
import { useChatStream } from "@/hooks/use-chat-stream";
import { ParchmentCard } from "@/components/ui/parchment-card";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function Game() {
  const [, params] = useRoute("/game/:id");
  const conversationId = params?.id ? parseInt(params.id) : null;
  
  const { data: state, isLoading: stateLoading } = useGameState(conversationId);
  const { messages, sendMessage, isStreaming, isGeneratingImage, storyProgress, chapterAdvance } = useChatStream(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastReadMessageRef = useRef<number>(0);
  const [isNarrating, setIsNarrating] = useState(false);
  
  // Mute state with localStorage persistence - use ref to track current value across async calls
  const [isMuted, setIsMuted] = useState(() => {
    const stored = localStorage.getItem("hogwarts-muted");
    return stored === "true";
  });
  const isMutedRef = useRef(isMuted);
  
  // Keep ref in sync with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const cleanupAudio = useCallback(() => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Stop and cleanup audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // Revoke object URL to prevent memory leaks
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsNarrating(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newValue = !prev;
      localStorage.setItem("hogwarts-muted", String(newValue));
      isMutedRef.current = newValue;
      // Stop current audio and abort pending requests if muting
      if (newValue) {
        cleanupAudio();
      }
      return newValue;
    });
  }, [cleanupAudio]);

  // Extract final paragraph for narration (last paragraph before choices)
  const extractFinalParagraph = useCallback((content: string): string => {
    const stripped = content
      .replace(/\[IMAGE: [^\]]+\]\n?/g, '')
      .replace(/\[TIME: [^\]]+\]\n?/g, '')
      .replace(/\[SCENE: [^\]]+\]\n?/g, '')
      .replace(/\[Choice \d+: [^\]]+\]\n?/g, '')
      .trim();
    
    const paragraphs = stripped.split(/\n\n+/).filter(p => p.trim());
    return paragraphs[paragraphs.length - 1] || stripped.slice(-500);
  }, []);

  // Narrate new assistant messages
  useEffect(() => {
    if (isMuted || isStreaming || messages.length === 0) return;
    
    const assistantMessages = messages.filter(m => m.role === "assistant");
    if (assistantMessages.length === 0) return;
    
    const currentCount = assistantMessages.length;
    
    // Only narrate if we have a new message
    if (currentCount > lastReadMessageRef.current) {
      const latestMessage = assistantMessages[assistantMessages.length - 1];
      const textToRead = extractFinalParagraph(latestMessage.content);
      
      if (textToRead && textToRead.length > 20) {
        // Create abort controller for this request
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        
        setIsNarrating(true);
        
        fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToRead }),
          signal: abortController.signal,
        })
          .then(res => {
            // Check if muted during request
            if (isMutedRef.current) {
              cleanupAudio();
              return null;
            }
            if (res.ok) return res.blob();
            throw new Error("TTS failed");
          })
          .then(blob => {
            // Check if muted or aborted before playing
            if (!blob || isMutedRef.current) {
              setIsNarrating(false);
              return;
            }
            
            const url = URL.createObjectURL(blob);
            audioUrlRef.current = url;
            
            // Final mute check before creating audio
            if (isMutedRef.current) {
              URL.revokeObjectURL(url);
              audioUrlRef.current = null;
              setIsNarrating(false);
              return;
            }
            
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => {
              if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
              }
              setIsNarrating(false);
              audioRef.current = null;
            };
            audio.onerror = () => {
              if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
              }
              setIsNarrating(false);
              audioRef.current = null;
            };
            audio.play().catch(() => {
              cleanupAudio();
            });
          })
          .catch((err) => {
            if (err.name !== 'AbortError') {
              console.error('TTS error:', err);
            }
            setIsNarrating(false);
          });
      }
      
      lastReadMessageRef.current = currentCount;
    }
  }, [messages, isMuted, isStreaming, extractFinalParagraph, cleanupAudio]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleChoiceClick = (choice: string) => {
    sendMessage(choice);
  };

  // Get the last assistant message with choices and time
  const lastAssistantMessage = messages.filter(m => m.role === "assistant").pop();
  const currentChoices = lastAssistantMessage?.choices || [];
  const currentGameTime = lastAssistantMessage?.gameTime || state?.gameTime || "Unknown";

  // Helper to strip metadata from content for display
  const stripMetadata = (content: string) => {
    return content
      .replace(/\[IMAGE: [^\]]+\]\n?/g, '')
      .replace(/\[TIME: [^\]]+\]\n?/g, '')
      .replace(/\[SCENE: [^\]]+\]\n?/g, '')
      .replace(/\[Choice \d+: [^\]]+\]\n?/g, '')
      .trim();
  };

  if (stateLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#1a0b2e]">
        <Sparkles className="w-12 h-12 animate-spin mb-4 text-yellow-500" />
        <p className="font-serif text-xl animate-pulse text-purple-200">Consulting the oracles...</p>
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
        <div className="mb-4 text-center">
          {state?.playerName && (
            <p className="text-sm text-purple-200/80 font-serif mb-1">{state.playerName}</p>
          )}
          <h2 className="text-xl font-serif font-bold text-yellow-500 tracking-widest uppercase mb-1">
            {state?.house || "Unsorted"}
          </h2>
          <div className="h-0.5 w-12 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mx-auto mb-3" />
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
              {state?.inventory?.map((item, i) => (
                <div 
                  key={i}
                  className="bg-white/5 border border-white/5 rounded px-2 py-1.5 text-xs text-purple-100/80 truncate"
                  title={item}
                >
                  {item}
                </div>
              )) || <span className="text-xs text-white/30 italic">Empty...</span>}
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
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Unified Header Bar - Sticky at top */}
        <div className="sticky top-0 bg-[#120521] border-b border-white/5 px-3 py-2 flex items-center justify-between flex-shrink-0 z-50">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-yellow-500" />
            <span className="font-serif text-sm text-yellow-100/80 hidden sm:inline">Wizarding Sagas</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 text-xs">
            <div className="flex items-center gap-1 text-yellow-400">
              <Clock className="w-3 h-3" />
              <span className="font-serif">{currentGameTime.split(' - ')[1] || currentGameTime}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-red-400">
              <Heart className="w-3 h-3" />
              <span>{state?.health ?? 100}%</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-400">
              <MapPin className="w-3 h-3" />
              <span className="truncate max-w-[100px]">{state?.location || "Unknown"}</span>
            </div>
            <div className="sm:hidden flex items-center gap-1 text-red-400">
              <Heart className="w-3 h-3 fill-current" />
              <span>{state?.health ?? 100}</span>
            </div>
            {/* Mute Toggle */}
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleMute}
              className={cn(
                "h-7 w-7 transition-colors",
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

        {/* Chapter Advancement Toast */}
        <AnimatePresence>
          {chapterAdvance && (
            <motion.div
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className="absolute top-16 left-1/2 transform -translate-x-1/2 z-40"
            >
              <div className="bg-gradient-to-r from-yellow-600/90 to-yellow-500/90 backdrop-blur-sm text-yellow-950 px-6 py-3 rounded-lg shadow-xl border border-yellow-400/50">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5" />
                  <div>
                    <p className="font-serif font-bold text-sm">Chapter Complete!</p>
                    <p className="font-serif text-xs opacity-80">Now entering: {chapterAdvance}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Story Area - Scrollable container below sticky header */}
        <div 
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto scroll-smooth"
        >
          <div className="max-w-5xl mx-auto p-2 sm:p-4 lg:p-6 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    "flex w-full",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="w-full space-y-3">
                      {/* Story Text First */}
                      <ParchmentCard className="shadow-lg">
                        <div 
                          className="whitespace-pre-wrap text-amber-950 leading-relaxed text-sm sm:text-base lg:text-lg"
                          style={{ fontFamily: "var(--font-book)" }}
                        >
                          {stripMetadata(msg.content)}
                        </div>
                      </ParchmentCard>
                      {/* Scene Image Below Text */}
                      {msg.imageUrl && (
                        <div className="relative rounded-lg overflow-hidden border border-yellow-600/20 shadow-lg">
                          <img 
                            src={msg.imageUrl} 
                            alt="Scene illustration" 
                            className="w-full max-h-[50vh] object-contain bg-black/20"
                            data-testid={`img-scene-${idx}`}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-purple-900/50 backdrop-blur-sm border border-purple-700/50 text-purple-100 rounded-xl rounded-tr-sm px-3 py-2 sm:px-4 sm:py-3 max-w-md shadow-lg">
                      <p className="font-sans leading-relaxed text-sm">{msg.content}</p>
                    </div>
                  )}
                </motion.div>
              ))}
              {isStreaming && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  className="flex justify-start w-full"
                >
                  <div className="text-yellow-500/50 flex gap-1 items-center p-3">
                    <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </motion.div>
              )}
              {isGeneratingImage && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  className="flex justify-start w-full"
                >
                  <div className="text-purple-400/70 flex gap-2 items-center p-3 font-serif text-sm italic">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    <span>Conjuring scene illustration...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Choices Area - Sticky Footer */}
        <div className="flex-shrink-0 p-2 sm:p-3 bg-gradient-to-t from-[#0d0415] via-[#120521] to-transparent border-t border-white/5">
          {currentChoices.length > 0 ? (
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
                {currentChoices.map((choice, idx) => (
                  <motion.button
                    key={idx}
                    onClick={() => handleChoiceClick(choice)}
                    disabled={isStreaming || isGeneratingImage}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "p-2 sm:p-3 rounded-md border border-yellow-600/40 bg-[#25123d]/80 active:bg-[#2d1847] text-purple-100 font-serif text-xs sm:text-sm transition-all",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "hover:bg-[#2d1847] hover:border-yellow-500/60"
                    )}
                  >
                    <div className="flex items-start gap-1.5">
                      <div className="text-yellow-500 font-bold text-xs sm:text-sm shrink-0">
                        {idx + 1}.
                      </div>
                      <div className="text-left leading-snug">{choice}</div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-white/30 font-serif italic text-xs py-1">
              Awaiting the next turn...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatItem({ icon: Icon, label, value, color }: { icon: any, label: string, value: string | number, color: string }) {
  return (
    <div className="flex items-center gap-3 group">
      <div className={cn("p-1.5 rounded-md bg-white/5 border border-white/5", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[10px] text-white/40 uppercase tracking-wider font-serif">{label}</p>
        <p className="text-sm font-serif text-white/90">{value}</p>
      </div>
    </div>
  );
}
