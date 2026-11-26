// Display names shared across views, so a new rule only needs naming once.

export const RULE_NAMES: Record<string, string> = {
  fraud_escalation: "Fraud escalation",
  low_confidence: "Manual review",
  vulnerable_customer: "Vulnerable customer",
  formal_complaint: "Formal complaint",
  account_takeover: "Account takeover",
};

export const ruleName = (rule: string) => RULE_NAMES[rule] ?? rule.replace(/_/g, " ");
