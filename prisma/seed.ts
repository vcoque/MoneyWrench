import { db } from "../lib/db";

async function main() {
  const household = await db.household.upsert({
    where: { id: "seed-household" },
    update: {},
    create: {
      id: "seed-household",
      name: "Sample Household",
      currency: "USD",
    },
  });

  const user = await db.user.upsert({
    where: { email: "dev@moneywrench.local" },
    update: {},
    create: {
      email: "dev@moneywrench.local",
      name: "Dev User",
      householdId: household.id,
    },
  });

  console.log("Seeded household:", household);
  console.log("Seeded user:", user);

  const account = await db.account.upsert({
    where: { id: "seed-account" },
    update: {},
    create: {
      id: "seed-account",
      householdId: household.id,
      name: "Checking",
      type: "checking",
    },
  });

  const category = await db.category.upsert({
    where: { id: "seed-category" },
    update: {},
    create: {
      id: "seed-category",
      householdId: household.id,
      name: "Groceries",
      kind: "expense",
    },
  });

  console.log("Seeded account:", account);
  console.log("Seeded category:", category);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
