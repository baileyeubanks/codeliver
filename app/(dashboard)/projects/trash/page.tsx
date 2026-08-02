import type { Metadata } from "next";
import DemoAssetCollection from "@/components/demo/DemoAssetCollection";

export const metadata: Metadata = {
  title: "Trash — Co-VideoPro",
};

export default function TrashPage() {
  return <DemoAssetCollection mode="trash" />;
}
