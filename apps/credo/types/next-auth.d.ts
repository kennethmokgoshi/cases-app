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
      mustChangePassword?: boolean;
  }
}

declare module "next-auth" {
  interface User {
    mustChangePassword?: boolean;
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
      mustChangePassword: boolean;
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
      mustChangePassword?: boolean;
  }
}
