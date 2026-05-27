import { auth } from '@zenowethu/shared-lib';
import { redirect } from 'next/navigation';
import { prisma } from '@zenowethu/database';

export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { DashboardCasesTable } from '@/components/DashboardCasesTable';

// Force Node.js runtime to allow shared-lib imports with pino logger
export const runtime = 'nodejs';

export default async function DirectorDashboard() {
  const session = await auth();

  // B2B Redirect Check (Server Side)
  if (session?.user && session.user.userType === 'B2B_PARTNER') {
    redirect('/b2b-dashboard');
  }

  // Fetch Real Stats — gracefully degrade if DB is unreachable
  let stats = {
    insurance: { savings: 0, assessments: 0, active_policies: 0 },
    legal: { rescissions: 0, court_dates: 0, prescriptions: 0 },
    forensic: { red_flags: 0, investigations: 0, fraud_prevented: 0 },
    cases: { my_cases: 0, new_leads: 0, overdue: 0 }
  };

  try {
    const [
      insuranceSavings,
      insuranceAssessments,
      activePolicies,
      activeRescissions,
      upcomingHearings,
      prescribedDebts,
      redFlags,
      forensicCases,
    ] = await Promise.all([
      prisma.insuranceAssessment.aggregate({ _sum: { monthlySavings: true } }).then(r => r._sum.monthlySavings?.toNumber() || 0),
      prisma.insuranceAssessment.count({ where: { status: 'DRAFT' } }),
      prisma.insurancePolicy.count({ where: { status: 'ACTIVE' } }),
      prisma.legalMatter.count({ where: { matterType: 'Rescission', status: 'OPEN' } }),
      prisma.legalMatter.count({ where: { judgmentDate: { gte: new Date() } } }),
      prisma.creditAccount.count({ where: { isPrescribed: true } }),
      prisma.recklessLendingAssessment.count({ where: { isReckless: true } }),
      prisma.forensicAudit.count({ where: { status: 'PENDING' } }),
    ]);

    // Fetch Case Dashboard Stats with permissions
    const userRole = session.user.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN' || (session as any).user.isAdmin === true;
    const isStaff = session.user.userType?.toUpperCase() === 'STAFF';
    const isRestricted = !isAdmin && !isStaff;

    const caseWhere: any = {};
    if (isRestricted) {
      const memberships = await prisma.projectMember.findMany({
        where: { userId: session.user.id },
        select: { projectId: true }
      });
      const rootIds = memberships.map(m => m.projectId);
      
      // Expand to descendants (O(n) logic like in API)
      const allProjects = await prisma.project.findMany({ select: { id: true, parentId: true } });
      const descendants = new Set<string>(rootIds);
      const queue = [...rootIds];
      while (queue.length > 0) {
        const curr = queue.shift();
        const children = allProjects.filter(p => p.parentId === curr).map(p => p.id);
        children.forEach(cid => {
          if (!descendants.has(cid)) {
            descendants.add(cid);
            queue.push(cid);
          }
        });
      }
      caseWhere.projects = { some: { projectId: { in: Array.from(descendants) } } };
    }

    // Wrap counts in try-catch to handle schema inconsistencies (e.g., assignments relation)
    const getCount = async (where: any) => {
        try {
            return await prisma.case.count({ where });
        } catch (e) {
            console.error('[DASHBOARD] Count failed for where:', JSON.stringify(where), e);
            // Fallback: If it was the assignments relation that failed, try without it
            if (where.OR && where.OR.some((clause: any) => clause.assignments)) {
                const fallbackWhere = { ...where };
                fallbackWhere.OR = where.OR.filter((clause: any) => !clause.assignments);
                try {
                    return await prisma.case.count({ where: fallbackWhere });
                } catch (innerE) {
                    return 0;
                }
            }
            return 0;
        }
    };

    const [myCasesCount, newLeadsCount, overdueCount] = await Promise.all([
      getCount({
        ...caseWhere,
        OR: [
          { createdById: session.user.id },
          { assignments: { some: { userId: session.user.id } } }
        ]
      }),
      getCount({
        ...caseWhere,
        status: 'NEW_LEAD'
      }),
      getCount({
        ...caseWhere,
        nextUpdate: { lt: new Date() },
        status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] }
      })
    ]);

    console.log(`[DASHBOARD_STATS] User=${session.user.id} My=${myCasesCount} NewLeads=${newLeadsCount} Overdue=${overdueCount}`);

    stats = {
      insurance: { savings: insuranceSavings, assessments: insuranceAssessments, active_policies: activePolicies },
      legal: { rescissions: activeRescissions, court_dates: upcomingHearings, prescriptions: prescribedDebts },
      forensic: { red_flags: redFlags, investigations: forensicCases, fraud_prevented: 0 },
      cases: { my_cases: myCasesCount, new_leads: newLeadsCount, overdue: overdueCount }
    };
  } catch {
    // DB unreachable — dashboard renders with zero values
  }

  // Real Activity Stream (Last 5 Workflow Logs)
  let activityStream: { id: string; type: string; msg: string; time: string; caseId: string }[] = [];

  try {
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
        if (curr.type !== 'ROOT') pathParts.unshift({ name: curr.name, type: curr.type });
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
      const allSources = pathParts.filter(p => p.type === 'ACQUISITION_SOURCE');
      const specificSource = allSources.filter(p => p.name !== 'Cases').pop();
      const source = clean(specificSource?.name || allSources[0]?.name || '');
      const branches = pathParts
        .filter(p => (p.type === 'BRANCH' || p.type === 'FOLDER') && p.name !== source)
        .map(p => clean(p.name));
      const branch = branches.join(' ');
      if (year || month || source || branch) {
        return [source, branch, month, year].filter(Boolean).join(' ');
      }
      return pathParts
        .filter(p => !['ROOT', 'Audit'].includes(p.type) && p.name.toUpperCase() !== 'ZDM FILES')
        .map(p => clean(p.name))
        .filter(Boolean)
        .join(' ');
    };

    activityStream = logs.map(log => ({
      id: log.id,
      type: 'admin',
      msg: `${log.user?.firstName || 'System'} - ${log.notes || log.action} for ${getProjectPath(log.case)}`,
      time: log.timestamp.toLocaleString(),
      caseId: log.caseId
    }));
  } catch {
    // DB unreachable — activity stream stays empty
  }

  return (
    <div className="max-w-7xl mx-auto py-8">
      {/* Header */}
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">
            Group Command Center
          </h1>
          <p className="text-gray-400">
            Logged in as <span className="text-zeno-cyan font-bold">{session?.user?.role || 'Director'}</span>.
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
        <Link href="https://insurance.zenowethu.co.za" className="group bg-blue-950/20 border border-blue-500/20 rounded-2xl p-6 hover:bg-blue-900/20 transition-all cursor-pointer relative overflow-hidden">
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
        <Link href="https://legal.zenowethu.co.za" className="group bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-6 hover:bg-indigo-900/20 transition-all cursor-pointer relative overflow-hidden">
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
        <Link href="https://forensic.zenowethu.co.za" className="group bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-6 hover:bg-emerald-900/20 transition-all cursor-pointer relative overflow-hidden">
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

      {/* Case Management Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">

        {/* My Cases */}
        <Link href="/cases?filter=my-cases" className="group bg-purple-950/20 border border-purple-500/20 rounded-2xl p-6 hover:bg-purple-900/20 transition-all cursor-pointer relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="text-8xl">👤</span>
          </div>
          <h3 className="text-purple-400 font-bold uppercase tracking-widest text-sm mb-4">My Cases</h3>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-3xl font-bold text-white">{stats.cases.my_cases}</p>
              <p className="text-xs text-gray-400">Personally Assigned</p>
            </div>
            <div className="flex justify-between items-center text-xs text-purple-300 font-medium">
              <span>View active workload</span>
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </div>
          </div>
        </Link>

        {/* New Leads */}
        <Link href="/cases?filter=new-leads" className="group bg-cyan-950/20 border border-cyan-500/20 rounded-2xl p-6 hover:bg-cyan-900/20 transition-all cursor-pointer relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="text-8xl">✨</span>
          </div>
          <h3 className="text-cyan-400 font-bold uppercase tracking-widest text-sm mb-4">New Leads</h3>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-3xl font-bold text-white">{stats.cases.new_leads}</p>
              <p className="text-xs text-gray-400">Total Fresh Enquiries</p>
            </div>
            <div className="flex justify-between items-center text-xs text-cyan-300 font-medium">
              <span>Action required</span>
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </div>
          </div>
        </Link>

        {/* Overdue */}
        <Link href="/cases?filter=overdue" className="group bg-rose-950/20 border border-rose-500/20 rounded-2xl p-6 hover:bg-rose-900/20 transition-all cursor-pointer relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="text-8xl">🚨</span>
          </div>
          <h3 className="text-rose-400 font-bold uppercase tracking-widest text-sm mb-4">Overdue</h3>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-3xl font-bold text-red-500">{stats.cases.overdue}</p>
              <p className="text-xs text-gray-400">Past SLA / Deadline</p>
            </div>
            <div className="flex justify-between items-center text-xs text-rose-300 font-medium">
              <span>Priority attention</span>
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </div>
          </div>
        </Link>
      </div>

      {/* Unified Activity Stream */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-12">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-zeno-cyan animate-pulse"></span>
          Unified Activity Stream
        </h3>
        <div className="space-y-0">
          {activityStream.length > 0 ? activityStream.map((item) => (
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

      {/* Recent Cases Table */}
      <DashboardCasesTable />

    </div>
  );
}
