/**
 * The third-party services the product names, and whether each one exists.
 *
 * Every entry is `planned` today: none has an implementation, no credential is stored,
 * and no provider is contacted. A card that says so is honest; a working toggle that
 * persists nothing is how `hasPaymentIntegration` came to gate real money.
 *
 * When one becomes `available`, its connected-state lives in store settings under
 * `integrations.<id>` — and any credential it grows goes in `SECRET_SETTING_FIELDS`
 * (`shared/schema.ts`), never in `localStorage` and never in a new table for a list
 * that is currently six rows long.
 */
export type IntegrationCategory = "payment" | "inventory";

export type Integration = {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  status: "available" | "planned";
};

export const INTEGRATIONS: Integration[] = [
  { id: "pay_stripe", name: "Stripe Terminal", description: "Accept card payments securely.", category: "payment", status: "planned" },
  { id: "pay_square", name: "Square Reader", description: "Integration for Square hardware.", category: "payment", status: "planned" },
  { id: "pay_toast", name: "Toast Connect", description: "Link existing Toast terminals.", category: "payment", status: "planned" },
  { id: "inv_sysco", name: "Sysco Connect", description: "Auto-order produce and proteins.", category: "inventory", status: "planned" },
  { id: "inv_usfoods", name: "US Foods", description: "Sync dry goods and bakery stock.", category: "inventory", status: "planned" },
  { id: "inv_local", name: "Local Farms API", description: "Direct connection to local suppliers.", category: "inventory", status: "planned" },
];

export const integrationsByCategory = (category: IntegrationCategory): Integration[] =>
  INTEGRATIONS.filter(i => i.category === category);
