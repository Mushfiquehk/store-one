import { DAY_START_HOUR_KEY } from "@shared/schema";

/**
 * A build target, not a console. Feature 30 gives it the brand editor, Feature 31
 * the merchandising screens and Feature 34 the order queue.
 *
 * The import above is doing work: it proves this app can reach packages/domain,
 * which is the only route by which code is allowed to travel between apps.
 */
export default function App() {
  return (
    <main>
      <h1>Store-One console</h1>
      <p>
        Scaffolded by Feature 27 T3. Reads <code>packages/domain</code>; knows the
        settings key <code>{DAY_START_HOUR_KEY}</code>.
      </p>
    </main>
  );
}
