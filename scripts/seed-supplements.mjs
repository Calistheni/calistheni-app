import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const names = ["Creatine Monohydrate", "Whey Protein", "Plant Protein", "Casein Protein", "Electrolytes", "Magnesium", "Vitamin D", "Omega-3 Fish Oil", "Multivitamin", "Vitamin C", "Zinc", "Calcium", "Iron", "Vitamin B12", "Pre-Workout", "Caffeine", "Beta-Alanine", "Citrulline Malate", "BCAA", "EAA", "Collagen", "Probiotics", "Ashwagandha", "Melatonin", "Glucosamine", "Fiber Supplement"];
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
await Promise.all(names.map((name) => prisma.supplementDefinition.upsert({ where: { slug: slug(name) }, update: { name, isBuiltIn: true }, create: { slug: slug(name), name, isBuiltIn: true } })));
await prisma.$disconnect();
