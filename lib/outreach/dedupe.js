'use strict';

/**
 * Deduplicate incoming leads against existing Notion records.
 * Matching rules (any one sufficient):
 *   1. Website domain matches (strongest signal)
 *   2. Email matches (when both present)
 *   3. Normalised business name matches (fallback when both lack a domain)
 */

function normalizeDomain(url) {
  if (!url) return null;
  try {
    const raw = url.startsWith('http') ? url : `https://${url}`;
    return new URL(raw).hostname.replace(/^www\./, '').toLowerCase().trim();
  } catch {
    return null;
  }
}

function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Returns true if newLead matches any entry in existingLeads.
 * @param {{ website?:string, email?:string, business?:string }} newLead
 * @param {Array<{ website?:string, email?:string, business?:string }>} existingLeads
 */
function isDuplicate(newLead, existingLeads) {
  const newDomain = normalizeDomain(newLead.website);
  const newEmail  = (newLead.email || '').toLowerCase().trim();
  const newName   = normalizeName(newLead.business || newLead.name);

  return existingLeads.some(existing => {
    const exDomain = normalizeDomain(existing.website);
    const exEmail  = (existing.email || '').toLowerCase().trim();
    const exName   = normalizeName(existing.business || existing.name);

    if (newDomain && exDomain && newDomain === exDomain) return true;
    if (newEmail  && exEmail  && newEmail  === exEmail)  return true;
    // Name-only match only when both sides have no domain (avoids false positives)
    if (!newDomain && !exDomain && newName && exName && newName === exName) return true;

    return false;
  });
}

module.exports = { isDuplicate, normalizeDomain, normalizeName };
