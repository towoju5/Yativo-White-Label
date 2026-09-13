import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startWebhookProcessorWorker } from "./jobs/workers/webhookProcessor.worker.js";
import { startReconciliationScheduler } from "./jobs/scheduler.js";
import { startEmailWorker } from "./jobs/workers/email.worker.js";
import { startPayoutPollWorker } from "./jobs/workers/payoutPoll.worker.js";
import { getPayoutPollQueue } from "./jobs/payoutPollQueue.js";
import { startCustomerImportWorker } from "./jobs/workers/customerImport.worker.js";
import { getCustomerImportQueue } from "./jobs/customerImportQueue.js";

const app = await buildApp();

const webhookWorker = startWebhookProcessorWorker(app.prisma);
const { queue: reconciliationQueue, worker: reconciliationWorker } = await startReconciliationScheduler(app.prisma);
const emailWorker = startEmailWorker();
const payoutPollWorker = startPayoutPollWorker(app.prisma);
const customerImportWorker = startCustomerImportWorker(app.prisma);

app.addHook("onClose", async () => {
  await webhookWorker.close();
  await reconciliationWorker.close();
  await reconciliationQueue.close();
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
