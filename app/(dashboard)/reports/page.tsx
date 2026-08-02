import type { Metadata } from "next";
import ReportsClient from "@/components/reporting/ReportsClient";

export const metadata: Metadata = {
  title: "Reports — Co-VideoPro",
};

export default function ReportsPage() {
  return <ReportsClient />;
}
