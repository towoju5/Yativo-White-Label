// Mock fixture data for crypto/* resource functions under YATIVO_MODE=mock.

export const cryptoAccountFixture = {
  accountId: "crypto-acct-mock-001",
  status: "ACTIVE",
};

export const cryptoWalletBalanceFixture = {
  currencyCode: "USDC",
  availableMinor: "250000",
  pendingMinor: "0",
};

export const cryptoSendResultFixture = {
  sendId: "crypto-send-mock-001",
  status: "BROADCAST",
  txHash: "0xmockhash0000000000000000000000000000000000000000000000000000",
};

export const cryptoSwapResultFixture = {
  swapId: "crypto-swap-mock-001",
  status: "COMPLETED",
};

export const cryptoCardFixture = {
  yativoCardId: "crypto-card-mock-001",
  network: "VISA",
  last4: "1881",
  status: "ACTIVE",
};

export const cryptoGatewayFixture = {
  gatewayId: "gateway-mock-001",
  depositAddress: "0xmockdepositaddress000000000000000000000",
  network: "ETHEREUM",
};

export const cryptoIbanAccountFixture = {
  iban: "GB29MOCK60161331926819",
  bic: "MOCKGB2L",
  accountHolderName: "White Label Platform Ltd",
};

export const cryptoForwardingRuleFixture = {
  ruleId: "forwarding-rule-mock-001",
  destinationAddress: "0xmockdestination0000000000000000000000000",
  status: "ACTIVE",
};

export const cryptoComplianceCheckFixture = {
  checkId: "compliance-check-mock-001",
  status: "PASSED",
  riskScore: 12,
};
