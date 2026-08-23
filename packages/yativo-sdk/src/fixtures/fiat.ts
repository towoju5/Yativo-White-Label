// Mock fixture data returned by fiat/* resource functions when
// `YATIVO_MODE=mock`. Representative, not exhaustive — the goal is a stable
// shape the rest of the scaffold can develop against without live credentials.

export const fiatWalletBalanceFixture = {
  currencyCode: "USD",
  availableMinor: "500000",
  pendingMinor: "0",
};

// Deliberately different from `fiatWalletBalanceFixture` / any ledger-derived
// expected balance so `POST /admin/reconciliation/run` demonstrably produces
// at least one MISMATCH row — see apps/api reconciliation.service.ts.
export const fiatSettlementBalanceFixture = {
  currencyCode: "USD",
  availableMinor: "499500", // intentionally off by 500 minor units from the ledger's expected balance
  pendingMinor: "0",
};

export const fiatCustomerFixture = {
  yativoCustomerId: "yativo-cust-mock-001",
  status: "ACTIVE",
};

export const fiatKycSubmissionFixture = {
  submissionId: "kyc-mock-001",
  status: "PENDING",
};

export const fiatKycStatusFixture = {
  status: "PENDING",
};

export const fiatVirtualAccountFixture = {
  accountNumber: "8801234567",
  routingNumber: "021000021",
  bankName: "Yativo Partner Bank (Mock)",
  accountHolderName: "White Label Platform Ltd",
  currencyCode: "USD",
};

export const fiatSwapRouteFixture = {
  routeId: "swap-route-mock-001",
  sourceCurrency: "USD",
  targetCurrency: "USDC",
  rate: "1.00",
};

export const fiatSwapResultFixture = {
  swapId: "swap-mock-001",
  status: "COMPLETED",
};

export const fiatPaymentMethodFixture = {
  paymentMethodId: "pm-mock-001",
  type: "BANK_ACCOUNT",
  status: "ACTIVE",
};

export const fiatPayoutResultFixture = {
  yativoPayoutId: "payout-mock-001",
  status: "pending",
};

export const fiatQuoteFixture = {
  quoteId: "quote-mock-001",
  fromCurrency: "USD",
  toCurrency: "MXN",
  methodId: "mock-payout-gateway-1",
  amount: 100,
  rate: "17.05",
  customerReceiveAmount: "1705.00",
  customerTotalAmountDue: "100.00",
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
};

export const fiatCardFixture = {
  yativoCardId: "card-mock-001",
  network: "VISA",
  last4: "4242",
  status: "ACTIVE",
};

export const fiatGiftCardFixture = {
  giftCardId: "giftcard-mock-001",
  brand: "MOCK_MART",
  amountMinor: "5000",
  currencyCode: "USD",
  status: "ISSUED",
};

export const fiatBeneficiaryFixture = {
  yativoBeneficiaryId: "beneficiary-mock-001",
  status: "VERIFIED",
};

export const fiatTransactionFixture = {
  yativoTransactionId: "txn-mock-001",
  status: "SETTLED",
  amountMinor: "10000",
  currencyCode: "USD",
};
