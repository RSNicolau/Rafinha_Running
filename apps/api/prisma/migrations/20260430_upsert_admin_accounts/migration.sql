-- Upsert system accounts with correct roles
-- master@rafinharunning.com → SUPER_ADMIN (platform owner)
-- rafinha@rafinharunning.com → ADMIN (coach/manager of the assessoria)
-- Passwords are bcrypt hashed (cost 12). Safe to re-run.

DO $$
DECLARE
  v_master_id TEXT;
  v_rafinha_id TEXT;
BEGIN
  -- ── Master SUPER_ADMIN ──
  INSERT INTO users (id, email, password_hash, name, role, is_active, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    'master@rafinharunning.com',
    '$2b$12$Hs0Bqar5YuLmIFMTYq..j.fDt/h7pDliBmZlqnPCYgj6s9wvYj0sC', -- masteradmin123@
    'Master Admin',
    'SUPER_ADMIN',
    true,
    NOW(), NOW()
  )
  ON CONFLICT (email) DO UPDATE SET
    role = 'SUPER_ADMIN',
    is_active = true,
    updated_at = NOW();

  SELECT id INTO v_master_id FROM users WHERE email = 'master@rafinharunning.com';
  RAISE NOTICE 'Master SUPER_ADMIN id: %', v_master_id;

  -- ── Rafinha ADMIN ──
  INSERT INTO users (id, email, password_hash, name, role, is_active, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    'rafinha@rafinharunning.com',
    '$2b$12$llAd98SqAm6E3UoivTwvuOeDa4ocydjSgHwQnQCHThsNP84gbKsMe', -- Rafinhaadmin123@
    'Rafinha Silva',
    'ADMIN',
    true,
    NOW(), NOW()
  )
  ON CONFLICT (email) DO UPDATE SET
    role = 'ADMIN',
    is_active = true,
    updated_at = NOW();

  SELECT id INTO v_rafinha_id FROM users WHERE email = 'rafinha@rafinharunning.com';
  RAISE NOTICE 'Rafinha ADMIN id: %', v_rafinha_id;

  -- ── Ensure CoachProfile for Rafinha ──
  INSERT INTO coach_profiles (id, user_id, slug, bio, specializations, certifications, max_athletes, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_rafinha_id,
    'rafinha',
    'Treinador de corrida com 10 anos de experiência. Especialista em maratonas.',
    ARRAY['Maratona', 'Meia Maratona', '10km'],
    ARRAY['CREF', 'USATF Level 2'],
    50,
    NOW(), NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    slug = COALESCE(coach_profiles.slug, 'rafinha'),
    updated_at = NOW();

  RAISE NOTICE 'Contas de sistema atualizadas com sucesso.';
END $$;
