import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthShowcase } from "@/components/auth/auth-showcase";

// Shared metadata for auth pages (login / signup / forgot-password).
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Background ambient lighting / glow mesh */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-[25%] -left-[10%] h-[600px] w-[600px] rounded-full bg-primary/10 blur-[130px] dark:bg-primary/20" />
        <div className="absolute top-[40%] -right-[15%] h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[140px] dark:bg-emerald-500/15" />
        <div className="absolute -bottom-[20%] left-[20%] h-[550px] w-[550px] rounded-full bg-purple-500/10 blur-[140px] dark:bg-purple-600/15" />
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20" />
      </div>

      <div className="flex min-h-screen w-full lg:grid lg:grid-cols-12">
        {/* Left Brand Showcase Hero (visible on desktop) */}
        <div className="hidden lg:col-span-6 lg:flex xl:col-span-7">
          <AuthShowcase />
        </div>

        {/* Right Form Card Area */}
        <div className="flex flex-1 items-center justify-center p-4 sm:p-8 lg:col-span-6 xl:col-span-5">
          <div className="w-full max-w-md">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
