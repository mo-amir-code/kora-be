import { app } from "./app.js";
import { env } from "./config/index.js";

function startServer(): void {
  app.listen(env.PORT, env.HOST, () => {
    console.log(`[server] running on http://${env.HOST}:${env.PORT}`);
    console.log(`[server] environment: ${env.NODE_ENV}`);
  });
}

startServer();
