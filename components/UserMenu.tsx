import Link from "next/link";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export async function UserMenu() {
  const session = await auth();

  async function logout() {
    "use server";

    await signOut({
      redirectTo: "/",
    });
  }

  return (
    <div className="fixed right-3 top-3 z-20 sm:right-4 sm:top-4">
      {session?.user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              {session.user.name ?? session.user.email ?? "Profile"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/profile">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/my-parks">My Parks</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/submit-park">Submit Park</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={logout}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full">
                  Logout
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button asChild variant="secondary">
          <Link href="/login">Login</Link>
        </Button>
      )}
    </div>
  );
}
