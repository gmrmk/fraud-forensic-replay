// Customer-app view of the seed schema. Only the fields this app renders.
// Mirrors backend/schema.sql + the bank-grade enrichment migration columns the UI uses.
export interface Transaction {
  id: string;
  card_id: string;
  timestamp: string;        // ISO-8601 TEXT; parse with Date.parse()
  amount: number;
  merchant_name: string;
  merchant_lat: number;
  merchant_lng: number;
  merchant_country: string; // "US" | "NG" ...
  mcc: string;
  category: string;
  is_card_present: number;  // 1 = CP, 0 = CNP
  is_fraud: number;         // 1 = flagged
  balance_after: number;    // DB-computed running balance at this txn
  auth_response_code?: string | null; // "00" is approved; a row without the field counts as approved
}

export interface AccountSummary {
  customer: { name: string } & Record<string, unknown>;
  account: { type: string; account_number_last4: string } & Record<string, unknown>;
  card: { bin: string; last_four: string; network: string; product_type?: string } & Record<string, unknown>;
  card_id: string;
  credit_limit: number;
}

export interface ClockState {
  t: number;          // epoch ms (playhead)
  playing: boolean;
  rate: number;
}
