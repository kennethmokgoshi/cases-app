import { redirect } from 'next/navigation';

export default function DashboardPage() {
    // Redirect /dashboard to root / which is the actual dashboard
    redirect('/');
}
