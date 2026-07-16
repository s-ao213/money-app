import CoupleMoneyApp from "@/features/money/CoupleMoneyApp";

export default async function SubscriptionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CoupleMoneyApp view="subscriptionEdit" subscriptionId={id} />;
}
