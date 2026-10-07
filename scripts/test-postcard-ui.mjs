import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('.impeccable/review/postcards', { recursive: true });

async function runReview() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const results = { mobile: {}, desktop: {} };

  // --- 1. MOBILE PHONE (360x800) ---
  console.log('Testing Mobile Phone (360x800)...');
  const mobileContext = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const pageM = await mobileContext.newPage();
  await pageM.addInitScript(() => {
    localStorage.setItem('arcade-stage1-anniversary', '2023-01-01');
  });
  await pageM.goto('http://localhost:3000');

  // Click Review locally
  const reviewBtn = pageM.getByText(/Review locally/i);
  await reviewBtn.waitFor({ timeout: 5000 });
  await reviewBtn.click();
  await pageM.waitForTimeout(1000);

  // Navigate to Notes tab
  const notesTab = pageM.locator('nav').getByRole('button', { name: /Notes/i });
  await notesTab.click();
  await pageM.waitForTimeout(600);

  // Open Postcard Studio
  const sendPostcardBtn = pageM.getByRole('button', { name: /Send a postcard/i });
  await sendPostcardBtn.click();
  await pageM.waitForTimeout(600);

  // Check Step 0
  const overflow0 = await pageM.evaluate(() => {
    const dialog = document.querySelector('.postcard-studio');
    const stepper = document.querySelector('.postcard-stepper');
    const pill = document.querySelector('.postcard-step-pill');
    return {
      stepperDisplay: window.getComputedStyle(stepper).display,
      stepperGridTemplateColumns: window.getComputedStyle(stepper).gridTemplateColumns,
      pillWidth: pill?.getBoundingClientRect().width,
      stepperWidth: stepper?.getBoundingClientRect().width,
    };
  });
  console.log('Mobile Stepper Styles:', overflow0);
  results.mobile.step0 = overflow0;
  await pageM.screenshot({
    path: '.impeccable/review/postcards/postcard-studio-step0-phone-360.png',
    fullPage: false,
  });

  // Advance to Step 1 (Front Decor)
  const nextBtn = pageM.locator('.postcard-footer-nav button').getByText(/Next/i);
  await nextBtn.click();
  await pageM.waitForTimeout(400);

  // Screenshot Step 1
  await pageM.screenshot({
    path: '.impeccable/review/postcards/postcard-studio-step1-phone-360.png',
    fullPage: false,
  });

  // Click Heart sticker
  const heartSticker = pageM.locator('.postcard-sticker-btn[aria-label="Add Heart sticker"]');
  await heartSticker.click();
  await pageM.waitForTimeout(400);

  // Scroll selected sticker bar into view
  await pageM.locator('.postcard-selected-sticker-bar').scrollIntoViewIfNeeded();
  await pageM.waitForTimeout(300);

  // Screenshot with selected sticker bar
  await pageM.screenshot({
    path: '.impeccable/review/postcards/postcard-studio-step1-selected-phone-360.png',
    fullPage: false,
  });

  // Toggle Draw mode
  const drawBtn = pageM.getByRole('button', { name: /^Draw$/i });
  await drawBtn.click();
  await pageM.waitForTimeout(400);
  await pageM.screenshot({
    path: '.impeccable/review/postcards/postcard-studio-step1-draw-phone-360.png',
    fullPage: false,
  });

  // Switch back to Select & Move
  await pageM.getByRole('button', { name: /Select & Move/i }).click();

  // Advance to Step 2 (Note & Stamp)
  await pageM.locator('.postcard-footer-nav button').getByText(/Next/i).click();
  await pageM.waitForTimeout(400);
  await pageM.screenshot({
    path: '.impeccable/review/postcards/postcard-studio-step2-phone-360.png',
    fullPage: false,
  });

  // Advance to Step 3 (Preview & Send)
  await pageM.locator('.postcard-footer-nav button').getByText(/Next/i).click();
  await pageM.waitForTimeout(400);
  await pageM.screenshot({
    path: '.impeccable/review/postcards/postcard-studio-step3-phone-360.png',
    fullPage: false,
  });

  // Click Discard button in header
  const discardHeaderBtn = pageM.locator('.postcard-studio-header button').getByText(/Discard/i);
  await discardHeaderBtn.click();
  await pageM.waitForTimeout(400);
  await pageM.screenshot({
    path: '.impeccable/review/postcards/postcard-studio-discard-modal-phone-360.png',
    fullPage: false,
  });

  // Cancel discard
  await pageM.locator('.postcard-confirm-dialog button').getByText(/Keep editing/i).click();
  await pageM.waitForTimeout(400);

  // Seal and send to test PostcardViewer
  const sealBtn = pageM.locator('.postcard-hero-send');
  await sealBtn.click();
  await pageM.waitForTimeout(2500); // Wait for sealing animation

  // Now open the sent envelope
  const envelopeBtn = pageM.locator('.postcard-envelope').first();
  await envelopeBtn.click();
  await pageM.waitForTimeout(2200); // Wait for opening animation

  // Screenshot Postcard Viewer
  await pageM.screenshot({
    path: '.impeccable/review/postcards/postcard-viewer-phone-360.png',
    fullPage: false,
  });

  // Click Delete button on viewer
  const deleteBtn = pageM.locator('.postcard-actions button').getByText(/Delete/i);
  await deleteBtn.click();
  await pageM.waitForTimeout(400);
  await pageM.screenshot({
    path: '.impeccable/review/postcards/postcard-viewer-delete-modal-phone-360.png',
    fullPage: false,
  });

  await mobileContext.close();

  // --- 2. DESKTOP / WEB (1280x900) ---
  console.log('Testing Web / Desktop (1280x900)...');
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const pageD = await desktopContext.newPage();
  await pageD.addInitScript(() => {
    localStorage.setItem('arcade-stage1-anniversary', '2023-01-01');
  });
  await pageD.goto('http://localhost:3000');

  await pageD.getByText(/Review locally/i).click();
  await pageD.waitForTimeout(800);
  await pageD.locator('nav').getByRole('button', { name: /Notes/i }).click();
  await pageD.waitForTimeout(500);

  // Open Postcard Studio
  await pageD.getByRole('button', { name: /Send a postcard/i }).click();
  await pageD.waitForTimeout(500);

  await pageD.screenshot({
    path: '.impeccable/review/postcards/postcard-studio-step0-desktop-1280.png',
    fullPage: false,
  });

  // Step 1 on desktop
  await pageD.locator('.postcard-footer-nav button').getByText(/Next/i).click();
  await pageD.waitForTimeout(400);
  await pageD.locator('.postcard-sticker-btn[aria-label="Add Rose sticker"]').click();
  await pageD.waitForTimeout(400);
  await pageD.screenshot({
    path: '.impeccable/review/postcards/postcard-studio-step1-desktop-1280.png',
    fullPage: false,
  });

  // Step 2 on desktop
  await pageD.locator('.postcard-footer-nav button').getByText(/Next/i).click();
  await pageD.waitForTimeout(400);
  await pageD.screenshot({
    path: '.impeccable/review/postcards/postcard-studio-step2-desktop-1280.png',
    fullPage: false,
  });

  // Step 3 on desktop
  await pageD.locator('.postcard-footer-nav button').getByText(/Next/i).click();
  await pageD.waitForTimeout(400);
  await pageD.screenshot({
    path: '.impeccable/review/postcards/postcard-studio-step3-desktop-1280.png',
    fullPage: false,
  });

  // Seal and view on desktop
  const sealBtnD = pageD.locator('.postcard-hero-send');
  await sealBtnD.click();
  await pageD.waitForTimeout(2500);
  const envelopeBtnD = pageD.locator('.postcard-envelope').first();
  await envelopeBtnD.waitFor({ timeout: 5000 });
  await envelopeBtnD.click();
  await pageD.waitForTimeout(2200);
  await pageD.screenshot({
    path: '.impeccable/review/postcards/postcard-viewer-desktop-1280.png',
    fullPage: false,
  });

  await desktopContext.close();
  await browser.close();

  console.log('Review completed successfully with all captures saved!');
}

runReview().catch((err) => {
  console.error('Error during review:', err);
  process.exit(1);
});
