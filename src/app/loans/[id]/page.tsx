import CoupleMoneyApp from "@/features/money/CoupleMoneyApp";

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CoupleMoneyApp view="loanDetail" loanId={id} />;
}
