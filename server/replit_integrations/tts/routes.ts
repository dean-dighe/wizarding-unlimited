import type { Express, Request, Response } from "express";
import WebSocket from "ws";

const XAI_REALTIME_URL = "wss://api.x.ai/v1/realtime";
const MAX_TTS_TEXT_LENGTH = 4000; // Max characters for TTS to prevent abuse
const TTS_RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const TTS_RATE_LIMIT_MAX = 10; // 10 TTS requests per minute per IP

// Simple rate limiter for TTS
const ttsRateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkTTSRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = ttsRateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    ttsRateLimitMap.set(ip, { count: 1, resetTime: now + TTS_RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  
  if (record.count >= TTS_RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  record.count++;
  return { allowed: true };
}

// Cleanup old entries
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(ttsRateLimitMap.entries());
  for (const [ip, record] of entries) {
    if (now > record.resetTime) {
      ttsRateLimitMap.delete(ip);
    }
  }
}, 60000);

export function registerTTSRoutes(app: Express): void {
  app.post("/api/tts/speak", async (req: Request, res: Response) => {
    try {
      // Rate limiting
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const rateCheck = checkTTSRateLimit(clientIp);
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', rateCheck.retryAfter || 60);
        return res.status(429).json({ error: "Too many TTS requests. Please wait." });
      }

      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }
      
      // Validate text length
      if (typeof text !== 'string' || text.length > MAX_TTS_TEXT_LENGTH) {
        return res.status(400).json({ error: `Text must be under ${MAX_TTS_TEXT_LENGTH} characters` });
      }

      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "XAI_API_KEY not configured" });
      }

      const audioChunks: Buffer[] = [];
      let isCleanedUp = false;
      
      const ws = new WebSocket(XAI_REALTIME_URL, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
      });

      const timeout = setTimeout(() => {
        cleanup();
        if (!res.headersSent) {
          res.status(504).json({ error: "TTS request timed out" });
        }
      }, 60000);

      // Cleanup function to prevent resource leaks
      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        clearTimeout(timeout);
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };

      // Handle client disconnect (browser closes, request aborted)
      req.on("close", () => {
        if (!res.headersSent) {
          console.log("[TTS] Client disconnected, cleaning up WebSocket");
          cleanup();
        }
      });

      ws.on("open", () => {
        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            voice: "Ara",
            instructions: `You are an enchanting narrator for a magical Harry Potter adventure game. Your voice is warm, rich, and captivating — like a skilled storyteller weaving tales by firelight in the Hogwarts common room.

Your narration style:
- Warm and inviting, with a sense of wonder and mystery
- Evocative descriptions that bring the magical world to life
- Vary your pace: slower for suspense, quicker for action
- Express genuine emotion: excitement during adventures, tension during danger, warmth during friendship
- Never break character or mention being an AI

PARALINGUISTICS - CRITICAL: The text contains embedded stage directions in *asterisks* or (parentheses). DO NOT read these words aloud. Instead, PERFORM them:
- When you see *gasp* — audibly gasp, do NOT say the word "gasp"
- When you see *voice trembling* — make your voice tremble with emotion
- When you see *whispered* or (whispered) — whisper the following text
- When you see *hushed tone* — speak quietly and mysteriously
- When you see ... — pause dramatically for a beat
- When you see expressions like "Hmm..." or "Oh..." — vocalize these naturally

NEVER read stage directions as words. They are instructions for HOW to speak, not WHAT to say.

Simply read the narrative text with your enchanting storyteller voice, performing any cues you encounter. Do not add your own commentary or content.`,
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            turn_detection: null
          }
        }));

        ws.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: `Read this aloud: ${text}` }]
          }
        }));

        ws.send(JSON.stringify({ 
          type: "response.create",
          response: {
            modalities: ["audio"]
          }
        }));
      });

      ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === "response.output_audio.delta" && message.delta) {
            const audioBytes = Buffer.from(message.delta, "base64");
            audioChunks.push(audioBytes);
          }
          
          if (message.type === "response.done") {
            cleanup();
            
            if (audioChunks.length > 0) {
              const combinedAudio = Buffer.concat(audioChunks);
              const wavBuffer = createWavBuffer(combinedAudio, 24000);
              
              res.setHeader("Content-Type", "audio/wav");
              res.setHeader("Content-Length", wavBuffer.length);
              res.send(wavBuffer);
            } else if (!res.headersSent) {
              res.status(500).json({ error: "No audio generated" });
            }
          }

          if (message.type === "error") {
            console.error("TTS API error:", message.error);
            cleanup();
            if (!res.headersSent) {
              res.status(500).json({ error: message.error?.message || "TTS error" });
            }
          }
        } catch (e) {
          console.error("Error parsing TTS message:", e);
        }
      });

      ws.on("error", (error) => {
        console.error("TTS WebSocket error:", error);
        cleanup();
        if (!res.headersSent) {
          res.status(500).json({ error: "WebSocket connection failed" });
        }
      });

      ws.on("close", () => {
        cleanup();
      });

    } catch (error) {
      console.error("Error in TTS:", error);
      res.status(500).json({ error: "Failed to generate speech" });
    }
  });
}

function createWavBuffer(pcmData: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;
  
  const buffer = Buffer.alloc(headerSize + dataSize);
  
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  pcmData.copy(buffer, headerSize);
  
  return buffer;
}
