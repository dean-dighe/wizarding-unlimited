import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ScrollText, 
  Heart, 
  MapPin, 
  Backpack, 
  Sparkles,
} from "lucide-react";
import { useGameState } from "@/hooks/use-game";
import { useChatStream } from "@/hooks/use-chat-stream";
import { ParchmentCard } from "@/components/ui/parchment-card";
import { cn } from "@/lib/utils";

export default function Game() {
  const [, params] = useRoute("/game/:id");
  const conversationId = params?.id ? parseInt(params.id) : null;
  
  const { data: state, isLoading: stateLoading } = useGameState(conversationId);
  const { messages, sendMessage, isStreaming } = useChatStream(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleChoiceClick = (choice: string) => {
    sendMessage(choice);
  };

  // Get the last assistant message with choices
  const lastAssistantMessage = messages.filter(m => m.role === "assistant").pop();
  const currentChoices = lastAssistantMessage?.choices || [];

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
      
      {/* Mobile Stats Bar */}
      <div className="md:hidden h-20 bg-[#120521] border-b border-white/5 p-4 flex items-center gap-4 overflow-x-auto flex-shrink-0">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Heart className="w-4 h-4 text-red-400" />
          <span className="text-xs font-serif uppercase">HP: {state?.health ?? 100}%</span>
        </div>
        <div className="w-px h-4 bg-white/10" />
        <div className="flex items-center gap-2 whitespace-nowrap">
          <MapPin className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-serif uppercase truncate">{state?.location || "Unknown"}</span>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <motion.div 
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="hidden md:flex w-80 h-full bg-[#120521] border-r border-white/5 flex-col p-6 z-20 shadow-2xl overflow-y-auto flex-shrink-0"
      >
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-serif font-bold text-yellow-500 tracking-widest uppercase mb-1">
            {state?.house || "Unsorted"}
          </h2>
          <div className="h-0.5 w-16 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mx-auto" />
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

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <div className="h-16 border-b border-white/5 bg-[#1a0b2e]/95 backdrop-blur flex items-center px-6 justify-between z-10 flex-shrink-0">
          <h1 className="font-serif text-lg text-yellow-100/80 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-yellow-500" />
            Wizarding Sagas
          </h1>
        </div>

        <div 
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth"
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
                  <div className="max-w-3xl w-full">
                    <ParchmentCard className="prose prose-p:font-serif prose-p:leading-relaxed prose-headings:font-serif prose-strong:text-amber-900 text-amber-950 shadow-xl">
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </ParchmentCard>
                  </div>
                ) : (
                  <div className="bg-purple-900/50 backdrop-blur-sm border border-purple-700/50 text-purple-100 rounded-2xl rounded-tr-sm px-6 py-4 max-w-xl shadow-lg">
                    <p className="font-sans leading-relaxed">{msg.content}</p>
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
          </AnimatePresence>
        </div>

        {/* Choices Area */}
        <div className="flex-shrink-0 p-4 md:p-6 bg-gradient-to-t from-[#0d0415] to-[#1a0b2e] border-t border-white/5">
          {currentChoices.length > 0 ? (
            <div className="max-w-4xl mx-auto space-y-3">
              <p className="text-xs text-white/40 uppercase tracking-widest font-serif text-center mb-4">
                What is your next move?
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentChoices.map((choice, idx) => (
                  <motion.button
                    key={idx}
                    onClick={() => handleChoiceClick(choice)}
                    disabled={isStreaming}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "p-4 rounded-lg border-2 border-yellow-600/50 bg-[#25123d] hover:bg-[#2d1847] text-purple-100 font-serif text-sm transition-all",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "hover:border-yellow-500 hover:shadow-lg hover:shadow-yellow-500/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-yellow-500 font-bold text-lg mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="text-left">{choice}</div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-white/30 font-serif italic text-sm">
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
