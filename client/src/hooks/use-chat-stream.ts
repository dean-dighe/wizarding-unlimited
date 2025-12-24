import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "./use-game";
import { api } from "@shared/routes";

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

interface StreamError {
  message: string;
  canRetry: boolean;
  lastUserMessage?: string;
}

export function useChatStream(conversationId: number | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [storyProgress, setStoryProgress] = useState<StoryProgress | null>(null);
  const [chapterAdvance, setChapterAdvance] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<StreamError | null>(null);
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSentMessageRef = useRef<string>("");

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
      let currentImageUrl: string | undefined;
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
                
                if (!assistantMessageAdded) {
                  // First fullContent - add new message
                  assistantMessageAdded = true;
                  setMessages(prev => [...prev, { 
                    role: "assistant", 
                    content: assistantMessage,
                    choices: choices.length > 0 ? choices : undefined,
                    gameTime,
                    imageUrl: currentImageUrl
                  }]);
                } else {
                  // Subsequent fullContent - update existing message
                  setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { 
                      ...updated[updated.length - 1],
                      content: assistantMessage,
                      choices: choices.length > 0 ? choices : undefined,
                      gameTime,
                    };
                    return updated;
                  });
                }
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
                  if (updated.length > 0) {
                    updated[updated.length - 1] = { 
                      ...updated[updated.length - 1],
                      imageUrl: data.imageUrl
                    };
                  }
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
        // Remove the optimistically added user message on network errors
        setMessages(prev => prev.slice(0, -1));
        setStreamError({
          message: "Connection to the magical realm was lost. Please try again.",
          canRetry: true,
          lastUserMessage: lastSentMessageRef.current
        });
      }
    } finally {
      setIsStreaming(false);
      setIsGeneratingImage(false);
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
    isGeneratingImage, 
    storyProgress, 
    chapterAdvance,
    clearChapterAdvance,
    streamError,
    clearError,
    retryLastMessage
  };
}
