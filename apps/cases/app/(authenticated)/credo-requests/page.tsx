"use client";
import { toast, confirm } from '@zenowethu/ui';


import { useState, useEffect } from "react";

type ServiceRequest = {
  id: string;
  consumer: {
    firstName: string;
    lastName: string;
    email: string;
    idNumber: string;
    phone: string;
    linkedClientId: string | null;
  };
  services: string;
  total: number;
  status: string;
  createdAt: string;
};

export default function CredoRequestsPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/credo/requests");
      const data = await res.json();
      setRequests(data);
    } catch (err) {
      console.error("Failed to fetch requests", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async (id: string) => {
    if (!await confirm("Are you sure you want to convert this request into a Case?")) return;
    
    setConverting(id);
    try {
      const res = await fetch(`/api/credo/requests/${id}/convert`, { method: "POST" });
      const data = await res.json();
      
      if (res.ok) {
        toast.success(`Successfully converted! File Number: ${data.fileNumber}`);
        fetchRequests(); // Refresh list
      } else {
        toast.error(data.error || "Conversion failed");
      }
    } catch (err) {
      toast.error("Error during conversion");
    } finally {
      setConverting(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header section with responsive layout */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Crediva Portal Requests</h1>
          <p className="text-gray-400 mt-1">Review and convert inbound service requests from the consumer portal.</p>
        </div>
        <div className="flex items-center gap-3">
           <button 
             onClick={fetchRequests} 
             disabled={loading}
             className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-lg hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
           >
             <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
             </svg>
             Refresh
           </button>
        </div>
      </div>

      {/* Requests table container */}
      <div className="bg-zeno-blue/20 border border-white/5 rounded-xl overflow-hidden shadow-2xl backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/5">
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Consumer</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Services</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Submitted</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-10 h-10 border-2 border-zeno-cyan border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-gray-400 font-medium">Loading requests...</span>
                    </div>
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-gray-500">
                      <svg className="w-16 h-16 opacity-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-xl font-medium text-gray-400">No pending requests found</p>
                      <p className="text-sm">New requests from the portal will appear here automatically.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="font-semibold text-white group-hover:text-zeno-cyan transition-colors">
                        {req.consumer.firstName} {req.consumer.lastName}
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-1">{req.consumer.idNumber}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-1.5">
                        {JSON.parse(req.services).map((s: string) => (
                          <span key={s} className="px-2 py-0.5 text-[10px] font-medium rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shadow-sm">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-white font-semibold">R {Number(req.total).toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm text-gray-400">
                        {new Date(req.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-sm ${
                        req.consumer.linkedClientId 
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${req.consumer.linkedClientId ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>
                        {req.consumer.linkedClientId ? "Existing Client" : "New Lead"}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button 
                        onClick={() => handleConvert(req.id)}
                        disabled={converting === req.id || !!req.consumer.linkedClientId}
                        className={`inline-flex items-center gap-2 px-4 py-2 ${
                            req.consumer.linkedClientId 
                            ? 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/5' 
                            : 'bg-zeno-cyan text-black font-bold hover:bg-white active:scale-95 shadow-lg shadow-zeno-cyan/20'
                        } text-sm rounded-lg transition-all disabled:opacity-50`}
                      >
                        {converting === req.id ? (
                          <>
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                            Creating...
                          </>
                        ) : req.consumer.linkedClientId ? (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Converted
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Convert to Case
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

