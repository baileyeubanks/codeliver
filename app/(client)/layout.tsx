import DemoSessionGuard from "@/components/demo/DemoSessionGuard";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return <DemoSessionGuard>{children}</DemoSessionGuard>;
}
