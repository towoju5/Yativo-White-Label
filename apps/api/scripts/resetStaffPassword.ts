import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/passwords.js";

const prisma = new PrismaClient();

async function listStaff() {
  const staff = await prisma.staffUser.findMany({ orderBy: { createdAt: "asc" }, select: { email: true, role: true, isActive: true } });
  console.log("Usage: pnpm --filter api reset-staff-password <email> <newPassword>\n");
  console.log("Staff accounts on this database:");
  for (const s of staff) console.log(`  ${s.email}  (${s.role}${s.isActive ? "" : ", deactivated"})`);
}

async function main() {
  const [, , email, newPassword] = process.argv;

  if (!email || !newPassword) {
    await listStaff();
    process.exitCode = 1;
    return;
  }
  if (newPassword.length < 8) {
    console.error("Password must be at least 8 characters (matches the login form's own minimum).");
    process.exitCode = 1;
    return;
  }

  const staff = await prisma.staffUser.findUnique({ where: { email } });
  if (!staff) {
    console.error(`No staff user found with email "${email}".\n`);
    await listStaff();
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.staffUser.update({ where: { id: staff.id }, data: { passwordHash } }),
    // Same as the in-app "reset password" admin action — sign out every existing session so a
    // stolen refresh token from before the reset can't still be used to stay logged in.
    prisma.refreshToken.updateMany({ where: { staffUserId: staff.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  console.log(`Password reset for ${email} (${staff.role}). All existing sessions for this account have been signed out.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
