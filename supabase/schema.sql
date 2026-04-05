-- ============================================================
-- Certify — Supabase Database Schema
-- Run this in your Supabase SQL editor to set up the database.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Templates ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_type   TEXT NOT NULL CHECK (file_type IN ('png', 'pdf')),
  width       INTEGER NOT NULL DEFAULT 1920,
  height      INTEGER NOT NULL DEFAULT 1080,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Template Configurations ─────────────────────────────────
CREATE TABLE IF NOT EXISTS template_configs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id         UUID NOT NULL UNIQUE REFERENCES templates(id) ON DELETE CASCADE,
  name_field          JSONB NOT NULL,
  description_field   JSONB,
  additional_fields   JSONB DEFAULT '[]'::jsonb,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Fonts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fonts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  format      TEXT NOT NULL CHECK (format IN ('ttf', 'otf', 'woff', 'woff2')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Auto-update updated_at ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER template_configs_updated_at
  BEFORE UPDATE ON template_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Row Level Security ──────────────────────────────────────
ALTER TABLE templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fonts            ENABLE ROW LEVEL SECURITY;

-- Templates: only owner can read/write
CREATE POLICY "templates_select" ON templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "templates_insert" ON templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "templates_update" ON templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "templates_delete" ON templates FOR DELETE USING (auth.uid() = user_id);

-- Template configs: accessible by the template owner
CREATE POLICY "configs_select" ON template_configs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM templates t WHERE t.id = template_configs.template_id AND t.user_id = auth.uid())
  );
CREATE POLICY "configs_insert" ON template_configs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM templates t WHERE t.id = template_id AND t.user_id = auth.uid())
  );
CREATE POLICY "configs_update" ON template_configs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM templates t WHERE t.id = template_configs.template_id AND t.user_id = auth.uid())
  );
CREATE POLICY "configs_delete" ON template_configs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM templates t WHERE t.id = template_configs.template_id AND t.user_id = auth.uid())
  );

-- Fonts: only owner can read/write
CREATE POLICY "fonts_select" ON fonts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "fonts_insert" ON fonts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fonts_delete" ON fonts FOR DELETE USING (auth.uid() = user_id);

-- ─── Storage Buckets ─────────────────────────────────────────
-- Run these separately in Supabase Storage settings or SQL editor

-- 1. Create 'templates' bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'templates', 'templates', false,
  5242880, -- 5 MB
  ARRAY['image/png', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- 2. Create 'fonts' bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fonts', 'fonts', false,
  10485760, -- 10 MB
  ARRAY['font/ttf', 'font/otf', 'font/woff', 'font/woff2',
        'application/x-font-ttf', 'application/x-font-otf',
        'application/font-woff', 'application/font-woff2',
        'application/octet-stream']
) ON CONFLICT (id) DO NOTHING;

-- ─── Profiles ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  has_seen_onboarding   BOOLEAN DEFAULT false,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at for profiles
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Storage RLS policies for... (existing policies below)
CREATE POLICY "templates_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'templates' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "templates_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'templates' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "templates_storage_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'templates' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage RLS policies for fonts bucket
CREATE POLICY "fonts_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'fonts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "fonts_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'fonts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "fonts_storage_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'fonts' AND (storage.foldername(name))[1] = auth.uid()::text);
-- ─── Configuration Versions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS template_config_versions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id       UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  config_snapshot   JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security for config versions
ALTER TABLE template_config_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_versions_select" ON template_config_versions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM templates t WHERE t.id = template_config_versions.template_id AND t.user_id = auth.uid())
  );
CREATE POLICY "config_versions_insert" ON template_config_versions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM templates t WHERE t.id = template_id AND t.user_id = auth.uid())
  );

-- ─── Certificate Records ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificate_records (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id         UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  config_version_id   UUID NOT NULL REFERENCES template_config_versions(id) ON DELETE CASCADE,
  batch_id            UUID,
  recipient_name      TEXT NOT NULL,
  dynamic_fields      JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security for certificate records
ALTER TABLE certificate_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "certificate_records_select" ON certificate_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "certificate_records_insert" ON certificate_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "certificate_records_update" ON certificate_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "certificate_records_delete" ON certificate_records FOR DELETE USING (auth.uid() = user_id);
