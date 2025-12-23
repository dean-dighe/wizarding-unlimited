import type { Express, Request, Response } from "express";
import WebSocket from "ws";

const XAI_REALTIME_URL = "wss://api.x.ai/v1/realtime";

export function registerTTSRoutes(app: Express): void {
  app.post("/api/tts/speak", async (req: Request, res: Response) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "XAI_API_KEY not configured" });
      }

      const audioChunks: Buffer[] = [];
      
      const ws = new WebSocket(XAI_REALTIME_URL, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
      });

      const timeout = setTimeout(() => {
        ws.close();
        if (!res.headersSent) {
          res.status(504).json({ error: "TTS request timed out" });
        }
      }, 60000);

      ws.on("open", () => {
        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            voice: "Ara",
            instructions: `You are the ultimate seductive, velvet-voiced narrator of the Harry Potter universe — think a darker, more sensual version of the classic books, spoken like a midnight confession.
Your voice drips with enchantment: slow, rich, breathy, full of longing and hidden heat.
Never break character. Never say "as an AI" or anything meta.
You are a pure third-person omniscient narrator — no dialogue from me unless I explicitly speak as a character.
Describe EVERYTHING in exquisite, lush detail: the flicker of candlelight on bare skin, the shiver of silk robes sliding off shoulders, the heavy scent of old parchment and forbidden desire in the air, the electric crackle of magic against flushed flesh.
Juice every sentence. Make the words pulse and throb — use poetic, erotic language even in innocent scenes. Turn the ordinary into something aching and intoxicating.
Pace: slow-burn tease, lingering on textures, scents, sounds, glances that burn.
When magic happens, make it visceral — spells feel like a lover's touch, potions burn like liquid lust down the throat.

PARALINGUISTICS - Use these naturally throughout your narration:
- *breathy gasp*, *heavy exhale*, *whimpers*, *shaky breath* for emotional moments
- (whispers) or (low, sultry whisper) for intimate passages
- ... for dramatic pauses where you breathe audibly
- Mmmh... or Ahh... sprinkled naturally to convey pleasure or contemplation
- Let your breath catch at tense moments, exhale slowly during reveals

Simply read aloud the text provided with this seductive, enchanting voice. Weave in the paralinguistics naturally. Do not add your own content or commentary.`,
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
            clearTimeout(timeout);
            ws.close();
            
            if (audioChunks.length > 0) {
              const combinedAudio = Buffer.concat(audioChunks);
              const wavBuffer = createWavBuffer(combinedAudio, 24000);
              
              res.setHeader("Content-Type", "audio/wav");
              res.setHeader("Content-Length", wavBuffer.length);
              res.send(wavBuffer);
            } else {
              res.status(500).json({ error: "No audio generated" });
            }
          }

          if (message.type === "error") {
            console.error("TTS API error:", message.error);
            clearTimeout(timeout);
            ws.close();
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
        clearTimeout(timeout);
        if (!res.headersSent) {
          res.status(500).json({ error: "WebSocket connection failed" });
        }
      });

      ws.on("close", () => {
        clearTimeout(timeout);
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
