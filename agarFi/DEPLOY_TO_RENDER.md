# Deploy AgarFi to Render

## Step 1: Push to GitHub

```bash
cd C:\Users\perci\source\repos\ShitcoinApps\AGARw3
git add agarFi
git commit -m "Add AgarFi Phase 1"
git push
```

## Step 2: Deploy Server

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repo: `Tanner253/AGARw3` (or argarfi)
4. Settings:
   - **Name**: `agarfi-server`
   - **Root Directory**: `agarFi/packages/server`
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Add Environment Variables:
   - `NODE_ENV` = `production`
   - `MIN_PLAYERS_DEV` = `10`
   - `AUTO_FILL_BOTS` = `false`
6. Click "Create Web Service"
7. Wait for deployment (~3 minutes)
8. **Copy the URL**: `https://agarfi-server.onrender.com`

## Step 3: Deploy Client

1. Click "New +" → "Web Service"
2. Same repo
3. Settings:
   - **Name**: `agarfi-client`
   - **Root Directory**: `agarFi/packages/client`
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add Environment Variable:
   - `NEXT_PUBLIC_SOCKET_URL` = `https://agarfi-server.onrender.com` (from Step 2)
5. Click "Create Web Service"
6. Wait for deployment

## Step 4: Update CORS

After client deploys, update server environment:
- Add `CLIENT_URL` = `https://agarfi-client.onrender.com`
- Redeploy server

## Done!

Your game will be live at: `https://agarfi-client.onrender.com`

**Note**: Free tier spins down after 15 min inactivity. First load takes ~30s.

