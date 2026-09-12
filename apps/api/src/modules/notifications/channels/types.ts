/** Plain-text notification content, shared across every non-email channel (push/SMS/WhatsApp). Email keeps its own rich HTML templates — see notifications.service.ts. */
export type ChannelMessage = {
  title: string;
  body: string;
};
