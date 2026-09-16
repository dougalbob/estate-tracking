import { currentUser } from "@/lib/auth/current-user";
import { ArrowUpRight, BookOpen, Check, ChevronRight, FileText, FolderOpen, Home, Leaf, ListTodo, LockKeyhole, Phone, Plus, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
const sections = [{ id: "contacts", title: "Contacts", description: "Organisations, reference details, and the conversations that matter.", icon: Users }, { id: "tasks", title: "All tasks", description: "A shared place for next steps, follow-ups, and confirmed dates.", icon: ListTodo }, { id: "documents", title: "Documents", description: "Important paperwork, kept together and easy to find.", icon: FolderOpen }];
export default async function Page() {
  let user;
  try { user = await currentUser(); }
  catch { return <main className="access"><LockKeyhole size={32}/><h1>Protected workspace</h1><p>Open Estate Organiser through your configured Cloudflare Access address.</p><p>If you are setting up the app, check the server authentication configuration. No estate data has been loaded.</p></main>; }
  return <div className="app-shell">
    <a className="skip" href="#main">Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-mark"><Leaf size={23}/></span><span>Estate<br/>Organiser</span></a>
      <p className="sidebar-label">YOUR WORKSPACE</p>
      <nav aria-label="Main navigation"><a className="nav-item selected" href="#main" aria-current="page"><Home size={19}/>Overview</a>{sections.map(s => <a className="nav-item" href={`#${s.id}`} key={s.id}><s.icon size={19}/>{s.title}</a>)}<a className="nav-item" href="#projects"><BookOpen size={19}/>Projects</a><a className="nav-item" href="#finances"><Wallet size={19}/>Estate finances</a></nav>
      <div className="sidebar-bottom"><LockKeyhole size={17}/><span>One estate. A shared space.<br/><small>Built to take things one step at a time.</small></span></div>
    </aside>
    <div className="workspace"><header className="topbar"><span>Our shared workspace</span><div className="profile"><span className="avatar">{user.displayName.charAt(0).toUpperCase()}</span>{user.displayName}</div></header>
      <main id="main" className="main-content">
        <div className="preview-banner"><span className="demo-dot"/><strong>{user.demo ? "Fictional-data preview" : "Foundation preview"}</strong><span>Layout only · changes are not saved yet</span></div>
        <div className="page-heading"><div><p className="eyebrow">A LITTLE CLARITY, ONE STEP AT A TIME</p><h1>Your overview</h1><p>See what needs attention and pick up where you left off.</p></div><Button asChild><a href="#quick-note"><Plus size={18}/>Quick note</a></Button></div>
        <div className="dashboard-grid"><section className="panel attention"><div className="section-heading"><div><h2>What needs attention</h2><p>A few next steps, all in one place.</p></div><span className="badge">Example tasks</span></div>
          {[{icon: Phone,title: "Ask the bank which documents they need",project:"Notifications",owner:"Alex",date:"Next step"},{icon: FileText,title:"Review the funeral director’s estimate",project:"Funeral",owner:"Jamie",date:"To review"},{icon: FolderOpen,title:"Find the original Will",project:"Probate & Estate Administration",owner:"Unassigned",date:"To do"}].map(t=><div className="task-row" key={t.title}><span className="task-icon"><t.icon size={19}/></span><div className="task-copy"><h3>{t.title}</h3><p>{t.project}<span>·</span>{t.owner}</p></div><span className="task-state">{t.date}</span></div>)}
          <a className="text-link panel-footer" href="#tasks">View all tasks<ChevronRight size={17}/></a>
        </section><section className="panel activity"><div className="section-heading"><div><h2>What changed</h2><p>Keeping you both in the picture.</p></div></div><div className="activity-entry"><span className="avatar secondary">J</span><div><p><strong>Jamie</strong> added a note to the funeral arrangements.</p><small>Example activity · not a real record</small></div></div><div className="activity-entry"><span className="activity-check"><Check size={17}/></span><div><p>A shared history will show who did what, and when.</p><small>No need to keep it all in your head.</small></div></div></section></div>
        <div className="shortcut-grid">{sections.map(s=><section id={s.id} className="panel shortcut" key={s.id}><div className="shortcut-top"><s.icon size={23}/><ArrowUpRight size={18}/></div><h2>{s.title}</h2><p>{s.description}</p><span className="coming">Coming in the next milestones</span></section>)}</div>
        <div className="lower-grid"><section id="projects" className="panel project-panel"><h2>Your projects</h2><p>Group the work in a way that makes sense to you.</p><div className="project-pills"><span>Funeral</span><span>Notifications</span><span>Probate & Estate Administration</span></div></section><section id="finances" className="panel project-panel"><h2>Estate finances</h2><p>Assets, liabilities, expenses, and reimbursements—without tax or entitlement calculations.</p><span className="coming">Planned · GBP only</span></section></div>
        <section id="quick-note" className="panel note-preview"><div><h2>A place for the details</h2><p>Quick capture will let you save a thought now and organise it later.</p></div><span className="badge">Note entry is not available yet</span></section>
        <footer className="page-footer"><Leaf size={15}/>You don’t need to do everything today.</footer>
      </main>
    </div>
  </div>;
}
