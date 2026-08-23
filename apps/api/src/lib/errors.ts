export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "APP_ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class UnbalancedTransactionError extends AppError {
  constructor(currencyCode: string) {
    super(`Ledger transaction is unbalanced for currency ${currencyCode}: sum(debits) must equal sum(credits)`, 500, "UNBALANCED_TRANSACTION");
  }
}

export class InsufficientFundsError extends AppError {
  constructor(accountId: string) {
    super(`Account ${accountId} does not have sufficient available balance for this transaction`, 409, "INSUFFICIENT_FUNDS");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class KycRequiredError extends AppError {
  constructor() {
    super("Identity verification must be approved before using this feature.", 403, "KYC_REQUIRED");
  }
}
