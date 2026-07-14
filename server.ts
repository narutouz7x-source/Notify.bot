import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// Import bot variables/functions
import {
  startBot,
  botLogs,
  isBotReady,
  botUser,
  botError,
  lastCheckedPost,
  checkInstagramPosts,
  parseInstagramResponse,
  getBotConfig,
  updateBotConfig
} from "./src/index.js";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. Mock Instagram API for Local Testing
  // Returns a new Instagram post structure each time it's hit, simulating new posts
  app.get("/api/instagram-mock-posts", (req, res) => {
    const timestamp = Date.now();
    const mockCaptions = [
      "Keep pushing your limits. Great things take time! 💪⚽🔥 #motivation #grind #focus",
      "An unforgettable day with the team! Grateful for the support. 🙌❤️ #matchday #victory",
      "Sunset vibes from the training grounds. 🌅 Beautiful evening to practice! #nature #football #training",
      "New collection dropping soon. Stay tuned! 👀👕💎 #style #fashion #collaboration"
    ];
    const mockCaption = mockCaptions[Math.floor(Math.random() * mockCaptions.length)];
    const mockImages = [
      "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1543351611-58f69d7c1781?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1518063319789-7217e6706b04?auto=format&fit=crop&q=80&w=800"
    ];
    const mockImage = mockImages[Math.floor(Math.random() * mockImages.length)];

    res.json([
      {
        id: `mock_post_${timestamp}`,
        shortcode: `Cu${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        caption: mockCaption,
        link: `https://www.instagram.com/p/mock_${timestamp}/`,
        media_url: mockImage
      }
    ]);
  });

  // 2. Fetch current status of the bot
  app.get("/api/bot-status", (req, res) => {
    const currentConfig = getBotConfig();
    res.json({
      isReady: isBotReady,
      botUser,
      botError,
      lastPost: lastCheckedPost,
      logs: botLogs,
      config: {
        DISCORD_TOKEN_CONFIGURED: !!(currentConfig.DISCORD_TOKEN && currentConfig.DISCORD_TOKEN !== "YOUR_DISCORD_BOT_TOKEN_HERE" && currentConfig.DISCORD_TOKEN !== "MY_DISCORD_TOKEN"),
        DISCORD_TOKEN: currentConfig.DISCORD_TOKEN,
        TARGET_CHANNEL_ID: currentConfig.TARGET_CHANNEL_ID || "Not Configured",
        INSTAGRAM_USERNAME: currentConfig.INSTAGRAM_USERNAME || "cristiano",
        API_URL: currentConfig.API_URL || "https://instagram-bulk-profile-scraps.p.rapidapi.com/v1.2/posts",
        API_KEY: currentConfig.API_KEY || "",
        BOT_PREFIX: currentConfig.BOT_PREFIX || "!"
      }
    });
  });

  // 3. Trigger Instagram poll manually
  app.post("/api/trigger-poll", async (req, res) => {
    try {
      const result = await checkInstagramPosts();
      res.json({
        success: true,
        message: "Instagram poll triggered successfully",
        post: result
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  // 4. Update configuration dynamically
  app.post("/api/update-config", (req, res) => {
    try {
      const {
        DISCORD_TOKEN,
        TARGET_CHANNEL_ID,
        INSTAGRAM_USERNAME,
        API_URL,
        API_KEY,
        BOT_PREFIX
      } = req.body;

      updateBotConfig({
        DISCORD_TOKEN,
        TARGET_CHANNEL_ID,
        INSTAGRAM_USERNAME,
        API_URL,
        API_KEY,
        BOT_PREFIX
      });

      res.json({
        success: true,
        message: "Configuration updated successfully",
        config: getBotConfig()
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  // Start the Discord Bot process in the background
  startBot();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Web server running on http://localhost:${PORT}`);
  });
}

startServer();
