"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
export function ClickableWorkoutCard({ href, label, children }: { href: string; label: string; children: ReactNode }) {
 const router=useRouter(); const open=(target: EventTarget | null)=>{const el=target instanceof Element?target:null; if(el?.closest("a,button,input,textarea,select,[role=button]")) return; if(window.getSelection()?.toString()) return; router.push(href);};
 return <article role="link" tabIndex={0} aria-label={label} onClick={(e)=>open(e.target)} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open(e.target)}}} className="cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</article>;
}
