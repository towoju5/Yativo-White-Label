-- CreateIndex
CREATE INDEX "ledger_transactions_createdAt_idx" ON "ledger_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "ledger_transactions_status_createdAt_idx" ON "ledger_transactions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_transactions_type_createdAt_idx" ON "ledger_transactions"("type", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_events_processingStatus_receivedAt_idx" ON "webhook_events"("processingStatus", "receivedAt");

-- CreateIndex
CREATE INDEX "webhook_events_eventType_receivedAt_idx" ON "webhook_events"("eventType", "receivedAt");

