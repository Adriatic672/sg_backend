# socialgems

Backend service for the SocialGems platform (agents, campaigns, influencer search and validation).

---

## Environments & URLs

- **API base URL (staging)**: https://gems.tekjuice.xyz
- **Web panel (brands/agents)**: https://sg-web.tekjuice.xyz/login
- **Admin panel**: https://sg-admin.tekjuice.xyz/login/

---

## Getting Started (Local Development)

1. **Install dependencies**
   - `npm install`
2. **Configure environment**
   - Create and configure your environment variables (database connection, JWT secrets, email provider, etc.) as expected by `src/app.ts` and the DB config.
3. **Prepare the database**
   - Either load the main SQL snapshot: `social_gems.sql`
   - Or run migrations:
     - `npm run migrate` (apply latest migrations)
     - `npm run migrate:status` (check status)
4. **Run the service**
   - Development: `npm run dev`
   - Production: `npm start`
5. **Call the API**
   - Point your API client/Postman `baseUrl` to your running server (e.g. `http://localhost:3000` in dev, or `https://gems.tekjuice.xyz` for staging).

---

## Core Guides in This Repo

- **Agent setup & workflows**: `AGENT_SETUP_GUIDE.md`  
  - How to run agent-related migrations, set up test agents, and exercise the main agent flows.
- **Agent API endpoints**: `AGENTS_API_ENDPOINTS.md`  
  - Detailed request/response documentation for login, profile, business selection, campaigns, and password flows.
- **Search validation system**: `SEARCH_VALIDATION_GUIDE.md`  
  - How we lock down influencer search results so agents can only adjust budgets/amounts, not which influencers are selected.

These markdown files are the source of truth for those domains; start here when working on or debugging those areas.

---

## API Documentation & Postman Collection

For full endpoint details and example requests, use the Postman collection:

- [SocialGems Postman Documentation](https://documenter.getpostman.com/view/3143535/2sAXxPACoK)

In Postman, set:

- `baseUrl` → `https://gems.tekjuice.xyz` (or your local API URL)
- Auth/environment variables (e.g. `agentJWT`, `agentId`, `businessId`) according to the flows described in `AGENT_SETUP_GUIDE.md` and `AGENTS_API_ENDPOINTS.md`.