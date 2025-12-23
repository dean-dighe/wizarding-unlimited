import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface Message {
  role: "user" | "assistant";
  content: string;
  choices?: string[];
  gameTime?: string;
  imageUrl?: string;
}

interface StoryProgress {
  chapter: string;
  chapterIndex: number;
  totalChapters: number;
  decisionCount: number;
}

export function useChatStream(conversationId: number | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [storyProgress, setStoryProgress] = useState<StoryProgress | null>(null);
  const [chapterAdvance, setChapterAdvance] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load initial history
  useEffect(() => {
    if (!conversationId) return;
    
    fetch(`/api/conversations/${conversationId}`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.messages) {
          const formatted = data.messages
            .filter((m: any) => m.role !== 'system')
            .map((m: any) => {
              const choiceMatch = m.content.match(/\[Choice \d+: [^\]]+\]/g);
              const choices = choiceMatch ? choiceMatch.map((c: string) => c.replace(/^\[Choice \d+: /, '').replace(/\]$/, '')) : [];
              const timeMatch = m.content.match(/\[TIME: ([^\]]+)\]/);
              const gameTime = timeMatch ? timeMatch[1] : undefined;
              // Extract image URL from persisted content
              const imageMatch = m.content.match(/\[IMAGE: ([^\]]+)\]/);
              const imageUrl = imageMatch ? imageMatch[1] : undefined;
              return { 
                role: m.role, 
                content: m.content,
                choices: choices.length > 0 ? choices : undefined,
                gameTime,
                imageUrl
              };
            });
          setMessages(formatted);
        }
      })
      .catch(console.error);
  }, [conversationId]);

  const sendMessage = async (content: string) => {
    if (!conversationId || !content.trim()) return;

    // Add user message immediately
    const newMessages = [...messages, { role: "user" as const, content }];
    setMessages(newMessages);
    setIsStreaming(true);

    try {
      abortControllerRef.current = new AbortController();
      
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: abortControllerRef.current.signal,
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to send message");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let currentImageUrl: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Handle full content (text complete - render once)
              if (data.fullContent) {
                assistantMessage = data.fullContent;
                const choiceMatch = assistantMessage.match(/\[Choice \d+: [^\]]+\]/g);
                const choices = choiceMatch ? choiceMatch.map(c => c.replace(/^\[Choice \d+: /, '').replace(/\]$/, '')) : [];
                const timeMatch = assistantMessage.match(/\[TIME: ([^\]]+)\]/);
                const gameTime = timeMatch ? timeMatch[1] : undefined;
                
                setMessages(prev => [...prev, { 
                  role: "assistant", 
                  content: assistantMessage,
                  choices: choices.length > 0 ? choices : undefined,
                  gameTime,
                  imageUrl: currentImageUrl
                }]);
              }

              // Handle imagePending event - text is done, image generation starting
              if (data.imagePending) {
                setIsGeneratingImage(true);
              }

              // Handle image URL from the stream
              if (data.imageUrl) {
                currentImageUrl = data.imageUrl;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { 
                    ...updated[updated.length - 1],
                    imageUrl: data.imageUrl
                  };
                  return updated;
                });
                setIsGeneratingImage(false);
              }

              // Handle story progress updates
              if (data.storyProgress) {
                setStoryProgress(data.storyProgress);
              }

              // Handle chapter advancement notification
              if (data.chapterAdvance) {
                setChapterAdvance(data.chapter);
                // Clear after 5 seconds
                setTimeout(() => setChapterAdvance(null), 5000);
              }

              // When completely done
              if (data.done) {
                setIsGeneratingImage(false);
              }
            } catch (e) {
              // Skip malformed JSON lines
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Stream error:", error);
      }
    } finally {
      setIsStreaming(false);
      setIsGeneratingImage(false);
      abortControllerRef.current = null;
      // Invalidate game state to pick up any state changes from the backend action
      queryClient.invalidateQueries({ queryKey: [`/api/game/${conversationId}/state`] });
    }
  };

  const clearChapterAdvance = () => setChapterAdvance(null);

  return { 
    messages, 
    sendMessage, 
    isStreaming, 
    isGeneratingImage, 
    storyProgress, 
    chapterAdvance,
    clearChapterAdvance 
  };
}
