import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  // The product is authenticated; keeping this endpoint explicit and empty
  // avoids advertising login or dashboard routes to search crawlers.
  return [];
}
