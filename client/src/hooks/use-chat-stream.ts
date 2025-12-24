import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "./use-game";
import { api } from "@shared/routes";

interface Message {
  role: "user" | "assistant";
  content: string;
  choices?: string[];
  gameTime?: string;
}

interface StoryProgress {
  chapter: string;
  chapterIndex: number;
  totalChapters: number;
  decisionCount: number;
}

interface StreamError {
  message: string;
  canRetry: boolean;
  lastUserMessage?: string;
}

export function useChatStream(conversationId: number | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [storyProgress, setStoryProgress] = useState<StoryProgress | null>(null);
  const [chapterAdvance, setChapterAdvance] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<StreamError | null>(null);
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSentMessageRef = useRef<string>("");

  // Use ref to accumulate streaming message, only commit to state when content stabilizes
  // This prevents excessive re-renders during streaming
  const streamingMessageRef = useRef<Message | null>(null);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial history
  useEffect(() => {
    if (!conversationId) return;

    const controller = new AbortController();

    fetch(`/api/conversations/${conversationId}`, {
      credentials: "include",
      headers: getAuthHeaders(conversationId),
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch conversation");
        return res.json();
      })
      .then(data => {
        if (data.messages) {
          const formatted = data.messages
            .filter((m: any) => m.role !== 'system')
            .map((m: any) => {
              const choiceMatch = m.content.match(/\[Choice \d+: [^\]]+\]/g);
              const choices = choiceMatch ? choiceMatch.map((c: string) => c.replace(/^\[Choice \d+: /, '').replace(/\]$/, '')) : [];
              const timeMatch = m.content.match(/\[TIME: ([^\]]+)\]/);
              const gameTime = timeMatch ? timeMatch[1] : undefined;
              return {
                role: m.role,
                content: m.content,
                choices: choices.length > 0 ? choices : undefined,
                gameTime
              };
            });
          setMessages(formatted);
        }
      })
      .catch(err => {
        // Don't log abort errors - they're expected during cleanup
        if (err.name !== 'AbortError') {
          console.error("Failed to load conversation history:", err);
        }
      });

    // Cleanup: abort fetch if component unmounts or conversationId changes
    return () => controller.abort();
  }, [conversationId]);

  const sendMessage = async (content: string) => {
    if (!conversationId || !content.trim()) return;
    
    // Prevent duplicate requests while streaming
    if (isStreaming) {
      console.log("[Chat] Ignoring message - already streaming");
      return;
    }

    // Clear any previous error
    setStreamError(null);
    lastSentMessageRef.current = content;

    // Add user message immediately
    const newMessages = [...messages, { role: "user" as const, content }];
    setMessages(newMessages);
    setIsStreaming(true);
    console.log(`[Chat] Sending message: "${content.slice(0, 50)}..."`);

    try {
      abortControllerRef.current = new AbortController();
      
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...getAuthHeaders(conversationId)
        },
        body: JSON.stringify({ content }),
        signal: abortControllerRef.current.signal,
        credentials: "include",
      });

      if (!res.ok) {
        console.error(`[Chat] Request failed with status ${res.status}`);
        // Remove the optimistically added user message
        setMessages(messages);
        throw new Error("Failed to send message");
      }
      if (!res.body) throw new Error("No response body");
      console.log("[Chat] Got response, reading stream...");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let assistantMessageAdded = false; // Track if we've added the assistant message

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Handle full content (text complete)
              if (data.fullContent) {
                assistantMessage = data.fullContent;
                const choiceMatch = assistantMessage.match(/\[Choice \d+: [^\]]+\]/g);
                const choices = choiceMatch ? choiceMatch.map(c => c.replace(/^\[Choice \d+: /, '').replace(/\]$/, '')) : [];
                const timeMatch = assistantMessage.match(/\[TIME: ([^\]]+)\]/);
                const gameTime = timeMatch ? timeMatch[1] : undefined;

                // Update the ref with latest content
                streamingMessageRef.current = {
                  role: "assistant",
                  content: assistantMessage,
                  choices: choices.length > 0 ? choices : undefined,
                  gameTime
                };

                // Debounce state updates to reduce re-renders during streaming
                // Only update state every 100ms instead of on every chunk
                if (pendingUpdateRef.current) {
                  clearTimeout(pendingUpdateRef.current);
                }
                pendingUpdateRef.current = setTimeout(() => {
                  const msg = streamingMessageRef.current;
                  if (!msg) return;

                  if (!assistantMessageAdded) {
                    assistantMessageAdded = true;
                    setMessages(prev => [...prev, msg]);
                  } else {
                    setMessages(prev => {
                      const updated = [...prev];
                      updated[updated.length - 1] = msg;
                      return updated;
                    });
                  }
                }, 100);
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

              // Handle error from server (AI generation failed)
              if (data.error) {
                // Remove the optimistically added user message since it was rolled back on server
                setMessages(prev => prev.slice(0, -1));
                setStreamError({
                  message: data.errorMessage || "Something went wrong with the magical narrator.",
                  canRetry: data.canRetry ?? true,
                  lastUserMessage: lastSentMessageRef.current
                });
                return;
              }

              // When completely done
              if (data.done) {
                console.log("[Chat] Stream complete");
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
        // Remove the optimistically added user message on network errors
        setMessages(prev => prev.slice(0, -1));
        setStreamError({
          message: "Connection to the magical realm was lost. Please try again.",
          canRetry: true,
          lastUserMessage: lastSentMessageRef.current
        });
      }
    } finally {
      // Clear any pending debounced update
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }

      // Commit final message state if there's pending content
      if (streamingMessageRef.current) {
        const finalMsg = streamingMessageRef.current;
        setMessages(prev => {
          // Check if we already have this message
          if (prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
            const updated = [...prev];
            updated[updated.length - 1] = finalMsg;
            return updated;
          }
          return [...prev, finalMsg];
        });
        streamingMessageRef.current = null;
      }

      setIsStreaming(false);
      abortControllerRef.current = null;
      // Invalidate game state to pick up any state changes from the backend action
      // Use the same query key pattern as useGameState
      queryClient.invalidateQueries({ queryKey: [api.game.getState.path, conversationId] });
    }
  };

  const clearChapterAdvance = () => setChapterAdvance(null);
  const clearError = () => setStreamError(null);
  
  const retryLastMessage = () => {
    if (streamError?.lastUserMessage) {
      sendMessage(streamError.lastUserMessage);
    }
  };

  return { 
    messages, 
    sendMessage, 
    isStreaming, 
    storyProgress, 
    chapterAdvance,
    clearChapterAdvance,
    streamError,
    clearError,
    retryLastMessage
  };
}
