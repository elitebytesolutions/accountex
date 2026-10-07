/** The single Super Admin. Lives in its own table, separate from tenant users. */
export class PlatformAdmin {
  constructor(
    readonly id: string,
    readonly email: string,
    readonly name: string,
    readonly passwordHash: string,
  ) {}
}
