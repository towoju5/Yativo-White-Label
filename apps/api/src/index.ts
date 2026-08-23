import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startWebhookProcessorWorker } from "./jobs/workers/webhookProcessor.worker.js";
import { startReconciliationScheduler } from "./jobs/scheduler.js";

const app = await buildApp();

const webhookWorker = startWebhookProcessorWorker(app.prisma);
const { queue: reconciliationQueue, worker: reconciliationWorker } = await startReconciliationScheduler(app.prisma);

app.addHook("onClose", async () => {
  await webhookWorker.close();
  await reconciliationWorker.close();
  await reconciliationQueue.close();
});

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
