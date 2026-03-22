import { redirect } from "next/navigation";

/** Old path — send everyone to /advertise */
export default function AdvertisingAliasPage() {
  redirect("/advertise");
}
