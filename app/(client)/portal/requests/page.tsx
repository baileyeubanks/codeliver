import type { Metadata } from "next";
import PortalRequestsHome from "@/components/requests/PortalRequestsHome";

export const metadata: Metadata = {
  title: "Your Requests — Co-VideoPro Client Portal",
};

export default function PortalRequestsPage() {
  return <PortalRequestsHome />;
}
