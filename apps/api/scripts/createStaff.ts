import { PrismaClient, type StaffRole } from "@prisma/client";
import { hashPassword } from "../src/lib/passwords.js";

const prisma = new PrismaClient();
const VALID_ROLES: StaffRole[] = ["OWNER", "ADMIN", "STAFF"];

function usage() {
  console.log("Usage: pnpm --filter api create-staff <email> <password> [role]");
  console.log(`  role defaults to ADMIN. Valid roles: ${VALID_ROLES.join(", ")}`);
}

async function main() {
  const [, , email, password, roleArg] = process.argv;
  const role = (roleArg?.toUpperCase() ?? "ADMIN") as StaffRole;

  if (!email || !password) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters (matches the login form's own minimum).");
    process.exitCode = 1;
    return;
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${roleArg}".`);
    usage();
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) {
    console.error(`A staff user with email "${email}" already exists (${existing.role}). Use reset-staff-password instead if you need to regain access.`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  const staff = await prisma.staffUser.create({ data: { email, passwordHash, role } });

  console.log(`Created staff user ${staff.email} with role ${staff.role}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
