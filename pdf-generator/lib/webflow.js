// Minimal Webflow Data API v2 client: just what the PDF sync needs.
// Uses Node's built-in fetch, FormData and Blob (Node 22), so no dependencies.
'use strict';

const API = 'https://api.webflow.com/v2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The asset upload details can come back camelCased; S3 needs its own names.
const S3_FIELDS = {
  xAmzAlgorithm: 'X-Amz-Algorithm',
  xAmzCredential: 'X-Amz-Credential',
  xAmzDate: 'X-Amz-Date',
  xAmzSignature: 'X-Amz-Signature',
  policy: 'Policy',
  successActionStatus: 'success_action_status',
  contentType: 'Content-Type',
  cacheControl: 'Cache-Control',
};

function client(token) {
  if (!token) throw new Error('WEBFLOW_TOKEN is not set');

  async function call(method, path, body) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(API + path, {
        method,
        headers: {
          authorization: 'Bearer ' + token,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 && attempt < 6) {
        const wait = Number(res.headers.get('retry-after')) || 2 ** attempt;
        await sleep(wait * 1000);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
      }
      return res.status === 204 ? null : res.json();
    }
  }

  async function listItems(collectionId, { live = false } = {}) {
    const items = [];
    for (let offset = 0; ; offset += 100) {
      const d = await call('GET', `/collections/${collectionId}/items${live ? '/live' : ''}?limit=100&offset=${offset}`);
      items.push(...d.items);
      const total = d.pagination ? d.pagination.total : items.length;
      if (items.length >= total || d.items.length < 100) return items;
    }
  }

  async function updateItems(collectionId, items, { live = false } = {}) {
    return call('PATCH', `/collections/${collectionId}/items${live ? '/live' : ''}`, { items });
  }

  async function uploadAsset(siteId, fileName, buffer, md5) {
    const meta = await call('POST', `/sites/${siteId}/assets`, { fileName, fileHash: md5 });
    const form = new FormData();
    for (const [k, v] of Object.entries(meta.uploadDetails)) form.append(S3_FIELDS[k] || k, String(v));
    form.append('file', new Blob([buffer], { type: 'application/pdf' }), fileName);
    const res = await fetch(meta.uploadUrl, { method: 'POST', body: form });
    if (res.status !== 201) throw new Error(`Upload of ${fileName} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return { id: meta.id, url: meta.hostedUrl };
  }

  async function listAssets(siteId) {
    const assets = [];
    for (let offset = 0; ; offset += 100) {
      const d = await call('GET', `/sites/${siteId}/assets?limit=100&offset=${offset}`);
      const page = d.assets || [];
      assets.push(...page);
      const total = d.pagination ? d.pagination.total : null;
      if (page.length < 100 || (total !== null && assets.length >= total)) return assets;
    }
  }

  const deleteAsset = (assetId) => call('DELETE', `/assets/${assetId}`);

  return { listItems, updateItems, uploadAsset, listAssets, deleteAsset };
}

module.exports = { client };
