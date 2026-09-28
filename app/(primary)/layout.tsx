import { PrimaryTabHost } from "@/components/primary-tabs/PrimaryTabHost";
import { PrimaryTabStandby } from "@/components/primary-tabs/PrimaryTabStandby";

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
    <PrimaryTabHost
      home={home}
      nutrition={nutrition}
      parks={parks}
      community={community}
      rewards={rewards}
      profile={<PrimaryTabStandby tab="profile" />}
    >
      {children}
    </PrimaryTabHost>
  );
}
