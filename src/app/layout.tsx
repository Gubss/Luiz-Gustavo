import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AutoCollect } from "@/components/CollectControls";
import { JobsWatcher } from "@/components/JobsWatcher";
import { getSettings } from "@/lib/settings";
import { quotaUsedToday } from "@/lib/quota";

export const metadata: Metadata = {
  title: "YouTube Radar",
  description: "Radar de outliers e estudo de nicho no YouTube",
};

// Todas as rotas leem o banco local a cada requisição.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [settings, used] = await Promise.all([getSettings(), quotaUsedToday()]);
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col md:flex-row">
        <Sidebar quotaUsed={used} quotaLimit={settings.dailyQuota} />
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
        <AutoCollect />
        <JobsWatcher />
      </body>
    </html>
  );
}
