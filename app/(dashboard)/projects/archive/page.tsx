import type { Metadata } from "next";
import DemoAssetCollection from "@/components/demo/DemoAssetCollection";

export const metadata: Metadata = {
  title: "Archive — Co-VideoPro",
};

export default function ArchivePage() {
  return <DemoAssetCollection mode="archive" />;
}
