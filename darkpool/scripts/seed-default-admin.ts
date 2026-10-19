// Seed the user-requested default admin account: admin@admin.com / admin123!
// Also keeps the existing admin@darkpool.local account if it exists.
// Usage: bun run scripts/seed-default-admin.ts

import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

async function main() {
  const targetEmail = "admin@admin.com";
  const targetPassword = "admin123!";

  const existing = await db.user.findUnique({ where: { email: targetEmail } });
  if (existing) {
    // Force-update password to ensure it's exactly what the user wants
    const passwordHash = await hashPassword(targetPassword);
    await db.user.update({
      where: { id: existing.id },
      data: { passwordHash, role: "admin", status: "active" },
    });
    console.log(`updated admin user: ${targetEmail} (password set to the requested value)`);
  } else {
    const passwordHash = await hashPassword(targetPassword);
    const admin = await db.user.create({
      data: { email: targetEmail, name: "Administrator", passwordHash, role: "admin" },
    });
    console.log(`created admin user: ${admin.email} (password: ${targetPassword})`);
  }

  // Also ensure no other admins are accidentally blocking bootstrap
  const allAdmins = await db.user.findMany({ where: { role: "admin" } });
  console.log(`\ntotal admin accounts: ${allAdmins.length}`);
  for (const a of allAdmins) {
    console.log(`  - ${a.email} (status: ${a.status})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
