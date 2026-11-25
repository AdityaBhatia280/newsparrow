import account from "./account.mjs";
import admin from "./admin.mjs";
import advisor from "./advisor.mjs";
import catalog from "./catalog.mjs";
import colleges from "./colleges.mjs";
import contrib from "./contrib.mjs";
import onboarding from "./onboarding.mjs";
import profile from "./profile.mjs";
import session from "./session.mjs";
import tracker from "./tracker.mjs";

export default [...session, ...profile, ...onboarding, ...catalog, ...tracker, ...colleges, ...advisor, ...contrib, ...admin, ...account];
