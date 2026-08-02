import type { Metadata } from "next";
import PortalHome from "@/components/portal/PortalHome";

export const metadata: Metadata = {
  title: "Client Portal — Co-VideoPro",
};

export default function PortalPage() {
  return <PortalHome />;
}
