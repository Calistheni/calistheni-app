import type { Metadata } from "next";
import { Geist } from "next/font/google";
import HomePage from "@/components/HomePage";

const geist = Geist({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Parks",
  alternates: { canonical: "/parks" },
};

export default function ParksPage() {
  return (
    <div className={`${geist.className} contents`}>
      <HomePage user={undefined} />
    </div>
  );
}
