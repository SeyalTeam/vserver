# RunCloud Clone - Fresh Start

This repository has been reset and restarted from scratch.

## Preserved folder
- `CALL TAXI` (kept untouched as requested)

## New starter layout
- `apps/control-plane` - Fastify TypeScript API
- `apps/dashboard` - React + Vite admin UI
- `packages/shared` - shared types/contracts
- `scripts/setup-local-mongo-replica.sh` - local Mongo replica set bootstrap
- `scripts/deploy-tracker.sh` - server-side deployment tracker
- `scripts/install-server-tracker.sh` - installer to droplet via SSH
- `docs` - product and architecture notes

## Quick start
1. `npm install`
2. `npm run setup:mongo-rs`
3. `npm run dev:api`
4. `npm run dev:web`

API default URL: `http://localhost:3000`
Dashboard URL: `http://localhost:5173`

## Deployment tracking
1. Install tracker on droplet:
   `npm run tracker:install -- root@YOUR_DROPLET_IP "/var/www/projects/cab-services/kani-taxi" kani-taxi`
2. Run deploy command through wrapper on server:
   `./deploy-with-track.sh <deploy-command>`
3. Configure API to read remote tracker in `.env`:
   - `DEPLOY_TRACKER_REMOTE_HOST=root@YOUR_DROPLET_IP`
   - `DEPLOY_TRACKER_REMOTE_LOG_PATH=~/.runcloud-clone/deployments.jsonl`
4. Enable webhook auto deploy:
   - `AUTO_DEPLOY_ENABLED=true`
   - `AUTO_DEPLOY_WEBHOOK_TOKEN=<random-token>`
   - `AUTO_DEPLOY_PROJECTS=[{"projectName":"KANI TAXI","repository":"SeyalTeam/CallTAXI","branch":"main","repoPath":"/var/www/projects/cab-services/kani-taxi","deployCommand":"pnpm install && pnpm run build && systemctl restart calltaxi.service"}]`

See `/Users/castromurugan/Documents/VSeyal/vserver/docs/server-tracker.md` for full flow.
