/**
 * Prints everything to paste into Vaani: greeting, agent instructions, data points and the webhook URL.
 * Kept out of the web UI on purpose so the prompt isn't visible to anyone with the dashboard link.
 *   DATABASE_URL=... APP_URL=https://<app> npm run vaani:setup
 */
import { VAANI_DATA_POINTS, VAANI_GREETING, buildVaaniPrompt, getVaaniSecret } from "../lib/vaani";

(async () => {
  console.log("── Greeting ──\n" + VAANI_GREETING + "\n");
  console.log("── Agent instructions ──\n" + buildVaaniPrompt() + "\n");
  console.log("── Data points ──\n" + JSON.stringify(VAANI_DATA_POINTS, null, 2) + "\n");
  if (process.env.DATABASE_URL || process.env.VAANI_WEBHOOK_SECRET) {
    const app = process.env.APP_URL ?? "https://<your-app>";
    console.log("── Webhook URL ──\n" + `${app}/api/vaani/webhook/${await getVaaniSecret()}`);
  } else console.log("Set DATABASE_URL (or VAANI_WEBHOOK_SECRET) to print the webhook URL.");
  process.exit(0);
})();
