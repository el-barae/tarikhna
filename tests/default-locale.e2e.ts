import {test,expect} from '@playwright/test';

// A first visit has no stored preference: the atlas must open in Arabic its default locale.
test.use({storageState:{cookies:[],origins:[]}});

test('a first visit opens in Arabic RTL without a stored preference',async({page})=>{
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang','ar');
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await expect(page.getByRole('checkbox',{name:'المدن التاريخية'})).toBeVisible();
  await expect(page.locator('.language-menu-button')).toContainText('العربية');
});
