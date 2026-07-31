'use client'

import { useState, useEffect } from 'react'

interface Project {
  id: string
  name: string
  description: string
  accentColor: string
  isManagerOfProject: boolean
  memberCount: number
  caseCount: number
  totalWorkLogs: number
  totalHours: string
}

interface ProjectActivityItem {
  id: string
  date: string
  category: string
  description: string
  durationMinutes: number
  fileNumber?: string
  isVerified: boolean
  performer: {
    id: string
    name: string
    role: string | null
    isAnonymized: boolean
    email: string | null
    avatarUrl: string | null
  }
}

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [activities, setActivities] = useState<ProjectActivityItem[]>([])
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setIsLoading(true)
    try {
      const res = await fetch('/api/reporting/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects || [])
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSelectProject(project: Project) {
    setSelectedProject(project)
    setIsLoadingActivity(true)
    try {
      const res = await fetch(`/api/reporting/projects/${project.id}/activity`)
      if (res.ok) {
        const data = await res.json()
        setActivities(data.activity || [])
      }
    } catch (error) {
      console.error('Failed to load project activity:', error)
    } finally {
      setIsLoadingActivity(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Projects & Activity Oversight</h2>
          <p className="text-sm text-slate-600">
            Managed projects are prioritized at the top. Click any project to inspect who performed work.
          </p>
        </div>
        <button
          onClick={loadProjects}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
        >
          Refresh Projects
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-500 animate-pulse">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-slate-500 border border-slate-200">
          No projects found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => handleSelectProject(project)}
              className={`cursor-pointer bg-white rounded-xl p-5 border transition-all duration-200 shadow-sm hover:shadow-md ${
                project.isManagerOfProject
                  ? 'border-amber-400/80 bg-gradient-to-br from-amber-50/40 via-white to-white'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-bold text-slate-900 text-base line-clamp-1">{project.name}</h3>
                {project.isManagerOfProject && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-slate-950 shadow-sm">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Manager Project
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600 line-clamp-2 mb-4 h-8">
                {project.description}
              </p>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
                <span className="font-medium">
                  {project.totalHours}h logged ({project.totalWorkLogs} tasks)
                </span>
                <span className="text-cyan-600 font-bold hover:underline">
                  View Activity &rarr;
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project Activity Drawer / Modal */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold">{selectedProject.name}</h3>
                  {selectedProject.isManagerOfProject && (
                    <span className="px-2 py-0.5 rounded text-xs font-extrabold bg-amber-400 text-slate-950">
                      You Manage This Project
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">Who has done what on this project</p>
              </div>
              <button
                onClick={() => setSelectedProject(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition"
              >
                &times;
              </button>
            </div>

            {/* Activity List */}
            <div className="p-6 overflow-y-auto flex-1 space-y-3">
              {isLoadingActivity ? (
                <div className="text-center py-12 text-slate-500 animate-pulse">
                  Loading project activity logs...
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  No work logs recorded for this project yet.
                </div>
              ) : (
                activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {act.performer.isAnonymized ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-800 text-slate-200 shadow-sm border border-slate-700">
                            <svg className="w-3 h-3 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 1a4 4 0 00-4 4v2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 6V5a2 2 0 10-4 0v2h4z" clipRule="evenodd" />
                            </svg>
                            Senior Member
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              {act.performer.name}
                            </span>
                            {act.performer.role && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                                {act.performer.role}
                              </span>
                            )}
                          </div>
                        )}
                        <span className="text-xs text-slate-400">
                          &bull; {new Date(act.date).toLocaleDateString()}
                        </span>
                      </div>

                      <p className="text-xs font-medium text-slate-800">{act.description}</p>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                        <span className="bg-slate-200/70 px-2 py-0.5 rounded text-slate-700 font-mono">
                          {act.category}
                        </span>
                        {act.fileNumber && (
                          <span className="font-mono text-cyan-700">Ref: {act.fileNumber}</span>
                        )}
                      </div>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <span className="text-sm font-bold text-slate-900 block">
                        {(act.durationMinutes / 60).toFixed(1)}h ({act.durationMinutes}m)
                      </span>
                      {act.isVerified ? (
                        <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                          Verified
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-medium text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 text-right">
              <button
                onClick={() => setSelectedProject(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
