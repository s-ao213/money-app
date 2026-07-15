import CoupleMoneyApp from "@/features/money/CoupleMoneyApp";

export default async function PersonalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CoupleMoneyApp view="personalDetail" entryId={id} />;
}
