import Shell from "@/components/Shell";
import DemoSessionGuard from "@/components/demo/DemoSessionGuard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoSessionGuard>
      <Shell>{children}</Shell>
    </DemoSessionGuard>
  );
}
