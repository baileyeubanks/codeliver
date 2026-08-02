import type { Metadata } from "next";
import InquiryForm from "./InquiryForm";

export const metadata: Metadata = {
  title: "Start a production inquiry | Co-VideoPro",
  description: "Share your goals, audience, timeline, and requested video deliverables with Content Co-op.",
};

export default async function InquiryPage({
  params,
}: {
  params: Promise<{ formKey: string }>;
}) {
  const { formKey } = await params;
  return <InquiryForm formKey={formKey} />;
}
