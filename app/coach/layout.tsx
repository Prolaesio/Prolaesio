import { CoachLayout } from '@/components/coach/CoachLayout';

export default function CoachRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CoachLayout>{children}</CoachLayout>;
}
