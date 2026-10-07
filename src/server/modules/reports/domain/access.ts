/** Who may see and change a saved report. PRIVATE: the owner; SHARED: the owner plus shared roles / users; EVERYONE: the whole company. */
export type ReportAccessFacts = {
  ownerUserId: string;
  visibility: string;
  shares: { roleId: string | null; userId: string | null; canEdit: boolean }[];
};

const shareFor = (r: ReportAccessFacts, userId: string, roleIds: string[]) =>
  r.visibility === 'SHARED' ? r.shares.filter((s) => s.userId === userId || (s.roleId !== null && roleIds.includes(s.roleId))) : [];

export function canViewReport(r: ReportAccessFacts, userId: string, roleIds: string[]): boolean {
  return r.ownerUserId === userId || r.visibility === 'EVERYONE' || shareFor(r, userId, roleIds).length > 0;
}

/** The owner, or a share with canEdit. Sharing itself and deleting stay with the owner. */
export function canEditReport(r: ReportAccessFacts, userId: string, roleIds: string[]): boolean {
  return r.ownerUserId === userId || shareFor(r, userId, roleIds).some((s) => s.canEdit);
}
