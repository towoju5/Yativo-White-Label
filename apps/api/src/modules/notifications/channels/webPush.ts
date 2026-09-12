import webpush from "web-push";
import type { PrismaClient } from "@prisma/client";
import { notificationChannelConfig } from "../../../lib/notificationChannelConfig.js";
import { getBranding } from "../../branding/branding.service.js";
import logger from "../../../lib/logger.js";
import type { ChannelMessage } from "./types.js";

/** Sends a browser push notification to every device the customer has subscribed on. Silently no-ops if no VAPID keys are configured yet (shouldn't happen — they're self-generated at boot, see notificationChannelConfig.ts) or the customer has no subscriptions. */
export async function sendWebPush(prisma: PrismaClient, customerId: string, message: ChannelMessage): Promise<void> {
  const { vapidPublicKey, vapidPrivateKey, vapidSubject } = notificationChannelConfig.webPush;
  if (!vapidPublicKey || !vapidPrivateKey) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { customerId } });
  if (subscriptions.length === 0) return;

  const branding = await getBranding(prisma);
  const icon = branding.logoUrl ?? branding.faviconUrl ?? undefined;
  const payload = JSON.stringify({ title: message.title, body: message.body, icon });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { vapidDetails: { subject: vapidSubject, publicKey: vapidPublicKey, privateKey: vapidPrivateKey } },
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Push service confirms this subscription is gone (browser data cleared, uninstalled, etc.) — clean it up.
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          logger.error({ err, customerId, subscriptionId: sub.id }, "Web push send failed");
        }
      }
    }),
  );
}
