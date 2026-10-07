/** "My Profile" tabs: the signed-in user's own screens, granted by the Employee role every user holds. Own data only. */
export type ProfileTab = { label: string; href: string; permission?: string };

export const PROFILE_TABS: ProfileTab[] = [
  { label: "My Day", href: "/profile", permission: "myday:view" },
  { label: "Personal Details", href: "/profile/details", permission: "myprof:view" },
  { label: "Attendance", href: "/profile/attendance", permission: "myatt:view" },
  { label: "Leave", href: "/profile/leave", permission: "mylv:view" },
  { label: "Shifts", href: "/profile/shifts", permission: "myshift:view" },
  { label: "Payslips", href: "/profile/payslips", permission: "mypay:view" },
  { label: "Tax", href: "/profile/tax", permission: "mytax:view" },
  { label: "Loans & Advances", href: "/profile/loans", permission: "myloan:view" },
  { label: "Expense Claims", href: "/profile/expenses", permission: "myexp:view" },
  { label: "Letters & Requests", href: "/profile/requests", permission: "myreq:view" },
  { label: "Helpdesk", href: "/profile/helpdesk", permission: "myhelp:view" },
  { label: "Goals & Reviews", href: "/profile/goals", permission: "mygoal:view" },
  { label: "Kudos & Pulse", href: "/profile/kudos", permission: "mykudos:view" },
  { label: "Onboarding & Policies", href: "/profile/onboarding", permission: "myonb:view" },
  { label: "Directory", href: "/profile/directory", permission: "dir:view" },
  { label: "My Team", href: "/profile/team", permission: "myteam:view" },
  { label: "Account & Security", href: "/profile/security" },
];

/** The tabs the user may open; tabs without a permission (Account & Security) are always shown. */
export const tabsFor = (permissions: string[]) => {
  const granted = new Set(permissions);
  return PROFILE_TABS.filter((tab) => !tab.permission || granted.has(tab.permission));
};
