import { GuardianPlayerDetailPage } from '@/components/guardian/pages/GuardianPlayerDetailPage';
export default function Page({ params }: { params: { playerId: string } }) { return <GuardianPlayerDetailPage playerId={params.playerId} />; }
