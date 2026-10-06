import { useEffect, useState } from 'react';
import axios from 'axios';
import { ShieldCheck, ShieldAlert, GitPullRequest, Search, Loader2 } from 'lucide-react';

// Define the shape of our database records so TypeScript can help us catch errors
interface PRRecord {
  id: string;
  prNumber: number;
  title: string;
  status: 'passed' | 'failed' | 'pending';
  createdAt: string;
  repository: {
    name: string;
    owner: string;
    url: string;
  };
}

function App() {
  const [prs, setPrs] = useState<PRRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch the data from your new Express endopinnt when the component loads
  useEffect(() => {
    const fetchPrs = async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/prs');
        setPrs(response.data);
      } catch (error) {
        console.error('Error fetching PRs:', error);
      } finally {
        setLoading(false)
      }
    };
    fetchPrs();
  }, []);

  return (
    <div className='min-h-screen bg-slate-50 text-slate-900 font-sans'>

      {/* NavBar Header */}
      <nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className='bg-blue-600 p-2 rounded-lg'>
            <ShieldCheck className="text-white w-6 h-6" />
          </div>
            <h1 className="text-xl font-bold tracking-tight">AI-Security-Gatekeeper</h1>
        </div>
        <div className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
          Live Monitoring
        </div>
      </nav>

      {/* Main Content Area */}
      <main className='max-w-6xl mx-auto px-8 py-10'>

        {/* Page Header */}
        <header className="mb-8 flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Security Scans</h2>
            <p className="text-slate-500 mt-2">Real-time analysis of automated pull reviews.</p>
          </div>
          <div className='relative'>
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
            <input 
              type="text"
              placeholder='Search repositories...'
              className='pl-10 pr-4 border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64'
            />
          </div>
        </header>

        {/* Dashboard Gird */}
        {loading ? (
          <div className="flex justify-center items-center h-64 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <div className='grid gap-4'>
            {prs.map((pr) => (
              <div key={pr.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                {/* Left Side: PR Info */}
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-full ${pr.status === 'passed' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {pr.status === 'passed' ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      {pr.title} 
                      <span className="text-sm font-normal text-slate-400">#{pr.prNumber}</span>
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                      <GitPullRequest className="w-4 h-4" />
                      <a href={pr.repository.url} target="_blank" rel="noreferrer" className="hover:text-blue-600 hover:underline">
                        {pr.repository.owner}/{pr.repository.name}
                      </a>
                      <span>•</span>
                      <span>{new Date(pr.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Status Badge */}
                <div>
                  <span className={`px-4 py-1.5 rounded-full text-sm font-medium border ${pr.status === 'passed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {pr.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;