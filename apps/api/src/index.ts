import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startDemoCleanupScheduler } from "./jobs/demoCleanupScheduler.js";
import { startWebhookProcessorWorker } from "./jobs/workers/webhookProcessor.worker.js";
import { startReconciliationScheduler } from "./jobs/scheduler.js";
import { startCurrencySyncScheduler } from "./jobs/currencySyncScheduler.js";
import { startEmailWorker } from "./jobs/workers/email.worker.js";
import { startPayoutPollWorker } from "./jobs/workers/payoutPoll.worker.js";
import { getPayoutPollQueue } from "./jobs/payoutPollQueue.js";
import { startCustomerImportWorker } from "./jobs/workers/customerImport.worker.js";
import { getCustomerImportQueue } from "./jobs/customerImportQueue.js";

const app = await buildApp();

const webhookWorker = startWebhookProcessorWorker(app.prisma);
const { queue: reconciliationQueue, worker: reconciliationWorker } = await startReconciliationScheduler(app.prisma);
const { queue: currencySyncQueue, worker: currencySyncWorker } = await startCurrencySyncScheduler(app.prisma);
const emailWorker = startEmailWorker();
const payoutPollWorker = startPayoutPollWorker(app.prisma);
const customerImportWorker = startCustomerImportWorker(app.prisma);

// Only started when DEMO_ENABLED=true — the whole demo system (routes, ALS context hook, and
// this cron) is inert on a deployment that hasn't opted in.
const demoCleanup = env.DEMO_ENABLED ? await startDemoCleanupScheduler(app.prisma, app.redis) : null;

app.addHook("onClose", async () => {
  if (demoCleanup) {
    await demoCleanup.worker.close();
    await demoCleanup.queue.close();
  }
  await webhookWorker.close();
  await reconciliationWorker.close();
  await reconciliationQueue.close();
  await currencySyncWorker.close();
  await currencySyncQueue.close();
  await emailWorker.close();
  await payoutPollWorker.close();
  await getPayoutPollQueue().close();
  await customerImportWorker.close();
  await getCustomerImportQueue().close();
});

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
