import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import { WalkthroughProvider } from '@/components/Walkthrough/WalkthroughProvider';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  return (
    <WalkthroughProvider>
      <DashboardShell user={user}>{children}</DashboardShell>
    </WalkthroughProvider>
  );
}
