import "dotenv/config";

import pg from "pg";

const { Client } = pg;

const rewards = [
  {
    title: "10% OFF Partner",
    partnerName: "Demo Partner",
    description: "Demo reward placeholder. Voucher redemption is not live yet.",
    imageUrl: null,
    pointsCost: 500,
    active: true,
  },
  {
    title: "Free Protein Bar",
    partnerName: "Demo Nutrition",
    description: "Demo reward placeholder. Voucher redemption is not live yet.",
    imageUrl: null,
    pointsCost: 350,
    active: true,
  },
  {
    title: "20% OFF Clothing",
    partnerName: "Demo Apparel",
    description: "Demo reward placeholder. Voucher redemption is not live yet.",
    imageUrl: null,
    pointsCost: 800,
    active: true,
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed rewards.");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    for (const reward of rewards) {
      await client.query(
        `
          INSERT INTO "Reward" (
            "title",
            "partnerName",
            "description",
            "imageUrl",
            "pointsCost",
            "active",
            "updatedAt"
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT ("title", "partnerName") DO UPDATE SET
            "description" = EXCLUDED."description",
            "imageUrl" = EXCLUDED."imageUrl",
            "pointsCost" = EXCLUDED."pointsCost",
            "active" = EXCLUDED."active",
            "updatedAt" = NOW()
        `,
        [
          reward.title,
          reward.partnerName,
          reward.description,
          reward.imageUrl,
          reward.pointsCost,
          reward.active,
        ]
      );
    }

    await client.query("COMMIT");
    console.log(`Seeded ${rewards.length} demo rewards.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
