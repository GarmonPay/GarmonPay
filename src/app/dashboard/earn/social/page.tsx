import { redirect } from "next/navigation";

/** Social tasks retired — watch-only earn. */
export default function EarnSocialDeprecatedPage() {
  redirect("/dashboard/earn?notice=social-retired");
}
