import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const TYPE_LABEL: Record<"DEPOSIT" | "PAYOUT", string> = { DEPOSIT: "deposit", PAYOUT: "payout" };

/** Opened from TransactionDetailDialog's "Report an issue" button — a lightweight ticket-creation form pre-scoped to one deposit or payout, reusing the same POST /portal/support/tickets endpoint the general Support page form uses, just with transactionId set. */
export function ReportTransactionIssueDialog({ transaction, onClose }: { transaction: { id: string; type: "DEPOSIT" | "PAYOUT" } | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (transaction) setSubject(`Issue with my ${TYPE_LABEL[transaction.type]}`);
  }, [transaction]);

  const mutation = useMutation({
    mutationFn: () => portalApi.post<{ id: string }>("/portal/support/tickets", { subject, message, transactionId: transaction!.id }),
    onSuccess: () => {
      toast({ title: "Ticket created", description: "We'll get back to you here and by email." });
      queryClient.invalidateQueries({ queryKey: ["portal", "support", "tickets"] });
      setMessage("");
      onClose();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't send your report", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <Dialog open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>This opens a support ticket linked to this transaction, so our team has the context already.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-subject">Subject</Label>
            <Input id="report-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-message">What went wrong?</Label>
            <Textarea id="report-message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe the issue…" />
          </div>
          <Button className="w-full" disabled={!subject.trim() || !message.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Sending…" : "Submit report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
