import { GuardianLayout } from '@/components/guardian/GuardianLayout';

export default function GuardianRootLayout({ children }: { children: React.ReactNode }) {
  return <GuardianLayout>{children}</GuardianLayout>;
}
