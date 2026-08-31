import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/passwords.js";
import { ensurePlatformAccount, ensureCustomerWalletAccount } from "../src/modules/ledger/accounts.js";
import { postTransaction } from "../src/modules/ledger/postTransaction.js";
import { bootstrapPlatformData } from "../src/lib/bootstrapPlatformData.js";

const prisma = new PrismaClient();

async function main() {
  await bootstrapPlatformData(prisma);

  const owner = await prisma.staffUser.upsert({
    where: { email: "owner@example.com" },
    update: {},
    create: { email: "owner@example.com", passwordHash: await hashPassword("password123"), role: "OWNER" },
  });
  console.log(`Staff owner: owner@example.com / password123 (id=${owner.id})`);

  const settlement = await ensurePlatformAccount(prisma, "YATIVO_SETTLEMENT", "USD");
  const suspense = await ensurePlatformAccount(prisma, "SUSPENSE_PENDING", "USD");
  const feeRevenue = await ensurePlatformAccount(prisma, "PLATFORM_FEE_REVENUE", "USD");

  const jane = await prisma.customer.upsert({
    where: { email: "jane@example.com" },
    update: {},
    create: {
      type: "INDIVIDUAL",
      fullName: "Jane Doe",
      email: "jane@example.com",
      passwordHash: await hashPassword("password123"),
      kycStatus: "APPROVED",
    },
  });
  console.log(`Portal customer: jane@example.com / password123 (id=${jane.id})`);

  const janeWallet = await ensureCustomerWalletAccount(prisma, jane.id, "USD");

  await postTransaction(prisma, {
    type: "DEPOSIT",
    status: "POSTED",
    idempotencyKey: "seed:deposit:jane",
    externalSource: "MANUAL",
    description: "Seed deposit",
    lines: [
      { accountId: settlement.id, direction: "DEBIT", amountMinor: 100_000n, currencyCode: "USD" },
      { accountId: janeWallet.id, direction: "CREDIT", amountMinor: 100_000n, currencyCode: "USD" },
    ],
  });

  await postTransaction(prisma, {
    type: "FEE",
    status: "POSTED",
    idempotencyKey: "seed:fee:jane",
    externalSource: "MANUAL",
    description: "Seed monthly account fee",
    lines: [
      { accountId: janeWallet.id, direction: "DEBIT", amountMinor: 500n, currencyCode: "USD" },
      { accountId: feeRevenue.id, direction: "CREDIT", amountMinor: 500n, currencyCode: "USD" },
    ],
  });

  await postTransaction(prisma, {
    type: "PAYOUT",
    status: "PENDING",
    idempotencyKey: "seed:payout-hold:jane",
    externalSource: "MANUAL",
    description: "Seed pending payout hold",
    lines: [
      { accountId: janeWallet.id, direction: "DEBIT", amountMinor: 10_000n, currencyCode: "USD" },
      { accountId: suspense.id, direction: "CREDIT", amountMinor: 10_000n, currencyCode: "USD" },
    ],
  });

  await prisma.beneficiary.upsert({
    where: { id: "seed-beneficiary-jane-checking" },
    update: {},
    create: {
      id: "seed-beneficiary-jane-checking",
      customerId: jane.id,
      name: "Jane's Checking Account",
      type: "BANK_ACCOUNT",
      details: { bankName: "Mock Bank", accountNumber: "000123456789", routingNumber: "021000021" },
    },
  });
  console.log("Seeded beneficiary: Jane's Checking Account (id=seed-beneficiary-jane-checking)");

  const wallet = await prisma.wallet.findUnique({ where: { id: janeWallet.wallet!.id } });
  console.log(`Jane's USD wallet — available: ${wallet!.cachedAvailableMinor}, pending: ${wallet!.cachedPendingMinor}`);
  console.log("Expected — available: 89500, pending: 10000");

  await prisma.staticPage.upsert({
    where: { slug: "terms" },
    update: {},
    create: {
      slug: "terms",
      title: "Terms of Service",
      kind: "SYSTEM",
      contentHtml: TERMS_OF_SERVICE_HTML,
    },
  });

  await prisma.staticPage.upsert({
    where: { slug: "privacy" },
    update: {},
    create: {
      slug: "privacy",
      title: "Privacy Policy",
      kind: "SYSTEM",
      contentHtml: PRIVACY_POLICY_HTML,
    },
  });
  console.log("Seeded static pages: terms, privacy");
}

const TERMS_OF_SERVICE_HTML = `
<p>These Terms of Service ("Terms") govern your access to and use of our accounts, wallets, payments, and card services (the "Services"). By creating an account or otherwise using the Services, you agree to be bound by these Terms.</p>

<h2>1. Eligibility</h2>
<p>You must be at least 18 years old and able to form a legally binding contract to use the Services. You must complete identity verification before certain features — including sending funds, holding a virtual account, or issuing a card — are enabled on your account.</p>

<h2>2. Your account</h2>
<p>You're responsible for keeping your login credentials and any two-factor authentication method secure, and for all activity that occurs under your account. Notify us immediately if you suspect unauthorized access.</p>

<h2>3. Wallets and balances</h2>
<p>Funds held in your wallet are reflected in our ledger and are available for transfers, payouts, and card spending subject to any pending holds shown on your account. We may place a temporary hold on funds while a transaction is being processed or reviewed.</p>

<h2>4. Payments and transfers</h2>
<p>When you initiate a payout or transfer, you authorize us to debit your wallet for the amount shown, including any applicable fees and the exchange rate quoted to you at the time of confirmation. Quotes are time-limited and may expire before a transaction is confirmed.</p>

<h2>5. Prohibited use</h2>
<ul>
<li>Using the Services for any unlawful purpose, including money laundering or financing of terrorism</li>
<li>Attempting to circumvent identity verification or compliance controls</li>
<li>Interfering with or disrupting the integrity of the Services</li>
</ul>

<h2>6. Fees</h2>
<p>Applicable fees for transfers, card issuance, and other services are disclosed to you before you confirm a transaction. We may update our fee schedule from time to time with reasonable notice.</p>

<h2>7. Suspension and termination</h2>
<p>We may suspend or close your account if we reasonably believe you've violated these Terms, applicable law, or if required by a compliance or regulatory obligation.</p>

<h2>8. Limitation of liability</h2>
<p>To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from your use of the Services.</p>

<h2>9. Changes to these Terms</h2>
<p>We may update these Terms from time to time. Continued use of the Services after a change becomes effective constitutes acceptance of the revised Terms.</p>

<h2>10. Contact</h2>
<p>Questions about these Terms can be sent to our support team using the contact details on our website.</p>
`.trim();

const PRIVACY_POLICY_HTML = `
<p>This Privacy Policy explains how we collect, use, and protect your personal information when you use our accounts, wallets, payments, and card services (the "Services").</p>

<h2>1. Information we collect</h2>
<ul>
<li><strong>Identity information</strong> — name, date of birth, government ID, and address, collected during identity verification</li>
<li><strong>Account information</strong> — email, phone number, and authentication details</li>
<li><strong>Transaction information</strong> — wallet balances, transfers, payouts, and card activity</li>
<li><strong>Technical information</strong> — device, browser, and usage data collected automatically</li>
</ul>

<h2>2. How we use your information</h2>
<ul>
<li>To provide, maintain, and improve the Services</li>
<li>To verify your identity and meet our legal and regulatory obligations</li>
<li>To detect and prevent fraud, money laundering, and other financial crime</li>
<li>To communicate with you about your account and transactions</li>
</ul>

<h2>3. Sharing your information</h2>
<p>We share information with identity verification and payment providers who help us deliver the Services, with regulators and law enforcement where required by law, and with service providers bound by confidentiality obligations. We do not sell your personal information.</p>

<h2>4. Data retention</h2>
<p>We retain your information for as long as your account is active and for a period afterward as required by applicable financial recordkeeping and compliance laws.</p>

<h2>5. Your rights</h2>
<p>Depending on where you live, you may have the right to access, correct, or request deletion of your personal information, subject to our legal and regulatory retention obligations. Contact our support team to make a request.</p>

<h2>6. Security</h2>
<p>We use technical and organizational safeguards — including encryption in transit and at rest — to protect your information. No system is completely secure, and we encourage you to also protect your own login credentials.</p>

<h2>7. Changes to this policy</h2>
<p>We may update this Privacy Policy from time to time. We'll notify you of material changes through the Services or by email.</p>

<h2>8. Contact</h2>
<p>Questions about this Privacy Policy can be sent to our support team using the contact details on our website.</p>
`.trim();

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
