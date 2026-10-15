import { MemberShell } from "@/components/member/MemberShell";

export const metadata = { title: "Member workspace · GarmonPay" };

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <MemberShell>{children}</MemberShell>;
}
