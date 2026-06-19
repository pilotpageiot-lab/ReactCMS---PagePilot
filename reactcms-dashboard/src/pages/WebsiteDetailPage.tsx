import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText, Key, Users, Settings } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { websitesApi } from '@/api/websites';
import { ContentTab } from './tabs/ContentTab';
import { ApiKeysTab } from './tabs/ApiKeysTab';
import { MembersTab } from './tabs/MembersTab';
import { SettingsTab } from './tabs/SettingsTab';
import { clsx } from 'clsx';

type Tab = 'content' | 'apikeys' | 'members' | 'settings';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'content', label: 'Content', icon: <FileText size={14} /> },
  { id: 'apikeys', label: 'API keys', icon: <Key size={14} /> },
  { id: 'members', label: 'Members', icon: <Users size={14} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={14} /> },
];

export function WebsiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('content');

  const { data: website, isLoading } = useQuery({
    queryKey: ['website', id],
    queryFn: () => websitesApi.get(id!),
    enabled: !!id,
  });

  if (!id) return <Navigate to="/websites" replace />;

  if (isLoading) {
    return (
      <div className="px-6 py-6 space-y-4 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48" />
        <div className="h-4 bg-gray-100 rounded w-32" />
      </div>
    );
  }

  if (!website) return <Navigate to="/websites" replace />;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={website.name}
        description={`${website.slug}.reactcms.io`}
        breadcrumb={
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Link to="/websites" className="hover:text-gray-900 transition-colors">
              Websites
            </Link>
            <ChevronRight size={12} />
            <span className="text-gray-900">{website.name}</span>
          </div>
        }
        action={
          <div className="flex items-center gap-2">
            <Badge variant={website.is_active ? 'success' : 'default'}>
              {website.is_active ? 'Active' : 'Inactive'}
            </Badge>
            <Badge variant={website.plan === 'pro' ? 'indigo' : 'default'}>
              {website.plan}
            </Badge>
          </div>
        }
      />

      {/* Tab bar */}
      <div className="flex overflow-x-auto px-4 sm:px-6 border-b border-gray-100 bg-white">
        {TABS.map(({ id: tabId, label, icon }) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            className={clsx(
              'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap shrink-0',
              activeTab === tabId
                ? 'text-indigo-700 border-indigo-600'
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300',
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'content' ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ContentTab websiteId={id} customDomain={website.custom_domain} />
        </div>
      ) : (
        <div className="flex-1">
          {activeTab === 'apikeys' && <ApiKeysTab websiteId={id} />}
          {activeTab === 'members' && <MembersTab websiteId={id} />}
          {activeTab === 'settings' && <SettingsTab website={website} />}
        </div>
      )}
    </div>
  );
}
