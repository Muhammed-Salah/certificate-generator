export interface Template {
  id: string;
  name: string;
  file_path: string;
  file_type: 'png' | 'pdf';
  thumbnail_path?: string;
  width: number;
  height: number;
  config?: TemplateConfig;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface TemplateConfig {
  template_id: string;
  name_field: TextField;
  description_field?: RichTextField;
  updated_at: string;
}

export interface TextField {
  x: number; // 0–1 fraction of template width
  y: number; // 0–1 fraction of template height
  font_family: string;
  font_size: number; // px at 1:1 scale
  font_color: string; // hex
  alignment: 'left' | 'center' | 'right';
  case_transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'titlecase' | 'small-caps';
  max_width: number; // 0–1 fraction
  auto_size: boolean;
}

export interface RichTextField {
  x: number;
  y: number;
  width: number;  // 0–1 fraction
  height: number; // 0–1 fraction
  font_family: string;
  font_size: number;
  font_color: string;
  alignment: 'left' | 'center' | 'right';
  content: string; // HTML rich text default content
}

export interface FontRecord {
  id: string;
  name: string;
  file_path: string;
  format: 'ttf' | 'otf' | 'woff' | 'woff2';
  created_at: string;
}

export interface GenerationJob {
  names: string[];
  templateId: string;
  outputFormat: 'png' | 'pdf';
  bulkFormat?: 'zip' | 'merged-pdf';
  nameOverride?: string;
  descriptionOverride?: string;
}

export type Step = 'select' | 'configure' | 'names' | 'preview' | 'generate';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}
