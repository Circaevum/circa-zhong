# Nakama HTTPS setup – progress notes

**Last updated:** 2026-02-09

## Goal
Get the Zhong app (GitHub Pages) talking to Nakama over HTTPS so login/sync work without "Mixed Content" or `ERR_SSL_PROTOCOL_ERROR`. Nakama runs on a DigitalOcean droplet; it needs to be fronted by nginx + Let's Encrypt.

## Done

- **GitHub Pages / Zhong app**
  - App is live at https://circaevum.github.io/circa-zhong/
  - Vite `base: '/circa-zhong/'` fixed so assets load.
  - Nakama is optional: no env → offline/local-only mode (no throw).
  - Deploy workflow uses repo **Variables** (`VITE_NAKAMA_HOST`, `VITE_NAKAMA_PORT`, `VITE_NAKAMA_SCHEME`) and **Secret** (`VITE_NAKAMA_SERVER_KEY`).
  - Pages source is **GitHub Actions** (not “Deploy from a branch”).

- **DNS**
  - `nakama.circaevum.com` A record → `142.93.251.136` (Squarespace DNS). Verified with `nslookup nakama.circaevum.com`.

- **Droplet**
  - Ubuntu 16.04.6 LTS, IP `142.93.251.136`, hostname `ubuntu-droplet`.
  - Root password was reset via DigitalOcean; new SSH key added in DO account (SSH to droplet still fails with “Permission denied (publickey)” — key not in droplet `authorized_keys`).
  - Apt sources switched to `old-releases.ubuntu.com` (16.04 EOL).
  - **nginx** and **certbot** installed (`sudo apt install -y nginx certbot`; no `python3-certbot-nginx` on 16.04).

- **Repo / scripts**
  - `setup-nakama-https-circaevum.sh` – full HTTPS setup for `nakama.circaevum.com`.
  - `setup-nakama-https.sh` – generic version.
  - `setup-self-signed-ssl.sh` – self-signed cert (IP-only).
  - `droplet-paste-block.sh` – single block to paste on droplet: writes nginx config, enables site, tests and restarts nginx (no certbot step).

## Not done / where we stopped

- **Nginx config on droplet**
  - Config for `nakama.circaevum.com` proxying to `localhost:7350` was **not** written to `/etc/nginx/sites-available/nakama` (or not verified).
  - Site not enabled, nginx not restarted with that config.

- **SSL certificate**
  - Certbot not run. Certificate for `nakama.circaevum.com` not obtained.

- **SSH from Mac**
  - `ssh root@142.93.251.136` and `ssh -i ~/.ssh/id_ed25519 root@142.93.251.136` → “Permission denied (publickey)”.
  - To fix: from Recovery Console (password login), add Mac’s public key to droplet:
    - `/bin/mkdir -p ~/.ssh`
    - `/bin/echo "ssh-ed25519 AAAA...your-key..." >> ~/.ssh/authorized_keys`
    - `/bin/chmod 700 ~/.ssh`
    - `/bin/chmod 600 ~/.ssh/authorized_keys`
  - If the console mangles input, use full paths (`/bin/mkdir`, `/bin/echo`, `/bin/chmod`).

- **GitHub Actions variables (for after HTTPS works)**
  - Set: `VITE_NAKAMA_SCHEME=https`, `VITE_NAKAMA_HOST=nakama.circaevum.com`, `VITE_NAKAMA_PORT=443`.
  - Then push or re-run deploy so the app uses HTTPS and the new host.

## Droplet console quirk
- Console appeared to send all input as uppercase (e.g. `SUDO`/`MKDIR`), or PATH was broken so `mkdir` wasn’t found. Workaround: paste from Mac (preserves case) or use full paths (e.g. `/bin/mkdir`).

## Next steps (when resuming)

1. Get shell on droplet: either fix SSH (add key via Recovery Console) or use DigitalOcean browser console with root password.
2. Create nginx config: paste and run `droplet-paste-block.sh` (or run `ssh root@142.93.251.136 'bash -s' < droplet-paste-block.sh` if SSH works).
3. Get certificate (webroot; nginx plugin not on 16.04):  
   `sudo certbot certonly --webroot -w /var/www/html -d nakama.circaevum.com --non-interactive --agree-tos --email adam@circaevum.com`
4. Add HTTPS server block to `/etc/nginx/sites-available/nakama` (after the existing `listen 80` block), then `sudo nginx -t && sudo systemctl reload nginx`:

```nginx
server {
    listen 443 ssl http2;
    server_name nakama.circaevum.com;
    ssl_certificate /etc/letsencrypt/live/nakama.circaevum.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nakama.circaevum.com/privkey.pem;
    location / {
        proxy_pass http://localhost:7350;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

5. Set GitHub Actions variables: `VITE_NAKAMA_SCHEME=https`, `VITE_NAKAMA_HOST=nakama.circaevum.com`, `VITE_NAKAMA_PORT=443`; redeploy Zhong.
6. **If you see CORS "multiple values"** (`'*, https://circaevum.github.io'`): Nakama sends `*` and nginx adds our origin. Fix by stripping Nakama’s CORS headers so only nginx sends them. In the 443 `location /` block, right after `location / {`, add:
   ```nginx
   proxy_hide_header Access-Control-Allow-Origin;
   proxy_hide_header Access-Control-Allow-Credentials;
   ```
   Then `sudo nginx -t && sudo systemctl reload nginx`. See `docs/nginx-cors-snippet.conf` (updated with these lines).
7. Test https://circaevum.github.io/circa-zhong/ → Login and sync against https://nakama.circaevum.com.

## Reference

| Item | Value |
|------|--------|
| Droplet IP | 142.93.251.136 |
| Nakama domain | nakama.circaevum.com |
| Nakama local port | 7350 |
| Zhong app (production) | https://circaevum.github.io/circa-zhong/ |
| Repo | Circaevum/circa-zhong |
