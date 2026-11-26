/**
 * BizKhata AI — provider-independent AI module.
 *
 * The BizKhata AI Assistant is built in: it understands Hinglish,
 * English and Hindi, parses transactions, answers from the real ledgers
 * and computes business insights — all on the device, with no
 * third-party AI provider, no key, and no data leaving the device.
 * No provider name, key or integration detail is ever shown to the user.
 *
 * getAIInsights() computes short, practical insights deterministically
 * from the real figures (top service, biggest due, agent payable,
 * MT commission, expense trend). It never invents numbers.
 */
import { formatINR } from './money';

export interface InsightInput {
  incomePaise: number;
  expensePaise: number;
  profitPaise: number;
  customerDuePaise: number;
  agentPayablePaise: number;
  mtCommissionPaise: number;
  topServices: { service: string; receivedPaise: number }[];
  biggestDueName?: string;
  monthIncomePaise?: number;
  prevMonthIncomePaise?: number;
}

/** Short business insights from real figures — no network, no key. */
export function getAIInsights(input: InsightInput): string[] {
  const tips: string[] = [];
  if (input.topServices.length > 0) {
    const top = input.topServices[0];
    tips.push(`Sabse zyada earning ${top.service} se hai — ${formatINR(top.receivedPaise)}. Is service par focus rakho.`);
  }
  if (input.customerDuePaise > 0) {
    tips.push(`Customer due ${formatINR(input.customerDuePaise)} hai${input.biggestDueName ? ` — sabse zyada ${input.biggestDueName} se` : ''}. Due wale customers ko WhatsApp reminder bhejo.`);
  }
  if (input.agentPayablePaise > 0) {
    tips.push(`Agents ko ${formatINR(input.agentPayablePaise)} dena baaki hai — time par payment karo, kaam rukega nahi.`);
  }
  if (input.mtCommissionPaise > 0) {
    tips.push(`Money Transfer commission se ${formatINR(input.mtCommissionPaise)} kamaye — principal income nahi hai, sirf commission profit hai.`);
  }
  if (input.expensePaise > input.incomePaise && input.incomePaise > 0) {
    tips.push(`Kharcha (${formatINR(input.expensePaise)}) income (${formatINR(input.incomePaise)}) se zyada hai — kharche check karo.`);
  }
  if (input.monthIncomePaise !== undefined && input.prevMonthIncomePaise !== undefined && input.prevMonthIncomePaise > 0) {
    const diff = input.monthIncomePaise - input.prevMonthIncomePaise;
    const pct = Math.round((diff / input.prevMonthIncomePaise) * 100);
    tips.push(`Is mahine ki income pichhle mahine se ${diff >= 0 ? `${pct}% zyada` : `${Math.abs(pct)}% kam`} hai.`);
  }
  if (tips.length === 0) {
    tips.push('Abhi koi record nahi hai. Pehle ek job, payment ya kharcha add karo — phir yahan insights dikhenge.');
  }
  return tips.slice(0, 4);
}
