import { TemplateConfig } from "@/types";

export interface ConfigVersion {
  id: string;
  template_id: string;
  config_snapshot: TemplateConfig & { desc_override?: string };
  created_at: string;
}

export interface CertificateRecord {
  id: string;
  user_id: string;
  template_id: string;
  config_version_id: string;
  batch_id?: string | null;
  recipient_name: string;
  dynamic_fields: Record<string, string>;
  created_at: string;
  
  // Joined data
  template?: {
    name: string;
    file_path: string;
    file_type: 'png' | 'pdf';
  };
  config_version?: ConfigVersion;
}
