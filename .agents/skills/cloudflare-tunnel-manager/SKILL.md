---
name: cloudflare-tunnel-manager
description: Manage Cloudflare Tunnel routes, DNS CNAME records, and STB tunnel deployments via API & SSH. Use when developers ask to add, list, delete, or update Cloudflare tunnel routes, DNS records, or manage cloudflared tunnels on STB/remote servers.
---

# Cloudflare Tunnel & DNS Manager

This skill governs the automated management of Cloudflare Tunnels, API-based ingress routes, and DNS CNAME record provisionings across local STB servers (`ARMBIAN-STB-1` & `ARMBIAN-STB-2`) and Cloudflare Edge.

---

## Infrastructure Topology

| Resource | Value / Location | Description |
|---|---|---|
| **STB-1 Controller** | `vcless@192.168.100.61` | Tunnel configuration, scripts, and API manager root (`~/stack/cloudflare`) |
| **STB-2 Runner** | `vcless@192.168.100.64` | `cloudflared_tunnel` Docker container runner |
| **Tunnel ID** | `2caebf5e-d9ea-42cd-926d-eeb1f93a0c53` | Cloudflare Dashboard-Managed Tunnel ID |
| **Tunnel CNAME Target** | `2caebf5e-d9ea-42cd-926d-eeb1f93a0c53.cfargotunnel.com` | Target CNAME for proxied DNS records |
| **Credentials File** | `~/stack/cloudflare/.env` | Holds `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_TUNNEL_ID` |

---

## Operational Workflows

### 1. List Active Tunnel Routes

View all ingress routes currently registered on the Cloudflare Tunnel edge:

```bash
ssh -o StrictHostKeyChecking=no vcless@192.168.100.61 "cd ~/stack/cloudflare && ./manage-routes.sh list"
```

---

### 2. Add / Update a Tunnel Ingress Route

Route a new hostname (e.g. `scrapper.wat-playground.my.id`) to a local or remote target service (e.g. `http://43.129.206.190:3000`):

```bash
ssh -o StrictHostKeyChecking=no vcless@192.168.100.61 "cd ~/stack/cloudflare && ./manage-routes.sh add <hostname> <service_url>"
```

*Example:*
```bash
ssh -o StrictHostKeyChecking=no vcless@192.168.100.61 "cd ~/stack/cloudflare && ./manage-routes.sh add scrapper.wat-playground.my.id http://43.129.206.190:3000"
```

---

### 3. Delete a Tunnel Ingress Route

Remove an existing hostname route from the Cloudflare Tunnel ingress configuration:

```bash
ssh -o StrictHostKeyChecking=no vcless@192.168.100.61 "cd ~/stack/cloudflare && ./manage-routes.sh delete <hostname>"
```

---

### 4. Create Cloudflare DNS CNAME Record (Automated)

Adding a tunnel route handles ingress forwarding at the edge, but the domain's DNS CNAME record must also point to the Tunnel CNAME.

#### Step A: Query Zone ID
```bash
node -e "fetch('https://api.cloudflare.com/client/v4/zones?name=<domain_name>', {headers: {'Authorization': 'Bearer <token>'}}).then(r=>r.json()).then(d=>console.log(d.result[0].id));"
```

#### Step B: Post CNAME DNS Record
```bash
node -e "fetch('https://api.cloudflare.com/client/v4/zones/<zone_id>/dns_records', {method: 'POST', headers: {'Authorization': 'Bearer <token>', 'Content-Type': 'application/json'}, body: JSON.stringify({type: 'CNAME', name: '<subdomain>', content: '2caebf5e-d9ea-42cd-926d-eeb1f93a0c53.cfargotunnel.com', ttl: 1, proxied: true})}).then(r=>r.json()).then(console.log);"
```

---

### 5. Sync Configuration & Restart Tunnel Container

When updating `config_actual.yml` directly, sync the configuration file to `STB-2` and restart the `cloudflared_tunnel` docker container:

```bash
ssh -o StrictHostKeyChecking=no vcless@192.168.100.61 "cd ~/stack/cloudflare && ./sync-and-restart.sh"
```

---

## Completion Criteria

- [ ] Route is visible in `./manage-routes.sh list`.
- [ ] Cloudflare DNS returns `200 OK` on `curl -I https://<hostname>/<endpoint>`.
- [ ] Both HTTPS certificate and proxy status (`Server: cloudflare`) are active.
