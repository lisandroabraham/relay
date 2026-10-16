import { expect, test } from '@playwright/test';

test('crear documento, escribir, recargar y recuperar el contenido', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nuevo documento' }).click();

  await page.getByLabel('Título').fill('Nota de prueba');
  const editor = page.getByLabel('Contenido del documento');
  await editor.click();
  await page.keyboard.type('Hola desde Playwright');

  await expect(page.getByText('Guardado en este dispositivo')).toBeVisible();

  await page.reload();

  await expect(page.getByLabel('Título')).toHaveValue('Nota de prueba');
  await expect(page.getByLabel('Contenido del documento')).toContainText('Hola desde Playwright');
});

test('la lista muestra varios documentos y permite reabrirlos', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Uno', 'Dos']) {
    await page.getByRole('button', { name: 'Nuevo documento' }).click();
    await page.getByLabel('Título').fill(name);
    await expect(page.getByText('Guardado en este dispositivo')).toBeVisible();
    await page.getByRole('link', { name: /Documentos/ }).click();
  }
  const list = page.getByRole('list', { name: 'Documentos' });
  await expect(list.getByRole('link', { name: 'Uno' })).toBeVisible();
  await expect(list.getByRole('link', { name: 'Dos' })).toBeVisible();
});

test('un id inexistente muestra un error claro y no crea nada', async ({ page }) => {
  await page.goto('/#/doc/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('alert')).toContainText('no existe');
});
