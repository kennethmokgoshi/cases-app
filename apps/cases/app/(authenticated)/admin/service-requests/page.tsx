import { Metadata } from 'next';
import { prisma } from '@zenowethu/database';

export const dynamic = 'force-dynamic';
import ConvertServiceRequestButton from './convert-button';

export const metadata: Metadata = {
    title: 'Credo Service Requests',
    description: 'Manage and convert consumer service requests from Credo',
};

export default async function ServiceRequestsPage() {
    const requests = await prisma.serviceRequest.findMany({
        where: { status: 'PENDING' },
        include: {
            consumer: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Credo Service Requests</h1>
                <p className="text-slate-500">View and convert pending requests from the consumer portal into Cases.</p>
            </div>

            {requests.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 py-12 text-center text-slate-500">
                    No pending service requests.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {requests.map((req) => (
                        <div key={req.id} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-6 pb-2">
                                <div className="flex justify-between items-start">
                                    <h2 className="text-lg font-semibold text-slate-900">
                                        {req.consumer.firstName} {req.consumer.lastName}
                                    </h2>
                                     <span className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-amber-600/20 bg-amber-50 text-amber-700 border border-amber-200">
                                         Pending
                                     </span>
                                </div>
                                <p className="text-sm text-slate-500">{req.consumer.email}</p>
                            </div>
                            <div className="p-6 pt-0 space-y-4">
                                <div className="text-sm">
                                    <span className="font-semibold text-slate-700">Services Requested:</span>
                                    <p className="mt-1 text-slate-600 bg-slate-50 p-2 rounded border">{req.services}</p>
                                </div>
                                <div className="flex justify-between text-sm text-slate-500">
                                    <span>Date: {req.createdAt.toLocaleDateString()}</span>
                                    <span>Total: R {req.total.toNumber().toFixed(2)}</span>
                                </div>
                                
                                <div className="pt-2 border-t">
                                    <ConvertServiceRequestButton 
                                        requestId={req.id} 
                                        consumerId={req.consumerId} 
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
