import type { Metadata } from "next";
import PortalRequestNew from "@/components/requests/PortalRequestNew";

export const metadata: Metadata = {
  title: "Make a Request — Co-VideoPro Client Portal",
};

export default function PortalRequestNewPage() {
  return <PortalRequestNew />;
}
