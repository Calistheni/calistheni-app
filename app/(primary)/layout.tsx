import { PrimaryTabSlots } from "@/components/primary-tabs/PrimaryTabSlots";

export default function PrimaryLayout({
  children,
  home,
  nutrition,
  parks,
  community,
  rewards,
}: {
  children: React.ReactNode;
  home: React.ReactNode;
  nutrition: React.ReactNode;
  parks: React.ReactNode;
  community: React.ReactNode;
  rewards: React.ReactNode;
}) {
  return (
    <PrimaryTabSlots
      home={home}
      nutrition={nutrition}
      parks={parks}
      community={community}
      rewards={rewards}
    >
      {children}
    </PrimaryTabSlots>
  );
}
