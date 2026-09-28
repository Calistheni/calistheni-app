import { PrimaryTabHost } from "@/components/primary-tabs/PrimaryTabHost";

export default function PrimaryLayout({
  children,
  home,
  nutrition,
  parks,
  community,
  rewards,
  profile,
}: {
  children: React.ReactNode;
  home: React.ReactNode;
  nutrition: React.ReactNode;
  parks: React.ReactNode;
  community: React.ReactNode;
  rewards: React.ReactNode;
  profile: React.ReactNode;
}) {
  return (
    <PrimaryTabHost
      home={home}
      nutrition={nutrition}
      parks={parks}
      community={community}
      rewards={rewards}
      profile={profile}
    >
      {children}
    </PrimaryTabHost>
  );
}
