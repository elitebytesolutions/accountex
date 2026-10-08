export class User {
  constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly tenantName: string,
    readonly email: string,
    readonly name: string,
    /** System role keys (SystemKey lookup codes); custom roles appear by id. A user can have several. */
    readonly roles: string[],
    /** Permission codes ("mylv:view") granted by all of the user's roles combined. */
    readonly permissions: string[],
    /** Only own-account screens until a new password is set. */
    readonly mustChangePassword: boolean,
    /** Idle minutes before the session ends (Users.sessionTimeoutMin). */
    readonly sessionTimeoutMin: number,
    /** The company's IANA time zone (Platform.Tenants.timezone), for showing clock times. */
    readonly timeZone: string = 'Asia/Karachi',
  ) {}
}
