import type { Express, Request, Response } from "express";

const XAI_API_URL = "https://api.x.ai/v1/images/generations";

export function registerImageRoutes(app: Express): void {
  app.post("/api/generate-image", async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "XAI_API_KEY not configured" });
      }

      const response = await fetch(XAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-2-image-1212",
          prompt: prompt,
          n: 1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("xAI API error:", errorText);
        return res.status(response.status).json({ error: "Failed to generate image" });
      }

      const data = await response.json();
      const imageData = data.data?.[0];

      if (!imageData) {
        return res.status(500).json({ error: "No image data returned" });
      }

      res.json({
        url: imageData.url,
        b64_json: imageData.b64_json,
      });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });
}
