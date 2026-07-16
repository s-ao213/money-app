import CoupleMoneyApp from "@/features/money/CoupleMoneyApp";

export default async function LoanEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CoupleMoneyApp view="loanEdit" loanId={id} />;
}
