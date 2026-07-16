import CoupleMoneyApp from "@/features/money/CoupleMoneyApp";

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CoupleMoneyApp view="subscriptionDetail" subscriptionId={id} />;
}
