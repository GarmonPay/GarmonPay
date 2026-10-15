import { describeTradingFees, formatFeePercent } from "@/lib/solana/launch-fees";

export function FeeSchedule() {
  const fees = describeTradingFees();
  const rows = [
    ["GarmonPay platform fee", formatFeePercent(fees.largerPlatformFee), "Charged on curve buys and sells."],
    ["Creator fee", formatFeePercent(fees.largerCreatorFee), "Paid to the token creator on curve buys and sells."],
    ["Platform and creator together", "1.50%", "These two shares are set together."],
    ["Raydium protocol fee", formatFeePercent(fees.protocolTradeFeeRate), "A separate protocol charge on the same trades."],
    ["Curve total", formatFeePercent(fees.largerAllInRate), "What a buy or sell pays on the curve."],
    ["GarmonPay launch fee", "Not charged", "Network and account rent still apply when a launch is submitted."],
    ["Withdrawals", "Not open", "No withdrawal is created from this page."],
  ];
  return <section className="gp-sol-panel gp-fee-sheet" aria-labelledby="fee-schedule">
    <h2 id="fee-schedule">Fee schedule</h2>
    <table>
      <caption className="sr-only">GarmonPay trading and launch costs</caption>
      <tbody>
        {rows.map(([label, value, note]) => <tr key={label}>
          <th scope="row">{label}</th>
          <td><strong>{value}</strong><span>{note}</span></td>
        </tr>)}
      </tbody>
    </table>
    <p className="gp-fee-note">These rates apply to a future curve trade and are shown again before you confirm one. This page does not take a payment.</p>
  </section>;
}
