import "../shell.css";
import AppProvider from "@/components/app/AppProvider";
import AppShell from "@/components/app/AppShell";

export const metadata = { robots: { index: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
