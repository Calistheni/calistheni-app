import { NextResponse } from "next/server";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

type RewardPayload = {
  title?: unknown;
  partnerName?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  pointsCost?: unknown;
  active?: unknown;
};

type ParsedRewardPayload =
  | {
      data: {
        title: string;
        partnerName: string;
        description: string;
        imageUrl: string | null;
        pointsCost: number;
        active: boolean;
      };
    }
  | {
      error: string;
    };

function parseString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseImageUrl(value: unknown) {
  const imageUrl = parseString(value);

  return imageUrl.length > 0 ? imageUrl : null;
}

function parsePointsCost(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseRewardPayload(body: RewardPayload): ParsedRewardPayload {
  const title = parseString(body.title);
  const partnerName = parseString(body.partnerName);
  const description = parseString(body.description);
  const pointsCost = parsePointsCost(body.pointsCost);

  if (!title) {
    return { error: "Title is required." };
  }

  if (!partnerName) {
    return { error: "Partner is required." };
  }

  if (!description) {
    return { error: "Description is required." };
  }

  if (pointsCost === null) {
    return { error: "Points cost must be a positive whole number." };
  }

  return {
    data: {
      title,
      partnerName,
      description,
      imageUrl: parseImageUrl(body.imageUrl),
      pointsCost,
      active: body.active === undefined ? true : Boolean(body.active),
    },
  };
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return createUnauthorizedResponse();
  }

  try {
    const rewards = await prisma.reward.findMany({
      orderBy: [{ active: "desc" }, { pointsCost: "asc" }, { title: "asc" }],
    });

    return NextResponse.json(rewards);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return createUnauthorizedResponse();
  }

  let body: RewardPayload;

  try {
    body = (await request.json()) as RewardPayload;
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const parsed = parseRewardPayload(body);

  if ("error" in parsed) {
    return createJsonErrorResponse(parsed.error, 400);
  }

  try {
    const reward = await prisma.reward.create({
      data: parsed.data,
    });

    return NextResponse.json(reward, { status: 201 });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
