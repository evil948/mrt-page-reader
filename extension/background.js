'use strict';

const MENU_SPEAK = 'mrt-plus-speak';
const MENU_SELECTION = 'mrt-plus-speak-selection';
const MENU_STOP = 'mrt-plus-stop';

function createMenus() {
  browser.menus.removeAll().finally(() => {
    browser.menus.create({
      id: MENU_SPEAK,
      title: 'MRT+: озвучить страницу',
      contexts: ['page', 'editable', 'frame'],
    });
    browser.menus.create({
      id: MENU_SELECTION,
      title: 'MRT+: озвучить выделенное',
      contexts: ['selection'],
    });
    browser.menus.create({
      id: MENU_STOP,
      title: 'MRT+: стоп',
      contexts: ['page', 'selection', 'editable', 'frame'],
    });
  });
}

async function sendToTab(tabId, message) {
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch (err) {
    console.warn('[MRT+] content script:', err?.message || err);
  }
}

browser.runtime.onInstalled.addListener(createMenus);
browser.runtime.onStartup.addListener(createMenus);
createMenus();

browser.menus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === MENU_SPEAK) {
    await sendToTab(tab.id, { type: 'mrt-plus', action: 'speak' });
  } else if (info.menuItemId === MENU_SELECTION) {
    await sendToTab(tab.id, { type: 'mrt-plus', action: 'speak-selection' });
  } else if (info.menuItemId === MENU_STOP) {
    await sendToTab(tab.id, { type: 'mrt-plus', action: 'stop' });
  }
});

browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'mrt-plus-toggle') return;
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: 'mrt-plus', action: 'toggle' });
});
