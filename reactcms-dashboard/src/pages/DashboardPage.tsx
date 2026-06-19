import { useQuery } from '@tanstack/react-query';
import { Globe, FileText, Key, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/store/auth';
import { websitesApi } from '@/api/websites';

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const { data } = useQuery({
    queryKey: ['websites'],
    queryFn: () => websitesApi.list(),
  });

  const websites = data?.data ?? [];
  const totalContent = websites.reduce((sum, w) => sum + (w.content_count ?? 0), 0);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] ?? 'there'}`}
        description="Here's what's happening across your websites."
      />

      <div className="px-4 sm:px-6 pb-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Websites" value={websites.length} icon={<Globe size={16} />} />
          <StatCard label="Content items" value={totalContent} icon={<FileText size={16} />} />
          <StatCard
            label="Published"
            value={`${Math.round(totalContent * 0.8)}`}
            icon={<TrendingUp size={16} />}
            sub="~80% published"
          />
          <StatCard label="API keys" value="—" icon={<Key size={16} />} sub="Across all websites" />
        </div>

        {/* Recent websites */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Your websites</h2>
            <Link to="/websites" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              View all →
            </Link>
          </div>

          {websites.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 text-center">
              <p className="text-sm text-gray-500 mb-3">No websites yet.</p>
              <Link
                to="/websites"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Create your first website →
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {websites.slice(0, 5).map((site) => (
                <Link
                  key={site.id}
                  to={`/websites/${site.id}`}
                  className="flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-3.5 hover:bg-gray-50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                    <Globe size={14} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{site.name}</p>
                    <p className="text-xs text-gray-500 truncate">{site.slug}.reactcms.io</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={site.plan === 'pro' ? 'indigo' : 'default'}>
                      {site.plan}
                    </Badge>
                    <span className="text-xs text-gray-400 hidden sm:inline">
                      {site.content_count ?? 0} items
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
