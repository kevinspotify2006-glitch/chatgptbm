# API key security

Business Manager must never ship an OpenRouter API key to the browser.

## Required deployment configuration

Set `OPENROUTER_API_KEY` as a **server-side environment variable** in the deployment platform (for example Vercel Project Settings → Environment Variables). Never put it in:

- `VITE_*` variables
- `import.meta.env` client code
- `localStorage`, cookies, IndexedDB, or URL parameters
- source files, `.env` files committed to Git
- HTML or JavaScript bundles

The browser should call `/api/ai`. The serverless function adds the secret `Authorization` header and forwards the request to OpenRouter. The secret is therefore not delivered to the client.

If a key was ever committed to the repository or exposed in a client bundle, revoke/rotate it at OpenRouter immediately and replace the server-side secret.

This repository intentionally contains no API key.
