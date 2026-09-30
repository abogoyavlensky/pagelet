// Shared steps. Each spec creates its own site on a unique domain and
// deletes it at the end, so specs never depend on each other or on what
// the site list holds.
import { expect } from '@playwright/test';
import { password } from '../playwright.config.js';

export function uniqueDomain(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.test`;
}

// Sign the API request context in; its cookie jar keeps the session.
export async function apiLogin(request) {
  const res = await request.post('/api/login', { data: { password } });
  expect(res.status()).toBe(200);
}

export async function createSite(request, name, domain) {
  const res = await request.post('/api/sites', { data: { name, domain } });
  expect(res.status()).toBe(201);
  return res.json();
}

export async function deleteSite(request, id) {
  const res = await request.delete(`/api/sites/${id}`);
  expect(res.status()).toBe(200);
}

export async function stats(request, id, period = 'today') {
  const res = await request.get(`/api/sites/${id}/stats?period=${period}`);
  expect(res.status()).toBe(200);
  return res.json();
}

export async function online(request, id) {
  return (await (await request.get(`/api/sites/${id}/realtime`)).json()).online;
}
