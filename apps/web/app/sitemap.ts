import type { MetadataRoute } from "next";
import { SITE_URL } from "@/content/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/create/", "/why/", "/launch/?id=1", "/launch/?id=0"].map((path) => ({ url: `${SITE_URL}${path}` }));
}
