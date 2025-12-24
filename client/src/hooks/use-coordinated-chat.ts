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

interface SceneData {
  location: string;
  time?: string;
  ambiance: {
    lighting: string;
    weather: string;
    mood: string;
    sounds: string[];
  };
  characters: Array<{
    name: string;
    position: string;
    expression: string;
    speaking: boolean;
  }>;
  background: {
    action: "use" | "generate" | "pending";
    assetId?: number;
    locationName?: string;
  };
  assetsReady: boolean;
}

interface CoordinatedError {
  message: string;
  canRetry: boolean;
  lastUserMessage?: string;
}

export function useCoordinatedChat(conversationId: number | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [storyProgress, setStoryProgress] = useState<StoryProgress | null>(null);
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [chatError, setChatError] = useState<CoordinatedError | null>(null);
  const [chapterAdvance, setChapterAdvance] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const lastSentMessageRef = useRef<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
        if (err.name !== 'AbortError') {
          console.error("Failed to load conversation history:", err);
        }
      });

    return () => controller.abort();
  }, [conversationId]);

  const sendMessage = async (content: string) => {
    if (!conversationId || !content.trim()) return;
    
    if (isLoading) {
      console.log("[Coordinated] Ignoring message - already loading");
      return;
    }

    setChatError(null);
    lastSentMessageRef.current = content;

    const newMessages = [...messages, { role: "user" as const, content }];
    setMessages(newMessages);
    setIsLoading(true);
    setTtsAudioUrl(null);
    console.log(`[Coordinated] Sending message: "${content.slice(0, 50)}..."`);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/coordinated`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...getAuthHeaders(conversationId)
        },
        body: JSON.stringify({ content }),
        credentials: "include",
      });

      if (!res.ok) {
        console.error(`[Coordinated] Request failed with status ${res.status}`);
        setMessages(messages);
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send message");
      }

      const data = await res.json();
      console.log(`[Coordinated] Response received in ${data.generationTimeMs}ms`);

      if (!data.success) {
        throw new Error(data.error || "Request failed");
      }

      const scene = data.scene;
      
      const choiceMatch = scene.cleanedText.match(/\[Choice \d+: [^\]]+\]/g);
      const choices = choiceMatch 
        ? choiceMatch.map((c: string) => c.replace(/^\[Choice \d+: /, '').replace(/\]$/, '')) 
        : scene.choices?.map((c: any) => c.text) || [];

      const assistantMessage: Message = {
        role: "assistant",
        content: scene.cleanedText,
        choices: choices.length > 0 ? choices : undefined,
        gameTime: scene.time,
      };

      setMessages([...newMessages, assistantMessage]);

      setSceneData({
        location: scene.location,
        time: scene.time,
        ambiance: scene.ambiance,
        characters: scene.characters,
        background: scene.background,
        assetsReady: scene.assetsReady,
      });

      if (data.storyProgress) {
        setStoryProgress(data.storyProgress);
      }

      if (data.ttsAudioUrl) {
        setTtsAudioUrl(data.ttsAudioUrl);
        if (audioRef.current) {
          audioRef.current.src = data.ttsAudioUrl;
          audioRef.current.play().catch(err => {
            console.warn("[Coordinated] Auto-play blocked:", err);
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: [api.game.getState.path, conversationId] });

    } catch (error: any) {
      console.error("[Coordinated] Error:", error);
      setMessages(messages);
      setChatError({
        message: error.message || "Connection to the magical realm was lost. Please try again.",
        canRetry: true,
        lastUserMessage: lastSentMessageRef.current
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearChapterAdvance = () => setChapterAdvance(null);
  const clearError = () => setChatError(null);
  
  const retryLastMessage = () => {
    if (chatError?.lastUserMessage) {
      sendMessage(chatError.lastUserMessage);
    }
  };

  return { 
    messages, 
    sendMessage, 
    isLoading,
    storyProgress, 
    sceneData,
    ttsAudioUrl,
    chapterAdvance,
    clearChapterAdvance,
    chatError,
    clearError,
    retryLastMessage,
    audioRef,
  };
}
