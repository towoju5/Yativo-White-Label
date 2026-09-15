import type { Customer } from "@prisma/client";
import { AppError } from "./errors.js";

/** Business Cards are business-customers-only, full stop — no admin opt-in for individuals. */
export function requireBusinessCustomer(customer: Pick<Customer, "type">): void {
  if (customer.type !== "BUSINESS") {
    throw new AppError("Business Cards are currently only available to business customers.", 403, "BUSINESS_CUSTOMER_REQUIRED");
  }
}
