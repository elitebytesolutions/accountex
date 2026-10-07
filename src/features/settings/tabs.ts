/** Settings screen tabs (`/settings?tab=`), in template order. Shared by the server page and the client screen. */
export const SETTINGS_TABS = ["profile", "branches", "finance", "sales", "hr", "tax", "numbering", "branding"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
