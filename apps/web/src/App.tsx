import React, { useState, useEffect } from 'react';
import {
  Bot,
  User,
  Plus,
  Radio,
  Sparkles,
  Layers,
  Copy,
  Check,
  Cpu,
} from 'lucide-react';

interface Project {
  id: string;
  key: string;
  name: string;
  description?: string;
}

interface AgentRun {
  id: string;
  agentName: string;
  agentModel?: string;
  status: string;
  resultSummary?: string;
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED';
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  type: 'TASK' | 'BUG' | 'STORY' | 'EPIC';
  assigneeType: 'HUMAN' | 'AGENT' | 'UNASSIGNED';
  assigneeName?: string;
  labels: string[];
  comments?: any[];
  agentRuns?: AgentRun[];
}

const COLUMNS: { key: Issue['status']; title: string; color: string }[] = [
  { key: 'BACKLOG', title: 'Backlog', color: 'border-zinc-700/60' },
  { key: 'TODO', title: 'To Do', color: 'border-blue-500/30' },
  { key: 'IN_PROGRESS', title: 'In Progress', color: 'border-amber-500/40' },
  { key: 'IN_REVIEW', title: 'In Review', color: 'border-purple-500/40' },
  { key: 'DONE', title: 'Done', color: 'border-emerald-500/40' },
];

export default function App() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [copiedMcp, setCopiedMcp] = useState(false);

  // New Issue form state
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<Issue['priority']>('MEDIUM');
  const [newType, setNewType] = useState<Issue['type']>('TASK');
  const [newAssigneeType, setNewAssigneeType] = useState<Issue['assigneeType']>('AGENT');
  const [newAssigneeName, setNewAssigneeName] = useState('agent-coder-v1');
  const [newLabels, setNewLabels] = useState('mcp, automation');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  // Fetch projects and issues
  const fetchData = async () => {
    try {
      const pRes = await fetch(`${API_URL}/api/projects`);
      if (pRes.ok) {
        const pData = await pRes.json();
        setProjects(pData);
        if (pData.length > 0 && !activeProject) {
          setActiveProject(pData[0]);
        }
      }

      const iRes = await fetch(`${API_URL}/api/issues`);
      if (iRes.ok) {
        const iData = await iRes.json();
        setIssues(iData);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  useEffect(() => {
    fetchData();

    // SSE connection for realtime agent updates
    const eventSource = new EventSource(`${API_URL}/api/events`);
    eventSource.onopen = () => setSseConnected(true);
    eventSource.onerror = () => setSseConnected(false);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (['issue_created', 'issue_updated', 'agent_run_started', 'agent_run_updated'].includes(data.type)) {
          fetchData();
        }
      } catch (e) {
        // ignore heartbeat
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await fetch(`${API_URL}/api/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject?.id,
          title: newTitle,
          description: newDesc,
          priority: newPriority,
          type: newType,
          status: 'TODO',
          assigneeType: newAssigneeType,
          assigneeName: newAssigneeName,
          labels: newLabels.split(',').map((l) => l.trim()).filter(Boolean),
        }),
      });

      if (res.ok) {
        setShowNewModal(false);
        setNewTitle('');
        setNewDesc('');
        fetchData();
      }
    } catch (err) {
      console.error('Failed to create issue', err);
    }
  };

  const handleUpdateStatus = async (issueId: string, status: Issue['status']) => {
    try {
      await fetch(`${API_URL}/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const mcpConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        kanso: {
          url: "http://localhost:3001/sse"
        }
      }
    },
    null,
    2
  );

  const copyMcpConfig = () => {
    navigator.clipboard.writeText(mcpConfigSnippet);
    setCopiedMcp(true);
    setTimeout(() => setCopiedMcp(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0b0d14] text-zinc-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="h-16 border-b border-zinc-800/80 bg-[#0e111a]/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 text-sm">
              簡
            </div>
            <div>
              <span className="font-semibold tracking-tight text-white text-base">KANSO</span>
              <span className="text-xs text-zinc-400 ml-2 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono">
                Agent-First Jira Alternative
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          {/* Project selector */}
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Layers className="w-4 h-4 text-indigo-400" />
            <select
              value={activeProject?.id || ''}
              onChange={(e) => {
                const found = projects.find((p) => p.id === e.target.value);
                if (found) setActiveProject(found);
              }}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                  {p.name} [{p.key}]
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Realtime Event Stream Indicator */}
          <div className="flex items-center gap-2 text-xs px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800">
            <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-zinc-400">{sseConnected ? 'Live Realtime SSE' : 'Offline'}</span>
          </div>

          {/* MCP Server Button */}
          <button
            onClick={() => setShowMcpModal(true)}
            className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/30 transition shadow-sm"
          >
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>MCP Server Active (Port 3001)</span>
          </button>

          {/* New Issue Button */}
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-md shadow-indigo-500/25 transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Issue</span>
          </button>
        </div>
      </header>

      {/* Main Board View */}
      <main className="flex-1 p-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white">Sprint Board</h1>
            <span className="text-xs text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-full border border-zinc-700/60 font-mono">
              {issues.length} active issues
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500 text-emerald-400 flex items-center justify-center text-[8px]">
                🤖
              </span>
              <span>Agent Managed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-blue-500/20 border border-blue-500 text-blue-400 flex items-center justify-center text-[8px]">
                👤
              </span>
              <span>Human Assigned</span>
            </div>
          </div>
        </div>

        {/* Kanban Columns */}
        <div className="grid grid-cols-5 gap-4 min-w-[1100px] h-[calc(100vh-180px)]">
          {COLUMNS.map((col) => {
            const colIssues = issues.filter((i) => i.status === col.key);
            return (
              <div
                key={col.key}
                className="flex flex-col bg-[#111420]/70 rounded-xl border border-zinc-800/70 overflow-hidden shadow-inner"
              >
                {/* Column Header */}
                <div className={`p-3 border-b ${col.color} bg-[#141827]/80 flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs tracking-wider uppercase text-zinc-300">
                      {col.title}
                    </span>
                    <span className="text-xs px-2 py-0.2 rounded-full bg-zinc-800/80 text-zinc-400 font-mono">
                      {colIssues.length}
                    </span>
                  </div>
                </div>

                {/* Column Cards */}
                <div className="flex-1 p-3 overflow-y-auto space-y-3">
                  {colIssues.map((issue) => (
                    <div
                      key={issue.id}
                      onClick={() => setSelectedIssue(issue)}
                      className="group cursor-pointer rounded-lg bg-[#181c2d] hover:bg-[#1e2338] border border-zinc-800/90 hover:border-indigo-500/40 p-3.5 transition duration-150 shadow-sm hover:shadow-md hover:shadow-indigo-500/5 relative"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-mono text-zinc-400 group-hover:text-indigo-300 transition">
                          {issue.identifier}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                            issue.priority === 'URGENT'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : issue.priority === 'HIGH'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {issue.priority}
                        </span>
                      </div>

                      <h3 className="text-sm font-medium text-zinc-100 group-hover:text-white mb-2 leading-snug">
                        {issue.title}
                      </h3>

                      {issue.description && (
                        <p className="text-xs text-zinc-400 line-clamp-2 mb-3 leading-relaxed">
                          {issue.description}
                        </p>
                      )}

                      {/* Active Agent Run Highlight */}
                      {issue.agentRuns && issue.agentRuns.length > 0 && issue.agentRuns[0].status === 'RUNNING' && (
                        <div className="mb-2.5 p-2 rounded bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
                          <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
                          <span className="truncate">
                            Agent active: <span className="font-mono">{issue.agentRuns[0].agentName}</span>
                          </span>
                        </div>
                      )}

                      {/* Tags & Assignee */}
                      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 mt-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {issue.labels?.map((label) => (
                            <span
                              key={label}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
                            >
                              #{label}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center gap-1 text-xs">
                          {issue.assigneeType === 'AGENT' ? (
                            <div className="flex items-center gap-1 text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded text-[11px] font-mono">
                              <Bot className="w-3 h-3 text-emerald-400" />
                              <span className="truncate max-w-[90px]">{issue.assigneeName || 'Agent'}</span>
                            </div>
                          ) : issue.assigneeType === 'HUMAN' ? (
                            <div className="flex items-center gap-1 text-blue-400 bg-blue-950/60 border border-blue-800/60 px-2 py-0.5 rounded text-[11px]">
                              <User className="w-3 h-3 text-blue-400" />
                              <span className="truncate max-w-[90px]">{issue.assigneeName || 'Human'}</span>
                            </div>
                          ) : (
                            <span className="text-zinc-600 text-[11px]">Unassigned</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {colIssues.length === 0 && (
                    <div className="h-28 border border-dashed border-zinc-800 rounded-lg flex items-center justify-center text-xs text-zinc-600">
                      No issues
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* MCP Configuration Modal */}
      {showMcpModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121624] border border-zinc-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Model Context Protocol (MCP) Setup</h2>
                  <p className="text-xs text-zinc-400">Connect Claude, Cursor, Antigravity or custom agents to Kanso</p>
                </div>
              </div>
              <button onClick={() => setShowMcpModal(false)} className="text-zinc-400 hover:text-white text-sm">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <p>
                Kanso provides a native <strong>Model Context Protocol (MCP)</strong> server running on port{' '}
                <span className="font-mono text-indigo-300">3001</span>. Any agent can autonomously query issues, create
                sub-tasks, update statuses, and log execution tokens.
              </p>

              <div>
                <span className="font-semibold text-zinc-200 block mb-1.5">
                  Claude Desktop / Cursor MCP Configuration:
                </span>
                <div className="relative">
                  <pre className="bg-[#090b12] p-3 rounded-lg border border-zinc-800 text-[11px] font-mono text-emerald-400 overflow-x-auto">
                    {mcpConfigSnippet}
                  </pre>
                  <button
                    onClick={copyMcpConfig}
                    className="absolute top-2 right-2 flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded text-[11px] text-zinc-200 border border-zinc-700 transition"
                  >
                    {copiedMcp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedMcp ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-500/30 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-indigo-200">
                  <strong>Exposed MCP Tools:</strong> <code className="text-white">kanso_list_issues</code>,{' '}
                  <code className="text-white">kanso_create_issue</code>, <code className="text-white">kanso_update_issue</code>,{' '}
                  <code className="text-white">kanso_add_comment</code>, <code className="text-white">kanso_record_agent_run</code>.
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowMcpModal(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Issue Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateIssue}
            className="bg-[#121624] border border-zinc-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                <span>Create New Issue</span>
              </h2>
              <button type="button" onClick={() => setShowNewModal(false)} className="text-zinc-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Implement GitHub Webhook Handler for Agent Auto-Triage"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-[#0a0c14] border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe context, requirements, acceptance criteria..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-[#0a0c14] border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e: any) => setNewPriority(e.target.value)}
                    className="w-full bg-[#0a0c14] border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="URGENT">Urgent</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Type</label>
                  <select
                    value={newType}
                    onChange={(e: any) => setNewType(e.target.value)}
                    className="w-full bg-[#0a0c14] border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="TASK">Task</option>
                    <option value="BUG">Bug</option>
                    <option value="STORY">Story</option>
                    <option value="EPIC">Epic</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Assignee Target</label>
                  <select
                    value={newAssigneeType}
                    onChange={(e: any) => setNewAssigneeType(e.target.value)}
                    className="w-full bg-[#0a0c14] border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="AGENT">🤖 Autonomous Agent</option>
                    <option value="HUMAN">👤 Human Engineer</option>
                    <option value="UNASSIGNED">Unassigned</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Assignee Name</label>
                  <input
                    type="text"
                    value={newAssigneeName}
                    onChange={(e) => setNewAssigneeName(e.target.value)}
                    placeholder="e.g. agent-coder-v1"
                    className="w-full bg-[#0a0c14] border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Labels (comma separated)</label>
                <input
                  type="text"
                  value={newLabels}
                  onChange={(e) => setNewLabels(e.target.value)}
                  placeholder="agentic, mcp, api"
                  className="w-full bg-[#0a0c14] border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/30 transition"
              >
                Create Issue
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Selected Issue Details Modal */}
      {selectedIssue && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121624] border border-zinc-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-700/60 px-2 py-0.5 rounded">
                  {selectedIssue.identifier}
                </span>
                <span className="text-xs text-zinc-400 font-medium">{selectedIssue.type}</span>
              </div>
              <button onClick={() => setSelectedIssue(null)} className="text-zinc-400 hover:text-white">
                ✕
              </button>
            </div>

            <h2 className="text-lg font-bold text-white leading-tight">{selectedIssue.title}</h2>

            <div className="text-xs text-zinc-300 bg-[#090b14] p-4 rounded-xl border border-zinc-800/80 leading-relaxed whitespace-pre-wrap">
              {selectedIssue.description || 'No description provided.'}
            </div>

            {/* Quick Status Change */}
            <div className="flex items-center gap-3 text-xs">
              <span className="text-zinc-400 font-medium">Status:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {COLUMNS.map((col) => (
                  <button
                    key={col.key}
                    onClick={() => {
                      handleUpdateStatus(selectedIssue.id, col.key);
                      setSelectedIssue({ ...selectedIssue, status: col.key });
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition ${
                      selectedIssue.status === col.key
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60 hover:text-white'
                    }`}
                  >
                    {col.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent / Human Details */}
            <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedIssue.assigneeType === 'AGENT' ? (
                  <>
                    <Bot className="w-4 h-4 text-emerald-400" />
                    <span className="text-zinc-300">
                      Assigned Agent: <strong className="font-mono text-emerald-300">{selectedIssue.assigneeName}</strong>
                    </span>
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4 text-blue-400" />
                    <span className="text-zinc-300">
                      Assigned User: <strong className="text-blue-300">{selectedIssue.assigneeName || 'Unassigned'}</strong>
                    </span>
                  </>
                )}
              </div>
              <span className="text-zinc-500 font-mono text-[11px]">Priority: {selectedIssue.priority}</span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedIssue(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
