// Seed script — creates the bootstrap admin user if no users exist,
// then issues a registration token for local dev testing.
// Usage: bun run scripts/seed-dev.ts

import { db } from "../src/lib/db";
import { hashPassword, generateToken } from "../src/lib/auth";

async function main() {
  const existing = await db.user.findFirst({});
  if (existing) {
    console.log(`admin user already exists: ${existing.email}`);
  } else {
    const passwordHash = await hashPassword("admin");
    const admin = await db.user.create({
      data: { email: "admin@darkpool.local", name: "Administrator", passwordHash, role: "admin" },
    });
    console.log(`created admin user: ${admin.email} (password: "admin")`);
  }

  // Issue a dev registration token
  const token = generateToken(24);
  const rt = await db.registrationToken.create({
    data: { token, label: "dev-bootstrap", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });
  console.log(`\ndev registration token (24h):`);
  console.log(`  ${token}`);
  console.log(`\nTo start a local worker agent:`);
  console.log(`  cd worker-agent && bun install`);
  console.log(`  MAIN_URL=http://localhost:3000 \\`);
  console.log(`  REGISTRATION_TOKEN=${token} \\`);
  console.log(`  bun src/agent.ts`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
