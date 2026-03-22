import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { config } from "./server/config";
import { logger } from "./server/utils/logger";
import apiRoutes from "./server/routes";

const app = express();

app.use(cors());
app.use(express.json());

// Mount API Routes (includes Health Check and Telegram Webhook)
app.use("/api", apiRoutes);

async function startServer() {
  // Vite middleware for development
  if (config.env !== "production") {
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

  app.listen(config.port, "0.0.0.0", () => {
    logger.info(`Server running on http://localhost:${config.port}`);
    logger.info(`Webhook URL: ${process.env.APP_URL || 'YOUR_APP_URL'}/api/webhook/telegram`);
  });
}

startServer().catch(err => {
  logger.error("Failed to start server", err);
  process.exit(1);
});

