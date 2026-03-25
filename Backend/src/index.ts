import cors from "cors";
import express from "express";
import { loadConfig } from "./config/env.js";
import { QueryController } from "./controllers/queryController.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import { GroqProvider } from "./providers/groq.provider.js";
import { Neo4jProvider } from "./providers/neo4jProvider.js";
import { createQueryRouter } from "./routes/queryRoutes.js";
import { QueryService } from "./services/queryService.js";

const config = loadConfig();

const neo4jProvider = new Neo4jProvider(config);
const groqProvider = new GroqProvider(config);
const queryService = new QueryService(groqProvider, neo4jProvider);
const queryController = new QueryController(queryService);

const app = express();
const localhostOrigin =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (origin === config.corsOrigin || localhostOrigin.test(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/query", createQueryRouter(queryController));

app.use(globalErrorHandler);

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

const shutdown = async () => {
  server.close();
  await neo4jProvider.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
