# Server Deploy Tracker

This tracker records deployment events on the target server and combines:
- Git metadata (commit hash, branch, message, author)
- Server metadata (hostname, user, timestamp)
- Deployment metadata (status, duration, environment)

## 1. Install tracker on server

From local machine:

```bash
cd /Users/castromurugan/Documents/VSeyal/vserver
npm run tracker:install -- root@YOUR_DROPLET_IP "/var/www/projects/cab-services/kani-taxi" kani-taxi
```

This installs:
- `~/.runcloud-clone/bin/deploy-tracker.sh`
- `/var/www/projects/cab-services/kani-taxi/deploy-with-track.sh`
- log file `~/.runcloud-clone/deployments.jsonl`

## 2. Run tracked deployment on server

```bash
cd "/var/www/projects/cab-services/kani-taxi"
./deploy-with-track.sh <your-real-deploy-command>
```

Example:

```bash
./deploy-with-track.sh bash scripts/deploy.sh
```

## 3. Read tracker from control-plane

Set in `/Users/castromurugan/Documents/VSeyal/vserver/.env`:

```bash
DEPLOY_TRACKER_REMOTE_HOST=root@YOUR_DROPLET_IP
DEPLOY_TRACKER_REMOTE_LOG_PATH=~/.runcloud-clone/deployments.jsonl
```

Then restart API:

```bash
npm run dev:api
```

Deployments API uses tracker only:
1. remote server tracker log (when `DEPLOY_TRACKER_REMOTE_HOST` is set)
2. local tracker log (when remote host is not set)

## 4. Auto deploy from Git push webhook

Control-plane now supports GitHub push webhooks at:

```bash
POST /v1/webhooks/github
```

Configure in `/Users/castromurugan/Documents/VSeyal/vserver/.env`:

```bash
AUTO_DEPLOY_ENABLED=true
AUTO_DEPLOY_WEBHOOK_TOKEN=your-long-random-token
AUTO_DEPLOY_TIMEOUT_SEC=900
AUTO_DEPLOY_REMOTE_HOST=root@YOUR_DROPLET_IP
AUTO_DEPLOY_PROJECTS=[{"projectName":"KANI TAXI","repository":"SeyalTeam/CallTAXI","branch":"main","repoPath":"/var/www/projects/cab-services/kani-taxi","deployCommand":"pnpm install && pnpm run build && systemctl restart calltaxi.service","environment":"Production"}]
```

Notes:
- `AUTO_DEPLOY_PROJECTS` is a JSON array.
- `repository` can be full name (`owner/repo`) or repo name (`repo`).
- `branch` can be `*` to match all branches.
- `remoteHost` is optional per project entry; if omitted, `AUTO_DEPLOY_REMOTE_HOST` is used.
- If `./deploy-with-track.sh` exists in `repoPath`, webhook deploy uses it automatically.

In GitHub webhook settings:
1. Payload URL: `http://YOUR_CONTROL_PLANE_HOST:3000/v1/webhooks/github?token=your-long-random-token`
2. Content type: `application/json`
3. Events: `Just the push event`

After saving `.env`, restart API:

```bash
npm run dev:api
```
