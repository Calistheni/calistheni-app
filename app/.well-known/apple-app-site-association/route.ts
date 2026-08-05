import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: ["89RH6XL9R6.com.petershikrenov.calistheni"],
            components: [{ "/": "/auth/mobile/*" }],
          },
        ],
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        // Short revalidation prevents an old association document becoming permanent.
        "Cache-Control": "public, max-age=300, must-revalidate",
      },
    }
  );
}
