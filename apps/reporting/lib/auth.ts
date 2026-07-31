import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@zenowethu/database'
import { detectUserRole } from './role-detector'
import { type UserRole } from './roles'
import { isStaffUser } from './staff-guard'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            console.error('[Auth] Missing credentials')
            return null
          }

          console.log('[Auth] Looking up user:', credentials.email)
          const user = await prisma.user.findFirst({
            where: {
              OR: [
                { email: (credentials.email as string).toLowerCase() },
                { username: (credentials.email as string).toLowerCase() },
              ],
            },
          })

          if (!user) {
            console.error('[Auth] User not found:', credentials.email)
            return null
          }

          console.log('[Auth] Found user, checking password')
          const passwordMatch = await bcrypt.compare(
            credentials.password as string,
            user.password
          )

          if (!passwordMatch) {
            console.error('[Auth] Password mismatch for user:', user.id)
            return null
          }

          if (!isStaffUser(user)) {
            console.error('[Auth] Non-staff user attempted login:', user.email, 'userType:', user.userType)
            throw new Error('NotAuthorized: Access restricted to @zenowethu staff members only.')
          }

          let reportingRole = 'staff'
          try {
            reportingRole = await detectUserRole(user.id)
          } catch (roleError) {
            console.error('[Auth] Role detection error:', roleError)
            reportingRole = 'staff'
          }

          console.log('[Auth] Login successful for user:', user.id, 'role:', reportingRole)
          return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role || 'MEMBER',
            isAdmin: user.isAdmin || false,
            userType: user.userType,
            reportingRole,
          }
        } catch (error) {
          console.error('[Auth] Authorization error:', error)
          return null
        }
      },
    }),
  ],
  pages: {
    signIn: '/',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.firstName = user.firstName
        token.lastName = user.lastName
        token.role = user.role
        token.isAdmin = user.isAdmin
        token.userType = user.userType
        token.reportingRole = (user as any).reportingRole || 'staff'
        return token
      }

      // Re-resolve the role on every request so stale/older tokens (issued
      // before role-based routing existed, or before a role change) always
      // reflect the user's current DB role instead of silently sticking to
      // whatever was cached at original sign-in.
      if (token.id) {
        try {
          const currentRole: UserRole = await detectUserRole(token.id as string)
          token.reportingRole = currentRole
        } catch (roleError) {
          console.error('[Auth] Role re-detection error:', roleError)
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.firstName = token.firstName as string
        session.user.lastName = token.lastName as string
        session.user.role = token.role as string
        session.user.isAdmin = token.isAdmin as boolean
        session.user.userType = token.userType as string
        ;(session.user as any).reportingRole = token.reportingRole as string
      }
      return session
    },
  },
})
