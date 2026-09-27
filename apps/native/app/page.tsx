"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The shell already shows Home while this static-compatible redirect settles. */
export default function NativeRootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/home");
  }, [router]);

  return null;
}
