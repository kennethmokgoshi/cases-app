import { auth } from '@zenowethu/shared-lib';
import { redirect } from 'next/navigation';
import { prisma } from '@zenowethu/database';
import Link from 'next/link';

// Force Node.js runtime to allow shared-lib imports with pino logger
export const runtime = 'nodejs';

export default async function DirectorDashboard() {
  const session = await auth();

  // B2B Redirect Check (Server Side)
  if (session?.user && (session.user as any).userType === 'B2B_PARTNER') {
    redirect('/b2b-dashboard');
  }

  // Fetch Real Stats
  const [
    insuranceSavings,
    insuranceAssessments,
    activePolicies,
    activeRescissions,
    upcomingHearings,
    prescribedDebts,
    redFlags,
    forensicCases,
    fraudPrevented
  ] = await Promise.all([
    // Insurance
    prisma.insuranceAssessment.aggregate({ _sum: { monthlySavings: true } }).then(r => r._sum.monthlySavings?.toNumber() || 0),
    prisma.insuranceAssessment.count({ where: { status: 'DRAFT' } }),
    prisma.insurancePolicy.count({ where: { status: 'ACTIVE' } }),

    // Legal
    prisma.legalMatter.count({ where: { matterType: 'Rescission', status: 'OPEN' } }),
    prisma.legalMatter.count({ where: { judgmentDate: { gte: new Date() } } }), // Proxy for "Upcoming Hearings" if no dedicated field
    prisma.creditAccount.count({ where: { isPrescribed: true } }), // Counting prescribed accounts across cases

    // Forensic
    prisma.recklessLendingAssessment.count({ where: { isReckless: true } }),
    prisma.forensicAudit.count({ where: { status: 'PENDING' } }),
    Promise.resolve(0) // Fraud prevented calculation is complex, keeping 0 for now
  ]);

  const stats = {
    insurance: {
      savings: insuranceSavings,
      assessments: insuranceAssessments,
      active_policies: activePolicies
    },
    legal: {
      rescissions: activeRescissions,
      court_dates: upcomingHearings,
      prescriptions: prescribedDebts
    },
    forensic: {
      red_flags: redFlags,
      investigations: forensicCases,
      fraud_prevented: fraudPrevented
    }
  };

  // Real Activity Stream (Last 5 Workflow Logs)
  const logs = await prisma.workflowLog.findMany({
    take: 5,
    orderBy: { timestamp: 'desc' },
    include: {
      user: true,
      case: {
        include: {
          projects: {
            where: { isPrimary: true },
            include: {
              project: {
                include: {
                  parent: {
                    include: {
                      parent: {
                        include: {
                          parent: {
                            include: {
                              parent: true
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  const getProjectPath = (c: any) => {
    const primaryProject = c.projects?.[0]?.project;

    if (!primaryProject) return `Case ${c.fileNumber}`;

    const pathParts: { name: string; type: string }[] = [];
    let curr = primaryProject;

    while (curr) {
      if (curr.type !== 'ROOT') {
        pathParts.unshift({ name: curr.name, type: curr.type });
      }
      curr = curr.parent;
    }

    const clean = (name: string) => {
      let s = name;
      if (s === 'Letsatsi Referrals') s = 'Letsatsi';
      s = s.replace(/My Cases\s*-?\s*/gi, '').trim();
      return s;
    };

    const year = clean(pathParts.filter(p => p.type === 'YEAR').pop()?.name || '');
    const month = clean(pathParts.filter(p => p.type === 'MONTH').pop()?.name || '');

    // Find sources (skip generic "Cases" if more specific exists)
    const allSources = pathParts.filter(p => p.type === 'ACQUISITION_SOURCE');
    const specificSource = allSources.filter(p => p.name !== 'Cases').pop();
    const source = clean(specificSource?.name || allSources[0]?.name || '');

    // Find all branches/folders
    const branches = pathParts
      .filter(p => (p.type === 'BRANCH' || p.type === 'FOLDER') && p.name !== source)
      .map(p => clean(p.name));
    const branch = branches.join(' ');

    if (year || month || source || branch) {
      // Reorder to: Source Branch Month Year as per request "Letsatsi Finance and Loans Mthata February 2026"
      // Source: Letsatsi Finance and Loans
      // Branch: Mthata
      // Month: February
      // Year: 2026
      return [source, branch, month, year].filter(Boolean).join(' ');
    }

    // Fallback
    return pathParts
      .filter(p => !['ROOT', 'Audit'].includes(p.type) && p.name.toUpperCase() !== 'ZDM FILES')
      .map(p => clean(p.name))
      .filter(Boolean)
      .join(' ');
  };

  const activityStream = logs.map(log => ({
    id: log.id,
    type: 'admin', // Generic type for now, or derive from action
    msg: `${log.user?.firstName || 'System'} - ${log.notes || log.action} for ${getProjectPath(log.case)}`,
    time: log.timestamp.toLocaleString(),
    caseId: log.caseId
  }));

  return (
    <div className="max-w-7xl mx-auto py-8">
      {/* Header */}
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">
            Group Command Center
          </h1>
          <p className="text-gray-400">
            Logged in as <span className="text-zeno-cyan font-bold">{(session?.user as any)?.role || 'Director'}</span>.
            System Status: <span className="text-emerald-400">Operational</span>.
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-3xl font-bold text-white">R {(stats.insurance.savings + stats.forensic.fraud_prevented).toLocaleString('en-US')}</p>
          <p className="text-xs text-gray-500 uppercase tracking-widest">Total Group Value Generated</p>
        </div>
      </div>

      {/* The Trinity Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">

        {/* Insurance Wing */}
        <Link href="http://localhost:3001" className="group bg-blue-950/20 border border-blue-500/20 rounded-2xl p-6 hover:bg-blue-900/20 transition-all cursor-pointer relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="text-8xl">🛡️</span>
          </div>
          <h3 className="text-blue-400 font-bold uppercase tracking-widest text-sm mb-4">Insurance Division</h3>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-3xl font-bold text-white">R {stats.insurance.savings.toLocaleString('en-US')}</p>
              <p className="text-xs text-gray-400">Monthly Client Savings</p>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-xl text-white font-semibold">{stats.insurance.active_policies}</p>
                <p className="text-xs text-gray-500">Active Policies</p>
              </div>
              <span className="text-xs bg-blue-500/20 text-blue-300 py-1 px-2 rounded">
                {stats.insurance.assessments} In Progress
              </span>
            </div>
          </div>
        </Link>

        {/* Legal Wing */}
        <Link href="http://localhost:3002" className="group bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-6 hover:bg-indigo-900/20 transition-all cursor-pointer relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="text-8xl">⚖️</span>
          </div>
          <h3 className="text-indigo-400 font-bold uppercase tracking-widest text-sm mb-4">Legal Division</h3>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-3xl font-bold text-white">{stats.legal.rescissions}</p>
              <p className="text-xs text-gray-400">Active Rescissions</p>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-xl text-white font-semibold">{stats.legal.court_dates}</p>
                <p className="text-xs text-gray-500">Upcoming Hearings</p>
              </div>
              <span className="text-xs bg-indigo-500/20 text-indigo-300 py-1 px-2 rounded">
                {stats.legal.prescriptions} Prescribed Debts
              </span>
            </div>
          </div>
        </Link>

        {/* Forensic Wing */}
        <Link href="http://localhost:3003" className="group bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-6 hover:bg-emerald-900/20 transition-all cursor-pointer relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="text-8xl">🕵️‍♂️</span>
          </div>
          <h3 className="text-emerald-400 font-bold uppercase tracking-widest text-sm mb-4">Forensic Division</h3>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-3xl font-bold text-white text-red-400">{stats.forensic.red_flags}</p>
              <p className="text-xs text-gray-400">Total Red Flags</p>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-xl text-white font-semibold">{stats.forensic.investigations}</p>
                <p className="text-xs text-gray-500">Active Cases</p>
              </div>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 py-1 px-2 rounded">
                R {stats.forensic.fraud_prevented.toLocaleString('en-US')} Saved
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* Unified Activity Stream */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-zeno-cyan animate-pulse"></span>
          Unified Activity Stream
        </h3>
        <div className="space-y-0">
          {activityStream.length > 0 ? activityStream.map((item, i) => (
            <Link href={`/cases/${item.caseId}`} key={item.id} className="group flex gap-4 py-4 border-b border-white/5 last:border-0 hover:bg-white/5 px-4 rounded-lg transition-colors block">
              <div className={`w-2 h-full rounded-full ${item.type === 'insurance' ? 'bg-blue-500' :
                item.type === 'legal' ? 'bg-indigo-500' :
                  item.type === 'forensic' ? 'bg-emerald-500' : 'bg-gray-500'
                }`}></div>
              <div className="flex-1">
                <p className="text-gray-200 font-medium group-hover:text-zeno-cyan transition-colors">{item.msg}</p>
                <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">
                  {item.time}
                </p>
              </div>
            </Link>
          )) : (
            <p className="text-gray-500 py-4">No recent activity detected.</p>
          )}
        </div>
      </div>

    </div>
  );
}
