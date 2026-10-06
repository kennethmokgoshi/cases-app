// Keep in step with apps/cases/types/next-auth.d.ts — the shared auth config in
// packages/shared-lib reads these fields from @auth/core, so augmenting only
// 'next-auth' is not enough (build fails on next-auth >= 5.0.0-beta.32).
import { DefaultSession } from "next-auth"
import { AdapterUser as DefaultAdapterUser } from "@auth/core/adapters"

declare module "@auth/core/types" {
  interface User {
      role: string;
      isAdmin: boolean;
      isExecutive: boolean;
      isSeniorManager: boolean;
      isManager: boolean;
      userType: string;
      b2bPartnerId: string | null;
      firstName: string | null;
      lastName: string | null;
      organization: string | null;
      avatarUrl: string | null;
      reportingRole?: string | null;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      isAdmin: boolean;
      isExecutive: boolean;
      isSeniorManager: boolean;
      isManager: boolean;
      userType: string;
      b2bPartnerId: string | null;
      firstName: string | null;
      lastName: string | null;
      organization: string | null;
      avatarUrl: string | null;
      reportingRole?: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    }
  }
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      isAdmin: boolean;
      isExecutive: boolean;
      isSeniorManager: boolean;
      isManager: boolean;
      userType: string;
      b2bPartnerId: string | null;
      firstName: string | null;
      lastName: string | null;
      organization: string | null;
      avatarUrl: string | null;
      reportingRole?: string | null;
    } & DefaultSession["user"]
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser extends DefaultAdapterUser {
      role: string;
      isAdmin: boolean;
      isExecutive: boolean;
      isSeniorManager: boolean;
      isManager: boolean;
      userType: string;
      b2bPartnerId: string | null;
      firstName: string | null;
      lastName: string | null;
      organization: string | null;
      avatarUrl: string | null;
      reportingRole?: string | null;
  }
}
