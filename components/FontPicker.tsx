'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, Type, Info, ExternalLink } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { POPULAR_GOOGLE_FONTS, loadGoogleFont } from '@/lib/googleFonts';
import type { FontRecord } from '@/types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FontPickerProps {
  value: string;
  onChange: (font: string) => void;
  systemFonts: string[];
  customFonts: FontRecord[];
  className?: string;
}

export default function FontPicker({
  value,
  onChange,
  systemFonts,
  customFonts,
  className
}: FontPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'google' | 'custom' | 'system'>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const customFontNames = useMemo(() => customFonts.map(f => f.name), [customFonts]);

  const filteredFonts = useMemo(() => {
    const s = search.toLowerCase();
    const matches = (name: string) => name.toLowerCase().includes(s);

    const result = {
      system: systemFonts.filter(matches),
      custom: customFontNames.filter(matches),
      google: POPULAR_GOOGLE_FONTS.filter(matches),
    };

    return result;
  }, [search, systemFonts, customFontNames]);

  const totalCount = filteredFonts.system.length + filteredFonts.custom.length + filteredFonts.google.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      // Ensure the current font is loaded if it's a google font
      if (POPULAR_GOOGLE_FONTS.includes(value)) {
        loadGoogleFont(value);
      }
    }
  }, [isOpen, value]);

  const handleSelect = (font: string, isGoogle: boolean) => {
    if (isGoogle) loadGoogleFont(font);
    onChange(font);
    setIsOpen(false);
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full input flex items-center justify-between gap-2 px-3 py-2 text-left hover:border-ink-400 transition-colors bg-white shadow-sm"
        style={{ fontFamily: value }}
      >
        <span className="truncate">{value}</span>
        <ChevronDown size={14} className={cn("text-ink-400 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 w-[calc(200%+12px)] min-w-[280px] max-w-[340px] mt-2 z-[100] bg-white border border-ink-100 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top shadow-indigo-100/50">
          {/* Header & Search */}
          <div className="p-3 border-b border-ink-50 bg-ink-50/50 backdrop-blur-sm">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search fonts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white border border-ink-100 rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-gold/20 focus:border-accent-gold transition-all"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 mt-3">
              {(['all', 'google', 'custom', 'system'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                    activeTab === tab 
                      ? "bg-ink-950 text-white shadow-sm" 
                      : "text-ink-400 hover:text-ink-600 hover:bg-white"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto custom-scrollbar p-1">
            {totalCount === 0 ? (
              <div className="py-10 text-center">
                <Info size={24} className="mx-auto text-ink-100 mb-2" />
                <p className="text-xs text-ink-400">No fonts found matching "{search}"</p>
              </div>
            ) : (
              <>
                {/* Custom Fonts (Uploaded) */}
                {(activeTab === 'all' || activeTab === 'custom') && filteredFonts.custom.length > 0 && (
                  <div className="mb-2">
                    <div className="px-3 py-1.5 text-[9px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50/50 rounded-lg mx-1 my-1">Uploaded Fonts</div>
                    {filteredFonts.custom.map(f => (
                      <FontItem key={f} name={f} selected={value === f} onSelect={() => handleSelect(f, false)} />
                    ))}
                  </div>
                )}

                {/* Google Fonts */}
                {(activeTab === 'all' || activeTab === 'google') && filteredFonts.google.length > 0 && (
                  <div className="mb-2">
                    <div className="px-3 py-1.5 text-[9px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50/50 rounded-lg mx-1 my-1">Google Fonts</div>
                    {filteredFonts.google.map(f => (
                      <FontItem key={f} name={f} isGoogle selected={value === f} onSelect={() => handleSelect(f, true)} />
                    ))}
                  </div>
                )}

                {/* System Fonts */}
                {(activeTab === 'all' || activeTab === 'system') && filteredFonts.system.length > 0 && (
                  <div className="mb-2">
                    <div className="px-3 py-1.5 text-[9px] font-bold text-ink-400 uppercase tracking-widest bg-ink-50/50 rounded-lg mx-1 my-1">System Fonts</div>
                    {filteredFonts.system.map(f => (
                      <FontItem key={f} name={f} selected={value === f} onSelect={() => handleSelect(f, false)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-3 border-t border-ink-50 bg-parchment-50 flex items-center justify-between text-[10px] text-ink-400">
             <div className="flex items-center gap-1">
               <Type size={10} /> {totalCount} fonts available
             </div>
             {POPULAR_GOOGLE_FONTS.includes(value) && (
               <a href={`https://fonts.google.com/specimen/${value.replace(/\s+/g, '+')}`} 
                  target="_blank" rel="noopener noreferrer"
                  className="hover:text-ink-800 transition-colors flex items-center gap-0.5">
                 View on Google Fonts <ExternalLink size={8} />
               </a>
             )}
          </div>
        </div>
      )}
    </div>
  );
}

function FontItem({ name, isGoogle, selected, onSelect }: { name: string; isGoogle?: boolean; selected: boolean; onSelect: () => void }) {
  const [isLoaded, setIsLoaded] = useState(!isGoogle);
  
  // Lazy load font preview only for Google Fonts
  useEffect(() => {
    if (isGoogle) {
      const load = async () => {
        loadGoogleFont(name);
        // We don't necessarily wait for it to show the item, but we mark it as loaded
        // so it can apply the style.
        setIsLoaded(true);
      };
      load();
    }
  }, [name, isGoogle]);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center justify-between px-3 py-3 text-sm rounded-xl transition-all group",
        selected ? "bg-accent-gold/10 text-ink-950 font-medium" : "hover:bg-ink-50 text-ink-600"
      )}
    >
      <span 
        style={{ fontFamily: isLoaded ? name : 'inherit' }}
        className="truncate flex-1 text-left text-base"
      >
        {name}
      </span>
      {selected && <Check size={14} className="text-accent-gold ml-2 flex-shrink-0" />}
    </button>
  );
}
