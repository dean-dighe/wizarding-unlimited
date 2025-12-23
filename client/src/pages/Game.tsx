import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ScrollText, 
  Heart, 
  MapPin, 
  Backpack, 
  Send, 
  Sparkles,
  ChevronRight 
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
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput("");
  };

  if (stateLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#fdfbf7] text-primary">
        <Sparkles className="w-12 h-12 animate-spin mb-4 text-yellow-500" />
        <p className="font-serif text-xl animate-pulse">Consulting the oracles...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col md:flex-row bg-[#1a0b2e] text-[#fdfbf7] overflow-hidden">
      
      {/* Sidebar - Stats */}
      <motion.div 
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-full md:w-80 bg-[#120521] border-r border-white/5 flex flex-col p-6 z-20 shadow-2xl"
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

      {/* Main Area - Chat */}
      <div className="flex-1 flex flex-col relative h-full">
        {/* Header */}
        <div className="h-16 border-b border-white/5 bg-[#1a0b2e]/95 backdrop-blur flex items-center px-6 justify-between z-10">
          <h1 className="font-serif text-lg text-yellow-100/80 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-yellow-500" />
            Your Adventure
          </h1>
        </div>

        {/* Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth"
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

        {/* Input Area */}
        <div className="flex-shrink-0 p-4 md:p-6 bg-gradient-to-t from-[#0d0415] to-[#1a0b2e] border-t border-white/5">
          <form 
            onSubmit={handleSubmit}
            className="max-w-4xl mx-auto relative flex items-end gap-2 bg-[#25123d] border border-purple-500/20 rounded-xl p-2 shadow-2xl shadow-purple-950/50 focus-within:ring-2 focus-within:ring-yellow-500/30 transition-all"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="What do you do?"
              className="flex-1 bg-transparent border-none text-purple-100 placeholder-purple-400/30 focus:ring-0 resize-none max-h-32 min-h-[50px] p-3 font-serif"
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="p-3 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-yellow-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-center text-xs text-white/20 mt-3 font-serif italic">
            Magic awaits your command...
          </p>
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
