import { DefaultSession, DefaultUser } from "next-auth"
import { AdapterUser as DefaultAdapterUser } from "@auth/core/adapters"

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      isAdmin: boolean;
      isManager: boolean;
      userType: string;
      b2bPartnerId: string | null;
      firstName: string | null;
      lastName: string | null;
      organization: string | null;
      avatarUrl: string | null;
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
      role: string;
      isAdmin: boolean;
      isManager: boolean;
      userType: string;
      b2bPartnerId: string | null;
      firstName: string | null;
      lastName: string | null;
      organization: string | null;
      avatarUrl: string | null;
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser extends DefaultAdapterUser {
      role: string;
      isAdmin: boolean;
      isManager: boolean;
      userType: string;
      b2bPartnerId: string | null;
      firstName: string | null;
      lastName: string | null;
      organization: string | null;
      avatarUrl: string | null;
  }
}
