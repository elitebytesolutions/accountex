/**
 * The signed-in company's time zone (Platform.Tenants.timezone), set once by the workspace shell from the session.
 * Clock times (punches, submitted at, …) are shown in the company's zone, never the browser's.
 */
let zone = "Asia/Karachi";

export function setCompanyTimeZone(timeZone: string | null | undefined) {
  if (timeZone) zone = timeZone;
}

export const companyTimeZone = () => zone;

/** Day, month index, hour and minute of an instant in the company's time zone. */
export function companyParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, day: "2-digit", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: get("day"), monthIndex: Number(get("month")) - 1, hour: get("hour").replace(/^24$/, "00"), minute: get("minute") };
}
