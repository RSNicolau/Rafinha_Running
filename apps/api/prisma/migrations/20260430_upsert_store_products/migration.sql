-- Upsert store products for coach Rafinha (slug = 'rafinha')
-- Images are served from Next.js public/produtos/ folder
-- This script is idempotent: safe to re-run

DO $$
DECLARE
  v_coach_id TEXT;
BEGIN
  -- Get coach id by slug
  SELECT u.id INTO v_coach_id
  FROM users u
  JOIN coach_profiles cp ON cp.user_id = u.id
  WHERE cp.slug = 'rafinha'
  LIMIT 1;

  IF v_coach_id IS NULL THEN
    RAISE NOTICE 'Coach rafinha não encontrado. Pulando upsert de produtos.';
    RETURN;
  END IF;

  -- Camisa RR 2026
  INSERT INTO products (id, coach_id, name, description, category, price_in_cents, images, sizes, colors, total_stock, featured, active, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_coach_id,
    'Camisa RR 2026',
    'Camisa oficial da coleção Rafinha Running 2026. Tecido dry-fit de alta performance, ideal para treinos e provas.',
    'CAMISA', 12990,
    ARRAY['/produtos/camisa_rr_26.jpg'],
    ARRAY['PP','P','M','G','GG','XG'],
    ARRAY['Vermelho','Branco'],
    100, true, true, NOW(), NOW()
  )
  ON CONFLICT DO NOTHING;

  UPDATE products SET
    images = ARRAY['/produtos/camisa_rr_26.jpg'],
    price_in_cents = 12990,
    description = 'Camisa oficial da coleção Rafinha Running 2026. Tecido dry-fit de alta performance, ideal para treinos e provas.',
    sizes = ARRAY['PP','P','M','G','GG','XG'],
    colors = ARRAY['Vermelho','Branco'],
    total_stock = 100, featured = true, active = true, updated_at = NOW()
  WHERE coach_id = v_coach_id AND name = 'Camisa RR 2026';

  -- Casaco RR 2026
  INSERT INTO products (id, coach_id, name, description, category, price_in_cents, images, sizes, colors, total_stock, featured, active, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_coach_id,
    'Casaco RR 2026',
    'Casaco oficial RR 2026. Conforto e estilo para o dia a dia e treinos em dias mais frios.',
    'CASACO', 18990,
    ARRAY['/produtos/casaco_rr_26.jpg'],
    ARRAY['PP','P','M','G','GG','XG'],
    ARRAY['Preto','Vermelho'],
    60, true, true, NOW(), NOW()
  )
  ON CONFLICT DO NOTHING;

  UPDATE products SET
    images = ARRAY['/produtos/casaco_rr_26.jpg'],
    price_in_cents = 18990,
    description = 'Casaco oficial RR 2026. Conforto e estilo para o dia a dia e treinos em dias mais frios.',
    sizes = ARRAY['PP','P','M','G','GG','XG'],
    colors = ARRAY['Preto','Vermelho'],
    total_stock = 60, featured = true, active = true, updated_at = NOW()
  WHERE coach_id = v_coach_id AND name = 'Casaco RR 2026';

  -- Corta-vento RR 2026
  INSERT INTO products (id, coach_id, name, description, category, price_in_cents, images, sizes, colors, total_stock, featured, active, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_coach_id,
    'Corta-vento RR 2026',
    'Corta-vento leve e impermeável da coleção RR 2026. Perfeito para treinos em dias de vento e garoa.',
    'CORTA_VENTO', 15990,
    ARRAY['/produtos/corta_vento_rr_26.jpg'],
    ARRAY['PP','P','M','G','GG','XG'],
    ARRAY['Preto'],
    50, false, true, NOW(), NOW()
  )
  ON CONFLICT DO NOTHING;

  UPDATE products SET
    images = ARRAY['/produtos/corta_vento_rr_26.jpg'],
    price_in_cents = 15990,
    description = 'Corta-vento leve e impermeável da coleção RR 2026. Perfeito para treinos em dias de vento e garoa.',
    sizes = ARRAY['PP','P','M','G','GG','XG'],
    colors = ARRAY['Preto'],
    total_stock = 50, featured = false, active = true, updated_at = NOW()
  WHERE coach_id = v_coach_id AND name = 'Corta-vento RR 2026';

  -- Viseira RR 2026
  INSERT INTO products (id, coach_id, name, description, category, price_in_cents, images, sizes, colors, total_stock, featured, active, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_coach_id,
    'Viseira RR 2026',
    'Viseira RR 2026 com proteção UV. Leve, regulável e ideal para corridas ao sol.',
    'VISEIRA', 6990,
    ARRAY['/produtos/viseira_rr_26.jpg'],
    ARRAY['Único'],
    ARRAY['Vermelho','Preto'],
    80, false, true, NOW(), NOW()
  )
  ON CONFLICT DO NOTHING;

  UPDATE products SET
    images = ARRAY['/produtos/viseira_rr_26.jpg'],
    price_in_cents = 6990,
    description = 'Viseira RR 2026 com proteção UV. Leve, regulável e ideal para corridas ao sol.',
    sizes = ARRAY['Único'],
    colors = ARRAY['Vermelho','Preto'],
    total_stock = 80, featured = false, active = true, updated_at = NOW()
  WHERE coach_id = v_coach_id AND name = 'Viseira RR 2026';

  -- Camisa São Garrafa
  INSERT INTO products (id, coach_id, name, description, category, price_in_cents, images, sizes, colors, total_stock, featured, active, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_coach_id,
    'Camisa São Garrafa',
    'Camisa especial edição São Garrafa. Exclusiva e limitada para os atletas RR.',
    'CAMISA', 12990,
    ARRAY['/produtos/camisa_sao_garrafa_v3.jpg','/produtos/camisa_sao_garrafa_v2.jpg'],
    ARRAY['PP','P','M','G','GG','XG'],
    ARRAY['Branco'],
    40, false, true, NOW(), NOW()
  )
  ON CONFLICT DO NOTHING;

  UPDATE products SET
    images = ARRAY['/produtos/camisa_sao_garrafa_v3.jpg','/produtos/camisa_sao_garrafa_v2.jpg'],
    price_in_cents = 12990,
    description = 'Camisa especial edição São Garrafa. Exclusiva e limitada para os atletas RR.',
    sizes = ARRAY['PP','P','M','G','GG','XG'],
    colors = ARRAY['Branco'],
    total_stock = 40, featured = false, active = true, updated_at = NOW()
  WHERE coach_id = v_coach_id AND name = 'Camisa São Garrafa';

  RAISE NOTICE 'Produtos da loja atualizados para coach %', v_coach_id;
END $$;
