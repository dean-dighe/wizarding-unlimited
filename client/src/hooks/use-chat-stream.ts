import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function useChatStream(conversationId: number | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
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
            .map((m: any) => ({ role: m.role, content: m.content }));
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

      // Add placeholder for assistant
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            
            if (data.content) {
              assistantMessage += data.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantMessage };
                return updated;
              });
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Stream error:", error);
        // Optionally add error feedback to UI
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      // Invalidate game state to pick up any state changes from the backend action
      queryClient.invalidateQueries({ queryKey: [`/api/game/${conversationId}/state`] });
    }
  };

  return { messages, sendMessage, isStreaming };
}
