# Website Structure

The website has been restored to the original root-file layout so the current pages and routes keep running.

## Current Layout

- Public pages live at the root, for example `index.html`, `services.html`, `service-detail.html`, `pricing.html`, and `contact.html`.
- Organization flow files live at the root, for example `organization-register.html`, `organization-register.js`, `portal-selection.html`, and `portal-selection.js`.
- Portal files live at the root, for example `Agent.html`, `agent.css`, `agent.js`, `Branch.html`, `branch.css`, and `branch.js`.
- Shared browser scripts live at the root, for example `enterprise-core.js`, `enterprise-store.js`, `kv-client.js`, and `pwa.js`.
- Images stay inside `images/`.
- Backend/server files stay inside `api/`, `server/`, and `serverless-handlers/`.

This layout is less organized than the feature-folder idea, but it matches the existing route assumptions and keeps the site running.
