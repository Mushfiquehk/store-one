import { taxCentsFor } from "@shared/schema";

/**
 * A build target, not a storefront. Feature 29 gives it the design system,
 * Feature 33 the catalogue and Feature 34 the checkout.
 *
 * The import above is the point of the scaffold: tax is arithmetic that already
 * has one home, and a storefront that grows its own copy is a storefront that
 * charges a different number than the till.
 */
export default function App() {
  return (
    <main>
      <h1>Store-One storefront</h1>
      <p>
        Scaffolded by Feature 27 T3. Prices come from the core, never from here —
        it cannot even add tax to $10.00 without <code>packages/domain</code>:{" "}
        {taxCentsFor(1000, 8.25)}&cent;.
      </p>
    </main>
  );
}
