import { env } from "../config/env.js";

/**
 * A single relying party covers both audiences — the staff console and the customer portal are
 * the same SPA origin (see router.tsx), just different route trees, so there's no need for
 * separate RP config per audience. The ceremony itself always happens in the browser at
 * WEB_APP_URL's origin, never the API's own origin, regardless of which audience is signing in.
 */
export const webauthnOrigin = env.WEB_APP_URL;
export const webauthnRpID = new URL(env.WEB_APP_URL).hostname;
