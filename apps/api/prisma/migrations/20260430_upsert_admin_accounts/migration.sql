-- Upsert system accounts with correct roles
-- master@rafinharunning.com → SUPER_ADMIN (platform owner)
-- rafinha@rafinharunning.com.br → ADMIN (coach/manager, existing account updated)
-- Passwords are bcrypt hashed (cost 12). Safe to re-run.

DO $$
DECLARE
  v_master_id TEXT;
  v_rafinha_id TEXT;
BEGIN
  -- ── Master SUPER_ADMIN (new clean account, no coach profile needed) ──
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

  -- ── Rafinha ADMIN (update existing .com.br account, keep coach profile + slug intact) ──
  -- This preserves all athletes, products, and data linked to this user
  UPDATE users SET
    role = 'ADMIN',
    password_hash = '$2b$12$llAd98SqAm6E3UoivTwvuOeDa4ocydjSgHwQnQCHThsNP84gbKsMe', -- Rafinhaadmin123@
    is_active = true,
    updated_at = NOW()
  WHERE email = 'rafinha@rafinharunning.com.br';

  SELECT id INTO v_rafinha_id FROM users WHERE email = 'rafinha@rafinharunning.com.br';
  RAISE NOTICE 'Rafinha ADMIN id: % (role updated to ADMIN)', v_rafinha_id;

  -- Ensure coach profile has slug (in case it was null)
  UPDATE coach_profiles SET
    slug = 'rafinha',
    updated_at = NOW()
  WHERE user_id = v_rafinha_id AND (slug IS NULL OR slug = '');

  RAISE NOTICE 'Contas de sistema atualizadas com sucesso.';
END $$;
