import { useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ScrollText, 
  Heart, 
  MapPin, 
  Backpack, 
  Sparkles,
  Clock,
} from "lucide-react";
import { useGameState } from "@/hooks/use-game";
import { useChatStream } from "@/hooks/use-chat-stream";
import { ParchmentCard } from "@/components/ui/parchment-card";
import { cn } from "@/lib/utils";

export default function Game() {
  const [, params] = useRoute("/game/:id");
  const conversationId = params?.id ? parseInt(params.id) : null;
  
  const { data: state, isLoading: stateLoading } = useGameState(conversationId);
  const { messages, sendMessage, isStreaming, isGeneratingImage } = useChatStream(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      <div className="h-screen flex flex-col items-center justify-center bg-[#fdfbf7]">
        <Sparkles className="w-12 h-12 animate-spin mb-4 text-yellow-500" />
        <p className="font-serif text-xl animate-pulse text-purple-900">Consulting the oracles...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col md:flex-row bg-[#1a0b2e] text-[#fdfbf7] overflow-hidden">
      
      {/* Mobile Header - Compact */}
      <div className="md:hidden bg-[#120521] border-b border-white/5 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-yellow-500" />
          <span className="font-serif text-sm text-yellow-100/80">Wizarding Sagas</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1 text-yellow-400">
            <Clock className="w-3 h-3" />
            <span className="font-serif hidden xs:inline">{currentGameTime.split(' - ')[1] || currentGameTime}</span>
          </div>
          <div className="flex items-center gap-1 text-red-400">
            <Heart className="w-3 h-3" />
            <span>{state?.health ?? 100}%</span>
          </div>
          <div className="flex items-center gap-1 text-emerald-400">
            <MapPin className="w-3 h-3" />
            <span className="truncate max-w-[80px]">{state?.location || "Unknown"}</span>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <motion.div 
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="hidden md:flex w-80 h-full bg-[#120521] border-r border-white/5 flex-col p-6 z-20 shadow-2xl overflow-y-auto flex-shrink-0"
      >
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-serif font-bold text-yellow-500 tracking-widest uppercase mb-1">
            {state?.house || "Unsorted"}
          </h2>
          <div className="h-0.5 w-16 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mx-auto mb-4" />
          <div className="flex items-center justify-center gap-2 text-yellow-300/80">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-serif">{currentGameTime}</span>
          </div>
        </div>

        <div className="space-y-6 flex-1">
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
          
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-purple-300">
              <Backpack className="w-5 h-5" />
              <span className="font-serif uppercase tracking-wider text-sm">Inventory</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {state?.inventory?.map((item, i) => (
                <div 
                  key={i}
                  className="bg-white/5 border border-white/5 rounded px-3 py-2 text-sm text-purple-100/80 truncate"
                  title={item}
                >
                  {item}
                </div>
              )) || <span className="text-xs text-white/30 italic col-span-2">Empty...</span>}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Desktop Header */}
        <div className="hidden md:flex h-16 border-b border-white/5 bg-[#1a0b2e]/95 backdrop-blur items-center px-6 justify-between z-10 flex-shrink-0">
          <h1 className="font-serif text-lg text-yellow-100/80 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-yellow-500" />
            Wizarding Sagas
          </h1>
        </div>

        {/* Messages Area - Priority for mobile */}
        <div 
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-3 md:p-8 space-y-4 md:space-y-6 scroll-smooth"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className={cn(
                  "flex w-full",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="max-w-3xl w-full space-y-3">
                    {msg.imageUrl && (
                      <div className="rounded-lg overflow-hidden shadow-xl border border-yellow-600/30">
                        <img 
                          src={msg.imageUrl} 
                          alt="Scene illustration" 
                          className="w-full h-auto object-cover"
                          data-testid={`img-scene-${idx}`}
                        />
                      </div>
                    )}
                    <ParchmentCard className="shadow-xl p-4 md:p-6">
                      <div 
                        className="whitespace-pre-wrap text-amber-950 leading-relaxed text-base md:text-lg"
                        style={{ fontFamily: "var(--font-book)" }}
                      >
                        {stripMetadata(msg.content)}
                      </div>
                    </ParchmentCard>
                  </div>
                ) : (
                  <div className="bg-purple-900/50 backdrop-blur-sm border border-purple-700/50 text-purple-100 rounded-2xl rounded-tr-sm px-4 py-3 md:px-6 md:py-4 max-w-xl shadow-lg">
                    <p className="font-sans leading-relaxed text-sm md:text-base">{msg.content}</p>
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
                <div className="text-yellow-500/50 flex gap-1 items-center p-4">
                  <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </motion.div>
            )}
            {isGeneratingImage && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="flex justify-start w-full"
              >
                <div className="text-purple-400/70 flex gap-2 items-center p-4 font-serif text-sm italic">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  <span>Conjuring scene illustration...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Choices Area - Compact on mobile */}
        <div className="flex-shrink-0 p-2 md:p-6 bg-gradient-to-t from-[#0d0415] to-[#1a0b2e] border-t border-white/5">
          {currentChoices.length > 0 ? (
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-2 gap-2 md:gap-3">
                {currentChoices.map((choice, idx) => (
                  <motion.button
                    key={idx}
                    onClick={() => handleChoiceClick(choice)}
                    disabled={isStreaming}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "p-2 md:p-4 rounded-lg border border-yellow-600/50 bg-[#25123d] active:bg-[#2d1847] text-purple-100 font-serif text-xs md:text-sm transition-all",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "md:hover:bg-[#2d1847] md:hover:border-yellow-500 md:hover:shadow-lg md:hover:shadow-yellow-500/20"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="text-yellow-500 font-bold text-sm md:text-lg shrink-0">
                        {idx + 1}
                      </div>
                      <div className="text-left">{choice}</div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-white/30 font-serif italic text-sm py-2">
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
    <div className="flex items-center gap-4 group">
      <div className={cn("p-2 rounded-lg bg-white/5 border border-white/5 group-hover:border-white/10 transition-colors", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-white/40 uppercase tracking-wider font-serif">{label}</p>
        <p className="text-lg font-serif text-white/90">{value}</p>
      </div>
    </div>
  );
}
