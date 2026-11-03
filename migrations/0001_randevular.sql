-- Randevu tablosu. Saatler Türkiye saatiyle (Europe/Istanbul, UTC+3) tutulur.
CREATE TABLE IF NOT EXISTS appointments (
  id            TEXT PRIMARY KEY,          -- ör. MA-0411-1400-K7QX
  created_at    TEXT NOT NULL,             -- ISO zaman (UTC)
  topic         TEXT NOT NULL,             -- ausbildung, hemsire, surucu, ...
  mode          TEXT NOT NULL,             -- online | telefon | ofis
  office        TEXT,                      -- bochum | bandirma | istanbul (sadece ofis için)
  lang          TEXT NOT NULL DEFAULT 'tr',-- tr | de
  date          TEXT NOT NULL,             -- YYYY-MM-DD (Türkiye saati)
  time          TEXT NOT NULL,             -- HH:MM (Türkiye saati)
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT NOT NULL,
  level         TEXT,                      -- Almanca seviyesi
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'onaylandi', -- onaylandi | iptal | gelmedi | tamamlandi
  cancel_token  TEXT NOT NULL,
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  consent_at    TEXT NOT NULL              -- KVKK/DSGVO onay zamanı
);

-- Çakışma engeli: iptal edilmemiş iki randevu aynı gün ve saate düşemez.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_slot
  ON appointments(date, time) WHERE status != 'iptal';

CREATE INDEX IF NOT EXISTS idx_date ON appointments(date);
