import type { Metadata } from "next";
import RequestQueue from "@/components/requests/RequestQueue";

export const metadata: Metadata = {
  title: "Request Center — Co-ProVideo",
};

export default function RequestsPage() {
  return <RequestQueue />;
}
