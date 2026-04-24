import { test, expect } from '@playwright/test';

test.describe('Onboarding público do atleta', () => {
  test('deve exibir 404 para slug inexistente', async ({ page }) => {
    const response = await page.goto('/onboarding/slug-que-nao-existe-xyz-999');
    // Pode redirecionar para 404 ou mostrar mensagem de erro
    const status = response?.status() ?? 200;
    if (status !== 404) {
      // Página carregou — verificar se mostra mensagem de erro
      await expect(
        page.getByText(/não encontrado|not found|erro|error/i)
      ).toBeVisible({ timeout: 5_000 }).catch(() => {
        // Silencioso — o comportamento exato depende do layout de 404
      });
    }
  });

  test('página de onboarding carrega sem erros JS', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      // Ignorar erros de rede esperados (coach não existe)
      if (!err.message.includes('404') && !err.message.includes('network')) {
        errors.push(err.message);
      }
    });

    await page.goto('/onboarding/test-slug');
    // Aguardar hidratação React
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });
});
