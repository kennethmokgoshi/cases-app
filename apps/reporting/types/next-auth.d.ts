import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    email: string
    firstName?: string
    lastName?: string
    role?: string
    isAdmin?: boolean
    userType?: string
    reportingRole?: string
  }

  interface Session {
    user: User & {
      id: string
      firstName?: string
      lastName?: string
      role?: string
      isAdmin?: boolean
      userType?: string
      reportingRole?: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    firstName?: string
    lastName?: string
    role?: string
    isAdmin?: boolean
    userType?: string
    reportingRole?: string
  }
}
