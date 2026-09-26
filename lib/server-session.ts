import "server-only";

import { cache } from "react";
import { auth } from "@/auth";

/** Deduplicate database-backed Auth.js session resolution in one render pass. */
export const getServerSession = cache(() => auth());
