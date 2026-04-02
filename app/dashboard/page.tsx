import Link from 'next/link';
import { Award, FileImage, Zap, ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-10">
        <h1 className="font-display text-4xl text-ink-900 font-medium">
          Welcome to Certify
        </h1>
        <p className="text-ink-500 mt-2">
          Generate beautiful, professional certificates in minutes.
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {[
          {
            href:  '/dashboard/generate',
            icon:  Award,
            label: 'Generate Certificates',
            desc:  'Create certificates from your templates',
            accent: true,
          },
          {
            href:  '/dashboard/templates',
            icon:  FileImage,
            label: 'Manage Templates',
            desc:  'Upload and configure certificate templates',
            accent: false,
          },
          {
            href:  '/dashboard/fonts',
            icon:  Zap,
            label: 'Upload Fonts',
            desc:  'Add custom fonts for use in certificates',
            accent: false,
          },
        ].map(({ href, icon: Icon, label, desc, accent }) => (
          <Link key={href} href={href} className={`card-hover p-6 group animate-slide-up ${accent ? 'border-accent-gold/30' : ''}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-110 ${
              accent
                ? 'bg-accent-gold/10'
                : 'bg-ink-50'
            }`}>
              <Icon size={20} className={accent ? 'text-accent-gold' : 'text-ink-600'} />
            </div>
            <h3 className="font-display text-lg text-ink-900 font-medium mb-1">{label}</h3>
            <p className="text-ink-500 text-sm">{desc}</p>
            <div className="flex items-center gap-1 mt-4 text-xs font-medium text-ink-400 group-hover:text-ink-600 transition-colors">
              Get started <ArrowRight size={12} />
            </div>
          </Link>
        ))}
      </div>

      {/* How it works */}
      <div className="card p-6 lg:p-8">
        <h2 className="font-display text-2xl text-ink-900 mb-6">How it works</h2>
        <div className="space-y-4">
          {[
            { step: '01', title: 'Upload a template', desc: 'Add your certificate background as PNG or PDF.' },
            { step: '02', title: 'Configure placement', desc: 'Set where names and descriptions appear, choose fonts and styling.' },
            { step: '03', title: 'Enter names', desc: 'Type names manually or upload a CSV for bulk generation.' },
            { step: '04', title: 'Preview & Download', desc: 'Preview each certificate, then export as PNG, PDF, or ZIP.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-ink-900 text-parchment-100 text-xs font-bold font-sans">
                {step}
              </div>
              <div>
                <p className="font-medium text-ink-800 text-sm">{title}</p>
                <p className="text-ink-500 text-sm">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
