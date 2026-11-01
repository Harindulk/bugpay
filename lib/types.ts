export type Severity = "S1" | "S2" | "S3" | "S4";
export type Verdict = "valid" | "duplicate" | "not_a_bug" | "needs_info";
export type ReportStatus = "review" | "approved" | "paid" | "rejected";

export interface Tester {
  name: string;
  email: string; // PayPal email the bounty is paid to
  country: string;
}

export interface Triage {
  verdict: Verdict;
  severity: Severity | null;
  duplicateOf: string | null;
  confidence: number; // 0-1
  title: string;
  repro: string[];
  reasoning: string;
  bounty: number; // USD, set by the price table, never by the model
  decision: "auto_pay" | "review";
  decisionReason: string;
  by: string; // model id, or "rules" in mock mode
}

export interface Report {
  id: string; // BUG-0141
  title: string;
  body: string;
  build: string;
  device: string;
  tester: Tester;
  createdAt: string; // ISO
  triage: Triage;
  status: ReportStatus;
  bounty: number; // what the studio will pay; starts at triage.bounty, editable
  payoutItem?: string; // sender_item_id inside a batch
}

export interface PayoutItem {
  reportId: string;
  email: string;
  amount: number;
  status: string; // PayPal transaction_status: SUCCESS, PENDING, UNCLAIMED...
  paypalItemId?: string;
}

export interface PayoutBatch {
  id: string; // PB-0006, for people
  senderBatchId?: string; // what PayPal saw; reused on every retry so a batch is never paid twice
  paypalBatchId: string; // empty until PayPal confirms the batch
  createdAt: string;
  status: string; // PayPal batch_status
  trigger: "autopilot" | "agent" | "studio";
  items: PayoutItem[];
}

export interface Funding {
  orderId: string;
  captureId: string;
  amount: number;
  capturedAt: string;
}

export interface Rules {
  prices: Record<Severity, number>;
  autopilot: boolean;
  perBugCap: number;
  dailyCap: number;
  minConfidence: number;
}

export interface Campaign {
  studio: string;
  game: string;
  build: string;
  brief: string; // what testers should focus on; also context for triage
  knownIssues: string[];
  rules: Rules;
}

export interface Db {
  ledgerId: string; // random per ledger, so PayPal batch ids never repeat after a reset
  campaign: Campaign;
  reports: Report[];
  batches: PayoutBatch[];
  funding: Funding[];
}
