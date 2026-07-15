import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getConsumerSubscription } from '@/lib/subscription';
import { PremiumGate } from '@/components/premium-gate';

export default async function AICoachLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    if (!session?.user?.id) {
        redirect('/login');
    }

    const { isPremium } = await getConsumerSubscription(session.user.id);

    return (
        <div className="h-full">
            <PremiumGate isPremium={isPremium} featureName="AI Credit Coach">
                {children}
            </PremiumGate>
        </div>
    );
}
