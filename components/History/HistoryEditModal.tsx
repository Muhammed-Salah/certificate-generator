"use client";

import React, { useState } from "react";
import { X, Save, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CertificateRecord } from "./types";

interface Props {
  record: CertificateRecord;
  onClose: () => void;
  onUpdate: () => void;
}

export function HistoryEditModal({ record, onClose, onUpdate }: Props) {
  const [name, setName] = useState(record.recipient_name);
  const [fields, setFields] = useState<Record<string, string>>(record.dynamic_fields || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleSave = async () => {
    if (!name.trim()) return setError("Name is required");
    
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from("certificate_records")
        .update({
          recipient_name: name.trim(),
          dynamic_fields: fields
        })
        .eq("id", record.id);
      
      if (err) throw err;
      onUpdate();
      onClose();
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to update record");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-scale-up">
        <div className="px-6 py-4 border-b border-ink-100 flex items-center justify-between">
          <h3 className="font-display text-lg text-ink-900">Edit Recipient Data</h3>
          <button onClick={onClose} className="p-2 hover:bg-ink-100 rounded-full transition-colors">
            <X size={20} className="text-ink-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex gap-2 text-red-600 text-sm">
              <AlertCircle size={16} className="mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-ink-400 uppercase tracking-wider mb-1.5 ml-1">Recipient Name</label>
              <input 
                className="input w-full"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter name..."
              />
            </div>

            {Object.keys(fields).length > 0 && (
              <div className="space-y-4 pt-2">
                <label className="block text-xs font-bold text-ink-400 uppercase tracking-wider mb-2 ml-1">Dynamic Fields</label>
                <div className="grid grid-cols-1 gap-4 max-h-[300px] overflow-y-auto pr-1">
                  {Object.entries(fields).map(([key, val]) => (
                    <div key={key}>
                      <label className="block text-[11px] font-medium text-ink-500 mb-1 ml-1">{key}</label>
                      <input 
                        className="input w-full py-2 text-sm"
                        value={val}
                        onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={key}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-ink-100 flex items-center justify-end gap-3 bg-parchment-50 mt-4">
          <button onClick={onClose} className="btn-outline px-6 justify-center">
            Cancel
          </button>
          <button 
            disabled={saving}
            onClick={handleSave}
            className="btn-primary px-8 justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

